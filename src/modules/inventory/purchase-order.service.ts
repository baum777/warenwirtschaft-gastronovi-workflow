import type {
  CreatePurchaseOrderInput,
  PurchaseOrderDto,
  PurchaseOrderReadDto
} from "./inventory.schemas.js";

type PurchaseOrderStatus = PurchaseOrderDto["status"];

class PurchaseOrderConflictError extends Error {
  public readonly statusCode = 409;
}

type PurchaseOrderRecord = {
  id: string;
  status: PurchaseOrderStatus;
  items?: Array<{ id: string; receivedQty?: number }>;
};

type PurchaseOrderReadRecord = {
  id: string;
  status: PurchaseOrderStatus;
  supplierId: string | null;
  supplier?: {
    name: string;
  } | null;
  createdById: string;
  orderedAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    inventoryItemId: string;
    inventoryItem?: {
      name: string;
    } | null;
    orderedQty: number;
    receivedQty: number;
    unit: string;
    note: string | null;
  }>;
};

export type PurchaseOrderDatabaseClient = {
  purchaseOrder: {
    create(args: {
      data: {
        supplierId?: string;
        note?: string;
        createdById: string;
        items: {
          create: Array<{
            inventoryItemId: string;
            orderedQty: number;
            unit: string;
            note?: string;
          }>;
        };
      };
      include: {
        items: true;
      };
    }): Promise<PurchaseOrderRecord>;
    findMany?(args: unknown): Promise<PurchaseOrderReadRecord[]>;
    findUnique(args: {
      where: {
        id: string;
      };
      include: unknown;
    }): Promise<PurchaseOrderRecord | PurchaseOrderReadRecord | null>;
    update(args: {
      where: {
        id: string;
      };
      data: {
        status: PurchaseOrderStatus;
        orderedAt?: Date;
      };
      include: {
        items: true;
      };
    }): Promise<PurchaseOrderRecord>;
  };
  inventoryItem: {
    findUnique(args: {
      where: {
        id: string;
      };
      select: {
        id: true;
      };
    }): Promise<{ id: string } | null>;
  };
  workflowEvent: {
    create(args: {
      data: {
        type: string;
        version: number;
        source: string;
        externalId: string;
        idempotencyKey: string;
        occurredAt: Date;
        dataJson: unknown;
        metadataJson?: unknown;
      };
    }): Promise<unknown>;
  };
  inventoryMovement?: {
    create(args: unknown): Promise<unknown>;
  };
};

export type PurchaseOrderServicePort = {
  create(input: CreatePurchaseOrderInput, actorUserId: string): Promise<PurchaseOrderDto>;
  markOrdered(id: string, actorUserId: string): Promise<PurchaseOrderDto>;
  cancel(id: string, actorUserId: string): Promise<PurchaseOrderDto>;
  list(): Promise<PurchaseOrderReadDto[]>;
  get(id: string): Promise<PurchaseOrderReadDto>;
};

export class PurchaseOrderService implements PurchaseOrderServicePort {
  public constructor(
    private readonly options: {
      db: PurchaseOrderDatabaseClient;
      now?: () => Date;
    }
  ) {}

  public async create(
    input: CreatePurchaseOrderInput,
    actorUserId: string
  ): Promise<PurchaseOrderDto> {
    await this.assertInventoryItemsExist(input.items.map((item) => item.inventoryItemId));

    const purchaseOrder = await this.options.db.purchaseOrder.create({
      data: {
        supplierId: input.supplierId,
        note: input.note,
        createdById: actorUserId,
        items: {
          create: input.items.map((item) => ({
            inventoryItemId: item.inventoryItemId,
            orderedQty: item.orderedQty,
            unit: item.unit,
            note: item.note
          }))
        }
      },
      include: {
        items: true
      }
    });

    return mapPurchaseOrder(purchaseOrder);
  }

  public async markOrdered(id: string, actorUserId: string): Promise<PurchaseOrderDto> {
    const existing = await this.options.db.purchaseOrder.findUnique({
      where: {
        id
      },
      include: {
        items: true
      }
    });

    if (!existing) {
      throw new Error("purchase order not found");
    }

    if (!existing.items || existing.items.length === 0) {
      throw new Error("purchase order requires at least one item");
    }

    if (existing.status === "cancelled") {
      throw new Error("cancelled purchase orders cannot be marked ordered");
    }

    const orderedAt = this.options.now?.() ?? new Date();
    const purchaseOrder = await this.options.db.purchaseOrder.update({
      where: {
        id
      },
      data: {
        status: "ordered",
        orderedAt
      },
      include: {
        items: true
      }
    });

    await this.options.db.workflowEvent.create({
      data: {
        type: "inventory.purchase_order.ordered",
        version: 1,
        source: "system",
        externalId: id,
        idempotencyKey: `inventory.purchase_order.ordered:${id}`,
        occurredAt: orderedAt,
        dataJson: {
          purchaseOrderId: id,
          actorUserId
        },
        metadataJson: undefined
      }
    });

    return mapPurchaseOrder(purchaseOrder);
  }

  public async cancel(id: string, actorUserId: string): Promise<PurchaseOrderDto> {
    const existing = await this.options.db.purchaseOrder.findUnique({
      where: {
        id
      },
      include: {
        items: true
      }
    });

    if (!existing) {
      throw new Error("purchase order not found");
    }

    if (existing.status === "cancelled") {
      return mapPurchaseOrder(existing as PurchaseOrderRecord);
    }

    if (existing.items?.some((item) => (item.receivedQty ?? 0) > 0)) {
      throw new PurchaseOrderConflictError("received purchase orders cannot be cancelled");
    }

    const purchaseOrder = await this.options.db.purchaseOrder.update({
      where: {
        id
      },
      data: {
        status: "cancelled"
      },
      include: {
        items: true
      }
    });

    await this.options.db.workflowEvent.create({
      data: {
        type: "inventory.purchase_order.cancelled",
        version: 1,
        source: "system",
        externalId: id,
        idempotencyKey: `inventory.purchase_order.cancelled:${id}`,
        occurredAt: this.options.now?.() ?? new Date(),
        dataJson: {
          purchaseOrderId: id,
          actorUserId
        },
        metadataJson: undefined
      }
    });

    return mapPurchaseOrder(purchaseOrder);
  }

  public async list(): Promise<PurchaseOrderReadDto[]> {
    if (!this.options.db.purchaseOrder.findMany) {
      throw new Error("purchase order read model is not available");
    }

    const purchaseOrders = await this.options.db.purchaseOrder.findMany({
      include: purchaseOrderReadInclude,
      orderBy: {
        createdAt: "desc"
      }
    });

    return purchaseOrders.map(mapPurchaseOrderRead);
  }

  public async get(id: string): Promise<PurchaseOrderReadDto> {
    const purchaseOrder = await this.options.db.purchaseOrder.findUnique({
      where: {
        id
      },
      include: purchaseOrderReadInclude
    });

    if (!purchaseOrder) {
      throw new Error("purchase order not found");
    }

    return mapPurchaseOrderRead(purchaseOrder as PurchaseOrderReadRecord);
  }

  private async assertInventoryItemsExist(inventoryItemIds: string[]): Promise<void> {
    for (const inventoryItemId of new Set(inventoryItemIds)) {
      const inventoryItem = await this.options.db.inventoryItem.findUnique({
        where: {
          id: inventoryItemId
        },
        select: {
          id: true
        }
      });

      if (!inventoryItem) {
        throw new Error("inventory item not found");
      }
    }
  }
}

function mapPurchaseOrder(record: PurchaseOrderRecord): PurchaseOrderDto {
  return {
    purchaseOrderId: record.id,
    status: record.status
  };
}

const purchaseOrderReadInclude = {
  supplier: {
    select: {
      name: true
    }
  },
  items: {
    include: {
      inventoryItem: {
        select: {
          name: true
        }
      }
    },
    orderBy: {
      id: "asc"
    }
  }
};

function mapPurchaseOrderRead(record: PurchaseOrderReadRecord): PurchaseOrderReadDto {
  return {
    purchaseOrderId: record.id,
    status: record.status,
    supplierId: record.supplierId ?? undefined,
    supplierName: record.supplier?.name,
    createdById: record.createdById,
    orderedAt: record.orderedAt?.toISOString(),
    note: record.note ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    items: record.items.map((item) => ({
      purchaseOrderItemId: item.id,
      inventoryItemId: item.inventoryItemId,
      inventoryItemName: item.inventoryItem?.name,
      orderedQty: item.orderedQty,
      receivedQty: item.receivedQty,
      pendingQty: item.orderedQty - item.receivedQty,
      unit: item.unit,
      note: item.note ?? undefined
    }))
  };
}
