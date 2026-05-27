import { describe, expect, it } from "vitest";

import { PurchaseOrderService } from "../src/modules/inventory/purchase-order.service.js";

describe("PurchaseOrderService", () => {
  it("creates purchase orders without changing stock", async () => {
    const calls: Array<{ model: string; method: string; args: unknown }> = [];
    const service = new PurchaseOrderService({
      db: {
        purchaseOrder: {
          async create(args: unknown) {
            calls.push({ model: "purchaseOrder", method: "create", args });
            return {
              id: "po-1",
              status: "draft",
              supplierId: null,
              createdById: "admin-1",
              orderedAt: null,
              note: "weekly order",
              createdAt: new Date("2026-05-25T18:00:00.000Z"),
              updatedAt: new Date("2026-05-25T18:00:00.000Z"),
              items: []
            };
          },
          async findUnique() {
            throw new Error("not used");
          },
          async update() {
            throw new Error("not used");
          }
        },
        inventoryItem: {
          async findUnique(args: unknown) {
            calls.push({ model: "inventoryItem", method: "findUnique", args });
            return { id: "item-1" };
          }
        },
        workflowEvent: {
          async create() {
            throw new Error("not used");
          }
        },
        inventoryMovement: {
          async create() {
            throw new Error("purchase orders must not create inventory movements");
          }
        }
      }
    });

    const result = await service.create(
      {
        supplierId: "supplier-1",
        note: "weekly order",
        items: [
          {
            inventoryItemId: "item-1",
            orderedQty: 10,
            unit: "Stück"
          }
        ]
      },
      "admin-1"
    );

    expect(result).toEqual({
      purchaseOrderId: "po-1",
      status: "draft"
    });
    expect(calls).toEqual([
      {
        model: "inventoryItem",
        method: "findUnique",
        args: {
          where: {
            id: "item-1"
          },
          select: {
            id: true
          }
        }
      },
      {
        model: "purchaseOrder",
        method: "create",
        args: {
          data: {
            supplierId: "supplier-1",
            note: "weekly order",
            createdById: "admin-1",
            items: {
              create: [
                {
                  inventoryItemId: "item-1",
                  orderedQty: 10,
                  unit: "Stück",
                  note: undefined
                }
              ]
            }
          },
          include: {
            items: true
          }
        }
      }
    ]);
  });

  it("rejects purchase order items that do not reference an inventory item", async () => {
    const service = new PurchaseOrderService({
      db: {
        purchaseOrder: {
          async create() {
            throw new Error("purchase order must not be created");
          },
          async findUnique() {
            throw new Error("not used");
          },
          async findMany() {
            throw new Error("not used");
          },
          async update() {
            throw new Error("not used");
          }
        },
        inventoryItem: {
          async findUnique() {
            return null;
          }
        },
        workflowEvent: {
          async create() {
            throw new Error("not used");
          }
        }
      }
    });

    await expect(
      service.create(
        {
          items: [
            {
              inventoryItemId: "missing-item",
              orderedQty: 10,
              unit: "Stück"
            }
          ]
        },
        "admin-1"
      )
    ).rejects.toThrow("inventory item not found");
  });

  it("returns purchase order read models with pending quantities", async () => {
    const createdAt = new Date("2026-05-25T18:00:00.000Z");
    const orderedAt = new Date("2026-05-25T19:00:00.000Z");
    const service = new PurchaseOrderService({
      db: {
        purchaseOrder: {
          async create() {
            throw new Error("not used");
          },
          async findMany() {
            return [purchaseOrderReadRecord(createdAt, orderedAt)];
          },
          async findUnique() {
            return purchaseOrderReadRecord(createdAt, orderedAt);
          },
          async update() {
            throw new Error("not used");
          }
        },
        inventoryItem: {
          async findUnique() {
            throw new Error("not used");
          }
        },
        workflowEvent: {
          async create() {
            throw new Error("not used");
          }
        }
      }
    });

    const expected = {
      purchaseOrderId: "po-1",
      status: "ordered",
      supplierId: "supplier-1",
      supplierName: "Frischemarkt",
      createdById: "admin-1",
      orderedAt: orderedAt.toISOString(),
      note: "weekly order",
      createdAt: createdAt.toISOString(),
      updatedAt: orderedAt.toISOString(),
      items: [
        {
          purchaseOrderItemId: "poi-1",
          inventoryItemId: "item-1",
          inventoryItemName: "Tomaten passiert 5kg",
          orderedQty: 10,
          receivedQty: 4,
          pendingQty: 6,
          unit: "Stück",
          note: "case"
        }
      ]
    };

    await expect(service.list()).resolves.toEqual([expected]);
    await expect(service.get("po-1")).resolves.toEqual(expected);
  });

  it("marks an order as ordered and emits an event without changing stock", async () => {
    const calls: Array<{ model: string; method: string; args: unknown }> = [];
    const orderedAt = new Date("2026-05-25T19:00:00.000Z");
    const service = new PurchaseOrderService({
      now: () => orderedAt,
      db: {
        purchaseOrder: {
          async create() {
            throw new Error("not used");
          },
          async findUnique(args: unknown) {
            calls.push({ model: "purchaseOrder", method: "findUnique", args });
            return {
              id: "po-1",
              status: "draft",
              items: [{ id: "poi-1" }]
            };
          },
          async update(args: unknown) {
            calls.push({ model: "purchaseOrder", method: "update", args });
            return {
              id: "po-1",
              status: "ordered",
              supplierId: null,
              createdById: "admin-1",
              orderedAt,
              note: null,
              createdAt: orderedAt,
              updatedAt: orderedAt,
              items: [{ id: "poi-1" }]
            };
          }
        },
        inventoryItem: {
          async findUnique() {
            throw new Error("not used");
          }
        },
        workflowEvent: {
          async create(args: unknown) {
            calls.push({ model: "workflowEvent", method: "create", args });
            return {};
          }
        },
        inventoryMovement: {
          async create() {
            throw new Error("markOrdered must not create inventory movements");
          }
        }
      }
    });

    const result = await service.markOrdered("po-1", "admin-1");

    expect(result).toEqual({
      purchaseOrderId: "po-1",
      status: "ordered"
    });
    expect(calls).toEqual([
      {
        model: "purchaseOrder",
        method: "findUnique",
        args: {
          where: {
            id: "po-1"
          },
          include: {
            items: true
          }
        }
      },
      {
        model: "purchaseOrder",
        method: "update",
        args: {
          where: {
            id: "po-1"
          },
          data: {
            status: "ordered",
            orderedAt
          },
          include: {
            items: true
          }
        }
      },
      {
        model: "workflowEvent",
        method: "create",
        args: {
          data: {
            type: "inventory.purchase_order.ordered",
            version: 1,
            source: "system",
            externalId: "po-1",
            idempotencyKey: "inventory.purchase_order.ordered:po-1",
            occurredAt: orderedAt,
            dataJson: {
              purchaseOrderId: "po-1",
              actorUserId: "admin-1"
            },
            metadataJson: undefined
          }
        }
      }
    ]);
  });

  it("cancels orders without received quantities and emits an event", async () => {
    const calls: Array<{ model: string; method: string; args: unknown }> = [];
    const cancelledAt = new Date("2026-05-25T20:00:00.000Z");
    const service = new PurchaseOrderService({
      now: () => cancelledAt,
      db: {
        purchaseOrder: {
          async create() {
            throw new Error("not used");
          },
          async findUnique(args: unknown) {
            calls.push({ model: "purchaseOrder", method: "findUnique", args });
            return {
              id: "po-1",
              status: "ordered",
              items: [{ id: "poi-1", receivedQty: 0 }]
            };
          },
          async update(args: unknown) {
            calls.push({ model: "purchaseOrder", method: "update", args });
            return {
              id: "po-1",
              status: "cancelled",
              items: [{ id: "poi-1" }]
            };
          }
        },
        inventoryItem: {
          async findUnique() {
            throw new Error("not used");
          }
        },
        workflowEvent: {
          async create(args: unknown) {
            calls.push({ model: "workflowEvent", method: "create", args });
            return {};
          }
        },
        inventoryMovement: {
          async create() {
            throw new Error("cancel must not create inventory movements");
          }
        }
      }
    });

    const result = await service.cancel("po-1", "admin-1");

    expect(result).toEqual({
      purchaseOrderId: "po-1",
      status: "cancelled"
    });
    expect(calls).toEqual([
      {
        model: "purchaseOrder",
        method: "findUnique",
        args: {
          where: {
            id: "po-1"
          },
          include: {
            items: true
          }
        }
      },
      {
        model: "purchaseOrder",
        method: "update",
        args: {
          where: {
            id: "po-1"
          },
          data: {
            status: "cancelled"
          },
          include: {
            items: true
          }
        }
      },
      {
        model: "workflowEvent",
        method: "create",
        args: {
          data: {
            type: "inventory.purchase_order.cancelled",
            version: 1,
            source: "system",
            externalId: "po-1",
            idempotencyKey: "inventory.purchase_order.cancelled:po-1",
            occurredAt: cancelledAt,
            dataJson: {
              purchaseOrderId: "po-1",
              actorUserId: "admin-1"
            },
            metadataJson: undefined
          }
        }
      }
    ]);
  });

  it("does not cancel purchase orders that have received quantities", async () => {
    const service = new PurchaseOrderService({
      db: {
        purchaseOrder: {
          async create() {
            throw new Error("not used");
          },
          async findUnique() {
            return {
              id: "po-1",
              status: "partially_received",
              items: [{ id: "poi-1", receivedQty: 1 }]
            };
          },
          async update() {
            throw new Error("purchase order must not be updated");
          }
        },
        inventoryItem: {
          async findUnique() {
            throw new Error("not used");
          }
        },
        workflowEvent: {
          async create() {
            throw new Error("event must not be created");
          }
        }
      }
    });

    await expect(service.cancel("po-1", "admin-1")).rejects.toMatchObject({
      message: "received purchase orders cannot be cancelled",
      statusCode: 409
    });
  });
});

function purchaseOrderReadRecord(createdAt: Date, orderedAt: Date) {
  return {
    id: "po-1",
    status: "ordered" as const,
    supplierId: "supplier-1",
    supplier: {
      name: "Frischemarkt"
    },
    createdById: "admin-1",
    orderedAt,
    note: "weekly order",
    createdAt,
    updatedAt: orderedAt,
    items: [
      {
        id: "poi-1",
        inventoryItemId: "item-1",
        inventoryItem: {
          name: "Tomaten passiert 5kg"
        },
        orderedQty: 10,
        receivedQty: 4,
        unit: "Stück",
        note: "case"
      }
    ]
  };
}
