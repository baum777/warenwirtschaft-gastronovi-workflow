import type { CreatePurchaseOrderInput, PurchaseOrderDto } from "./inventory.schemas.js";

type PurchaseOrderStatus = PurchaseOrderDto["status"];

type PurchaseOrderRecord = {
  id: string;
  status: PurchaseOrderStatus;
  items?: Array<{ id: string }>;
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
    findUnique(args: {
      where: {
        id: string;
      };
      include: {
        items: true;
      };
    }): Promise<PurchaseOrderRecord | null>;
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
}

function mapPurchaseOrder(record: PurchaseOrderRecord): PurchaseOrderDto {
  return {
    purchaseOrderId: record.id,
    status: record.status
  };
}
