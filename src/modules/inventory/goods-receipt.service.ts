import type { Actor } from "../auth/actor.js";
import type { CreateGoodsReceiptInput, GoodsReceiptDto } from "./inventory.schemas.js";
import { InventoryStockService } from "./inventory-stock.service.js";

type PurchaseOrderStatus = "draft" | "ordered" | "partially_received" | "received" | "cancelled";

type InventoryItemRecord = {
  id: string;
  name: string;
  defaultUnit: string;
  minStock: number | null;
};

type PurchaseOrderItemRecord = {
  id: string;
  orderedQty: number;
  receivedQty: number;
};

type PurchaseOrderWithItems = {
  id: string;
  items: Array<{
    orderedQty: number;
    receivedQty: number;
  }>;
};

type ReceiptTransactionClient = {
  goodsReceipt: {
    create(args: {
      data: {
        purchaseOrderId?: string;
        receivedById: string;
        receivedAt: Date;
        note?: string;
      };
    }): Promise<{ id: string; receivedAt: Date }>;
  };
  inventoryItem: {
    findUnique(args: {
      where: {
        id: string;
      };
      select: {
        id: true;
        name: true;
        defaultUnit: true;
        minStock: true;
      };
    }): Promise<InventoryItemRecord | null>;
  };
  goodsReceiptItem: {
    create(args: {
      data: {
        goodsReceiptId: string;
        inventoryItemId: string;
        quantity: number;
        unit: string;
        storageLocationId?: string;
        note?: string;
      };
    }): Promise<{ id: string }>;
  };
  inventoryMovement: {
    create(args: {
      data: {
        inventoryItemId: string;
        type: "goods_received";
        quantity: number;
        unit: string;
        actorUserId: string;
        storageLocationId?: string;
        purchaseOrderId?: string;
        goodsReceiptId: string;
        note?: string;
      };
    }): Promise<{ id: string }>;
    findMany(args: unknown): Promise<Array<{ type: "goods_received" | "item_removed" | "correction_positive" | "correction_negative"; quantity: number; createdAt?: Date }>>;
  };
  inventoryStockSnapshot: {
    upsert(args: unknown): Promise<unknown>;
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
  workflowTask: {
    create(args: {
      data: {
        type: string;
        status: "open";
        severity: "warning" | "critical";
        title: string;
        description?: string;
        assignedRole: string;
      };
    }): Promise<unknown>;
  };
  purchaseOrderItem: {
    findFirst(args: {
      where: {
        purchaseOrderId: string;
        inventoryItemId: string;
      };
    }): Promise<PurchaseOrderItemRecord | null>;
    update(args: {
      where: {
        id: string;
      };
      data: {
        receivedQty: {
          increment: number;
        };
      };
    }): Promise<unknown>;
  };
  purchaseOrder: {
    findUnique(args: {
      where: {
        id: string;
      };
      include: {
        items: true;
      };
    }): Promise<PurchaseOrderWithItems | null>;
    update(args: {
      where: {
        id: string;
      };
      data: {
        status: PurchaseOrderStatus;
      };
    }): Promise<unknown>;
  };
};

export type GoodsReceiptDatabaseClient = {
  $transaction<T>(callback: (transaction: any) => Promise<T>): Promise<T>;
};

export type GoodsReceiptServicePort = {
  create(input: CreateGoodsReceiptInput, actor: Actor): Promise<GoodsReceiptDto>;
};

export class GoodsReceiptService implements GoodsReceiptServicePort {
  public constructor(
    private readonly options: {
      db: GoodsReceiptDatabaseClient;
      now?: () => Date;
    }
  ) {}

  public async create(input: CreateGoodsReceiptInput, actor: Actor): Promise<GoodsReceiptDto> {
    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : this.options.now?.() ?? new Date();

    return this.options.db.$transaction(async (transaction) => {
      const tx = transaction as ReceiptTransactionClient;
      const receipt = await tx.goodsReceipt.create({
        data: {
          purchaseOrderId: input.purchaseOrderId,
          receivedById: actor.userId,
          receivedAt,
          note: input.note
        }
      });
      const stockService = new InventoryStockService({
        db: tx,
        now: this.options.now
      });
      const movementIds: string[] = [];
      let overdelivery = false;
      const receivedItemNames: string[] = [];

      for (const item of input.items) {
        const inventoryItem = await tx.inventoryItem.findUnique({
          where: {
            id: item.inventoryItemId
          },
          select: {
            id: true,
            name: true,
            defaultUnit: true,
            minStock: true
          }
        });

        if (!inventoryItem) {
          throw new Error("inventory item not found");
        }

        receivedItemNames.push(inventoryItem.name);

        await tx.goodsReceiptItem.create({
          data: {
            goodsReceiptId: receipt.id,
            inventoryItemId: item.inventoryItemId,
            quantity: item.quantity,
            unit: item.unit,
            storageLocationId: item.storageLocationId,
            note: item.note
          }
        });

        const movement = await tx.inventoryMovement.create({
          data: {
            inventoryItemId: item.inventoryItemId,
            type: "goods_received",
            quantity: item.quantity,
            unit: item.unit,
            actorUserId: actor.userId,
            storageLocationId: item.storageLocationId,
            purchaseOrderId: input.purchaseOrderId,
            goodsReceiptId: receipt.id,
            note: item.note
          }
        });
        movementIds.push(movement.id);

        if (input.purchaseOrderId) {
          const purchaseOrderItem = await tx.purchaseOrderItem.findFirst({
            where: {
              purchaseOrderId: input.purchaseOrderId,
              inventoryItemId: item.inventoryItemId
            }
          });

          if (!purchaseOrderItem) {
            throw new Error("purchase order item not found");
          }

          await tx.purchaseOrderItem.update({
            where: {
              id: purchaseOrderItem.id
            },
            data: {
              receivedQty: {
                increment: item.quantity
              }
            }
          });

          if (purchaseOrderItem.receivedQty + item.quantity > purchaseOrderItem.orderedQty) {
            overdelivery = true;
          }
        }

        await stockService.refreshSnapshot({
          inventoryItemId: item.inventoryItemId,
          storageLocationId: item.storageLocationId,
          unit: item.unit
        });
      }

      if (input.purchaseOrderId) {
        await this.recalculatePurchaseOrderStatus(tx, input.purchaseOrderId);
      }

      await tx.workflowEvent.create({
        data: {
          type: "inventory.goods_receipt.recorded",
          version: 1,
          source: "system",
          externalId: receipt.id,
          idempotencyKey: `inventory.goods_receipt.recorded:${receipt.id}`,
          occurredAt: receivedAt,
          dataJson: {
            goodsReceiptId: receipt.id,
            purchaseOrderId: input.purchaseOrderId,
            actorUserId: actor.userId,
            itemCount: input.items.length
          },
          metadataJson: undefined
        }
      });

      if (!input.purchaseOrderId && actor.role === "staff") {
        await tx.workflowTask.create({
          data: {
            type: "inventory.unlinked_receipt",
            status: "open",
            severity: "warning",
            title: "Wareneingang ohne Bestellung",
            description: `${receivedItemNames.join(", ")} wurde ohne Bestellung gebucht.`,
            assignedRole: "admin"
          }
        });
      }

      if (overdelivery) {
        await tx.workflowTask.create({
          data: {
            type: "inventory.overdelivery",
            status: "open",
            severity: "warning",
            title: "Überlieferung prüfen",
            description: `Wareneingang ${receipt.id} überschreitet die bestellte Menge.`,
            assignedRole: "admin"
          }
        });
      }

      return {
        goodsReceiptId: receipt.id,
        movementIds
      };
    });
  }

  private async recalculatePurchaseOrderStatus(
    tx: ReceiptTransactionClient,
    purchaseOrderId: string
  ): Promise<void> {
    const purchaseOrder = await tx.purchaseOrder.findUnique({
      where: {
        id: purchaseOrderId
      },
      include: {
        items: true
      }
    });

    if (!purchaseOrder) {
      throw new Error("purchase order not found");
    }

    const status = calculatePurchaseOrderStatus(purchaseOrder.items);

    await tx.purchaseOrder.update({
      where: {
        id: purchaseOrderId
      },
      data: {
        status
      }
    });
  }
}

function calculatePurchaseOrderStatus(
  items: Array<{ orderedQty: number; receivedQty: number }>
): PurchaseOrderStatus {
  if (items.every((item) => item.receivedQty >= item.orderedQty)) {
    return "received";
  }

  if (items.some((item) => item.receivedQty > 0)) {
    return "partially_received";
  }

  return "ordered";
}
