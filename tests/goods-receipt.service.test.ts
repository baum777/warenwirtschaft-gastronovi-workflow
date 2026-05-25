import { describe, expect, it } from "vitest";

import { GoodsReceiptService } from "../src/modules/inventory/goods-receipt.service.js";

describe("GoodsReceiptService", () => {
  it("creates receipt, movement, snapshot, event, and unlinked staff review in a transaction", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const receivedAt = new Date("2026-05-25T20:00:00.000Z");
    const tx = {
      goodsReceipt: {
        async create(args: unknown) {
          calls.push({ model: "goodsReceipt", method: "create", args });
          return { id: "gr-1", receivedAt };
        }
      },
      inventoryItem: {
        async findUnique(args: unknown) {
          calls.push({ model: "inventoryItem", method: "findUnique", args });
          return {
            id: "item-1",
            name: "Tomaten passiert 5kg",
            defaultUnit: "Stück",
            minStock: 5
          };
        }
      },
      goodsReceiptItem: {
        async create(args: unknown) {
          calls.push({ model: "goodsReceiptItem", method: "create", args });
          return { id: "gri-1" };
        }
      },
      inventoryMovement: {
        async create(args: unknown) {
          calls.push({ model: "inventoryMovement", method: "create", args });
          return { id: "move-1" };
        },
        async findMany(args: unknown) {
          calls.push({ model: "inventoryMovement", method: "findMany", args });
          return [
            {
              type: "goods_received",
              quantity: 8,
              createdAt: receivedAt
            }
          ];
        }
      },
      inventoryStockSnapshot: {
        async upsert(args: unknown) {
          calls.push({ model: "inventoryStockSnapshot", method: "upsert", args });
          return { id: "snapshot-1" };
        }
      },
      workflowEvent: {
        async create(args: unknown) {
          calls.push({ model: "workflowEvent", method: "create", args });
          return { id: "event-1" };
        }
      },
      workflowTask: {
        async create(args: unknown) {
          calls.push({ model: "workflowTask", method: "create", args });
          return { id: "task-1" };
        }
      },
      purchaseOrderItem: {
        async findFirst() {
          throw new Error("not used");
        },
        async update() {
          throw new Error("not used");
        }
      },
      purchaseOrder: {
        async findUnique() {
          throw new Error("not used");
        },
        async update() {
          throw new Error("not used");
        }
      }
    };
    const service = new GoodsReceiptService({
      now: () => receivedAt,
      db: {
        async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>): Promise<T> {
          calls.push({ model: "db", method: "$transaction" });
          return callback(tx);
        }
      }
    });

    const result = await service.create(
      {
        receivedAt: receivedAt.toISOString(),
        note: "without order",
        items: [
          {
            inventoryItemId: "item-1",
            quantity: 8,
            unit: "Stück"
          }
        ]
      },
      {
        userId: "staff-1",
        role: "staff"
      }
    );

    expect(result).toEqual({
      goodsReceiptId: "gr-1",
      movementIds: ["move-1"]
    });
    expect(calls.map((call) => `${call.model}.${call.method}`)).toEqual([
      "db.$transaction",
      "goodsReceipt.create",
      "inventoryItem.findUnique",
      "goodsReceiptItem.create",
      "inventoryMovement.create",
      "inventoryMovement.findMany",
      "inventoryStockSnapshot.upsert",
      "workflowEvent.create",
      "workflowTask.create"
    ]);
    expect(calls).toContainEqual({
      model: "inventoryMovement",
      method: "create",
      args: {
        data: {
          inventoryItemId: "item-1",
          type: "goods_received",
          quantity: 8,
          unit: "Stück",
          actorUserId: "staff-1",
          storageLocationId: undefined,
          purchaseOrderId: undefined,
          goodsReceiptId: "gr-1",
          note: undefined
        }
      }
    });
  });

  it("updates linked purchase order quantities and creates overdelivery review", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const receivedAt = new Date("2026-05-25T21:00:00.000Z");
    const tx = {
      goodsReceipt: {
        async create() {
          return { id: "gr-2", receivedAt };
        }
      },
      inventoryItem: {
        async findUnique() {
          return {
            id: "item-1",
            name: "Tomaten passiert 5kg",
            defaultUnit: "Stück",
            minStock: 5
          };
        }
      },
      goodsReceiptItem: {
        async create() {
          return { id: "gri-2" };
        }
      },
      inventoryMovement: {
        async create() {
          return { id: "move-2" };
        },
        async findMany() {
          return [{ type: "goods_received", quantity: 12, createdAt: receivedAt }];
        }
      },
      inventoryStockSnapshot: {
        async upsert() {
          return { id: "snapshot-2" };
        }
      },
      workflowEvent: {
        async create() {
          return { id: "event-2" };
        }
      },
      workflowTask: {
        async create(args: unknown) {
          calls.push({ model: "workflowTask", method: "create", args });
          return { id: "task-2" };
        }
      },
      purchaseOrderItem: {
        async findFirst(args: unknown) {
          calls.push({ model: "purchaseOrderItem", method: "findFirst", args });
          return {
            id: "poi-1",
            orderedQty: 10,
            receivedQty: 0
          };
        },
        async update(args: unknown) {
          calls.push({ model: "purchaseOrderItem", method: "update", args });
          return {};
        }
      },
      purchaseOrder: {
        async findUnique(args: unknown) {
          calls.push({ model: "purchaseOrder", method: "findUnique", args });
          return {
            id: "po-1",
            items: [
              {
                orderedQty: 10,
                receivedQty: 12
              }
            ]
          };
        },
        async update(args: unknown) {
          calls.push({ model: "purchaseOrder", method: "update", args });
          return {};
        }
      }
    };
    const service = new GoodsReceiptService({
      now: () => receivedAt,
      db: {
        async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>): Promise<T> {
          return callback(tx);
        }
      }
    });

    await service.create(
      {
        purchaseOrderId: "po-1",
        items: [
          {
            inventoryItemId: "item-1",
            quantity: 12,
            unit: "Stück"
          }
        ]
      },
      {
        userId: "admin-1",
        role: "admin"
      }
    );

    expect(calls).toContainEqual({
      model: "purchaseOrderItem",
      method: "update",
      args: {
        where: {
          id: "poi-1"
        },
        data: {
          receivedQty: {
            increment: 12
          }
        }
      }
    });
    expect(calls).toContainEqual({
      model: "purchaseOrder",
      method: "update",
      args: {
        where: {
          id: "po-1"
        },
        data: {
          status: "received"
        }
      }
    });
    expect(calls.some((call) => JSON.stringify(call.args).includes("inventory.overdelivery"))).toBe(
      true
    );
  });
});
