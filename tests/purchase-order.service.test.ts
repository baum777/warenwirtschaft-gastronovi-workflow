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
});
