import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { Actor } from "../src/modules/auth/actor.js";
import type { GoodsReceiptServicePort } from "../src/modules/inventory/goods-receipt.service.js";
import type { InventoryReadServicePort } from "../src/modules/inventory/inventory-read.service.js";
import type { PurchaseOrderServicePort } from "../src/modules/inventory/purchase-order.service.js";

describe("inventory API routes", () => {
  it("requires actor headers for protected admin routes", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "GET",
        url: "/admin/inventory/stock"
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: "Unauthorized",
        message: "actor headers are required"
      });
    } finally {
      await app.close();
    }
  });

  it("prevents staff from creating admin purchase orders", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/admin/purchase-orders",
        headers: {
          "x-actor-id": "staff-1",
          "x-actor-role": "staff"
        },
        payload: {
          items: [{ inventoryItemId: "item-1", orderedQty: 10, unit: "Stück" }]
        }
      });

      expect(response.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("prevents staff from calling admin read routes", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "GET",
        url: "/admin/inventory/movements",
        headers: {
          "x-actor-id": "staff-1",
          "x-actor-role": "staff"
        }
      });

      expect(response.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("prevents shift leads from calling admin read routes", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "GET",
        url: "/admin/review-tasks",
        headers: {
          "x-actor-id": "shift-1",
          "x-actor-role": "shift_lead"
        }
      });

      expect(response.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });


  it("rejects invalid actor roles over HTTP", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "GET",
        url: "/admin/inventory/stock",
        headers: {
          "x-actor-id": "owner-1",
          "x-actor-role": "owner"
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: "Forbidden",
        message: "actor role is not allowed"
      });
    } finally {
      await app.close();
    }
  });

  it("lets admins create purchase orders", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/admin/purchase-orders",
        headers: {
          "x-actor-id": "admin-1",
          "x-actor-role": "admin"
        },
        payload: {
          items: [{ inventoryItemId: "item-1", orderedQty: 10, unit: "Stück" }]
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        purchaseOrderId: "po-1",
        status: "draft"
      });
    } finally {
      await app.close();
    }
  });

  it("lets admins mark purchase orders as ordered", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/admin/purchase-orders/po-1/mark-ordered",
        headers: {
          "x-actor-id": "admin-1",
          "x-actor-role": "admin"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        purchaseOrderId: "po-1",
        status: "ordered"
      });
    } finally {
      await app.close();
    }
  });

  it("returns admin purchase orders with pending quantities", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const listResponse = await app.inject({
        method: "GET",
        url: "/admin/purchase-orders",
        headers: {
          "x-actor-id": "admin-1",
          "x-actor-role": "admin"
        }
      });
      const detailResponse = await app.inject({
        method: "GET",
        url: "/admin/purchase-orders/po-1",
        headers: {
          "x-actor-id": "admin-1",
          "x-actor-role": "admin"
        }
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual({
        purchaseOrders: [expectedPurchaseOrderReadModel()]
      });
      expect(detailResponse.statusCode).toBe(200);
      expect(detailResponse.json()).toEqual(expectedPurchaseOrderReadModel());
    } finally {
      await app.close();
    }
  });

  it("lets staff record goods receipts and passes actor context to the service", async () => {
    const calls: Array<{ input: unknown; actor: Actor }> = [];
    const app = buildApp({
      inventory: fakeInventoryServices({
        goodsReceiptService: {
          async create(input, actor) {
            calls.push({ input, actor });
            return {
              goodsReceiptId: "gr-1",
              movementIds: ["move-1"]
            };
          },
          async list() {
            return [expectedGoodsReceiptReadModel()];
          },
          async get() {
            return expectedGoodsReceiptReadModel();
          }
        }
      })
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/goods-receipts",
        headers: {
          "x-actor-id": "staff-1",
          "x-actor-role": "staff"
        },
        payload: {
          items: [{ inventoryItemId: "item-1", quantity: 8, unit: "Stück" }]
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        goodsReceiptId: "gr-1",
        movementIds: ["move-1"]
      });
      expect(calls).toEqual([
        {
          input: {
            items: [{ inventoryItemId: "item-1", quantity: 8, unit: "Stück" }]
          },
          actor: {
            userId: "staff-1",
            role: "staff"
          }
        }
      ]);
    } finally {
      await app.close();
    }
  });

  it("returns goods receipt read models for allowed actors", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const listResponse = await app.inject({
        method: "GET",
        url: "/goods-receipts",
        headers: {
          "x-actor-id": "shift-1",
          "x-actor-role": "shift_lead"
        }
      });
      const detailResponse = await app.inject({
        method: "GET",
        url: "/goods-receipts/gr-1",
        headers: {
          "x-actor-id": "staff-1",
          "x-actor-role": "staff"
        }
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual({
        goodsReceipts: [expectedGoodsReceiptReadModel()]
      });
      expect(detailResponse.statusCode).toBe(200);
      expect(detailResponse.json()).toEqual(expectedGoodsReceiptReadModel());
    } finally {
      await app.close();
    }
  });

  it("returns admin stock rows and open review tasks", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const stockResponse = await app.inject({
        method: "GET",
        url: "/admin/inventory/stock",
        headers: {
          "x-actor-id": "admin-1",
          "x-actor-role": "admin"
        }
      });
      const reviewResponse = await app.inject({
        method: "GET",
        url: "/admin/review-tasks",
        headers: {
          "x-actor-id": "admin-1",
          "x-actor-role": "admin"
        }
      });

      expect(stockResponse.statusCode).toBe(200);
      expect(stockResponse.json()).toEqual({
        items: [
          {
            inventoryItemId: "item-1",
            name: "Tomaten passiert 5kg",
            category: "food",
            storageLocationName: "Küche",
            currentStock: 4,
            unit: "Stück",
            minStock: 5,
            status: "low",
            lastMovementAt: "2026-05-25T20:00:00.000Z"
          }
        ]
      });
      expect(reviewResponse.statusCode).toBe(200);
      expect(reviewResponse.json()).toEqual({
        tasks: [
          {
            id: "task-1",
            type: "inventory.unlinked_receipt",
            status: "open",
            severity: "warning",
            title: "Wareneingang ohne Bestellung",
            description: "Tomaten passiert 5kg wurde ohne Bestellung gebucht.",
            createdAt: "2026-05-25T20:00:00.000Z"
          }
        ]
      });
    } finally {
      await app.close();
    }
  });
});

function fakeInventoryServices(
  overrides: Partial<{
    purchaseOrderService: PurchaseOrderServicePort;
    goodsReceiptService: GoodsReceiptServicePort;
    inventoryReadService: InventoryReadServicePort;
  }> = {}
) {
  return {
    purchaseOrderService: overrides.purchaseOrderService ?? {
      async create() {
        return { purchaseOrderId: "po-1", status: "draft" };
      },
      async markOrdered() {
        return { purchaseOrderId: "po-1", status: "ordered" };
      },
      async list() {
        return [expectedPurchaseOrderReadModel()];
      },
      async get() {
        return expectedPurchaseOrderReadModel();
      }
    } as PurchaseOrderServicePort,
    goodsReceiptService: overrides.goodsReceiptService ?? {
      async create() {
        return { goodsReceiptId: "gr-1", movementIds: ["move-1"] };
      },
      async list() {
        return [expectedGoodsReceiptReadModel()];
      },
      async get() {
        return expectedGoodsReceiptReadModel();
      }
    } as GoodsReceiptServicePort,
    inventoryReadService: overrides.inventoryReadService ?? {
      async listStock() {
        return [
          {
            inventoryItemId: "item-1",
            name: "Tomaten passiert 5kg",
            category: "food",
            storageLocationName: "Küche",
            currentStock: 4,
            unit: "Stück",
            minStock: 5,
            status: "low",
            lastMovementAt: "2026-05-25T20:00:00.000Z"
          }
        ];
      },
      async listMovements() {
        return [];
      },
      async listOpenReviewTasks() {
        return [
          {
            id: "task-1",
            type: "inventory.unlinked_receipt",
            status: "open",
            severity: "warning",
            title: "Wareneingang ohne Bestellung",
            description: "Tomaten passiert 5kg wurde ohne Bestellung gebucht.",
            createdAt: "2026-05-25T20:00:00.000Z"
          }
        ];
      }
    }
  };
}

function expectedPurchaseOrderReadModel() {
  return {
    purchaseOrderId: "po-1",
    status: "ordered",
    supplierId: "supplier-1",
    supplierName: "Frischemarkt",
    createdById: "admin-1",
    orderedAt: "2026-05-25T19:00:00.000Z",
    note: "weekly order",
    createdAt: "2026-05-25T18:00:00.000Z",
    updatedAt: "2026-05-25T19:00:00.000Z",
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
}

function expectedGoodsReceiptReadModel() {
  return {
    goodsReceiptId: "gr-1",
    purchaseOrderId: "po-1",
    receivedById: "staff-1",
    receivedAt: "2026-05-25T20:00:00.000Z",
    note: "delivery",
    createdAt: "2026-05-25T20:00:00.000Z",
    items: [
      {
        goodsReceiptItemId: "gri-1",
        inventoryItemId: "item-1",
        inventoryItemName: "Tomaten passiert 5kg",
        quantity: 4,
        unit: "Stück",
        storageLocationId: "loc-1",
        storageLocationName: "Küche",
        note: "case"
      }
    ]
  };
}
