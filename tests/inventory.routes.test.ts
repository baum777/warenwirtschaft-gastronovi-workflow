import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { Actor } from "../src/modules/auth/actor.js";
import type { CorrectionServicePort } from "../src/modules/inventory/correction.service.js";
import type { GoodsReceiptServicePort } from "../src/modules/inventory/goods-receipt.service.js";
import type { InventoryItemServicePort } from "../src/modules/inventory/inventory-item.service.js";
import type { InventoryReadServicePort } from "../src/modules/inventory/inventory-read.service.js";
import type { PurchaseOrderServicePort } from "../src/modules/inventory/purchase-order.service.js";
import type { ReviewTaskServicePort } from "../src/modules/inventory/review-task.service.js";
import type { WithdrawalServicePort } from "../src/modules/inventory/withdrawal.service.js";

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

  it("lets admins create inventory items", async () => {
    const calls: unknown[] = [];
    const app = buildApp({
      inventory: fakeInventoryServices({
        inventoryItemService: {
          async create(input) {
            calls.push(input);
            return expectedInventoryItemReadModel();
          },
          async list() {
            throw new Error("not used");
          },
          async get() {
            throw new Error("not used");
          },
          async update() {
            throw new Error("not used");
          },
          async deactivate() {
            throw new Error("not used");
          }
        }
      })
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/admin/inventory/items",
        headers: {
          "x-actor-id": "admin-1",
          "x-actor-role": "admin"
        },
        payload: {
          name: "Tomaten passiert 5kg",
          sku: "TOM-5",
          category: "food",
          defaultUnit: "Stück",
          minStock: 4,
          storageLocationId: "loc-1"
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual(expectedInventoryItemReadModel());
      expect(calls).toEqual([
        {
          name: "Tomaten passiert 5kg",
          sku: "TOM-5",
          category: "food",
          defaultUnit: "Stück",
          minStock: 4,
          storageLocationId: "loc-1"
        }
      ]);
    } finally {
      await app.close();
    }
  });

  it("returns admin inventory item read models", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const listResponse = await app.inject({
        method: "GET",
        url: "/admin/inventory/items",
        headers: {
          "x-actor-id": "admin-1",
          "x-actor-role": "admin"
        }
      });
      const detailResponse = await app.inject({
        method: "GET",
        url: "/admin/inventory/items/item-1",
        headers: {
          "x-actor-id": "admin-1",
          "x-actor-role": "admin"
        }
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual({
        items: [expectedInventoryItemReadModel()]
      });
      expect(detailResponse.statusCode).toBe(200);
      expect(detailResponse.json()).toEqual(expectedInventoryItemReadModel());
    } finally {
      await app.close();
    }
  });

  it("lets admins update and deactivate inventory items", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const updateResponse = await app.inject({
        method: "PATCH",
        url: "/admin/inventory/items/item-1",
        headers: {
          "x-actor-id": "admin-1",
          "x-actor-role": "admin"
        },
        payload: {
          name: "Tomaten passiert 6kg",
          minStock: 6
        }
      });
      const deactivateResponse = await app.inject({
        method: "POST",
        url: "/admin/inventory/items/item-1/deactivate",
        headers: {
          "x-actor-id": "admin-1",
          "x-actor-role": "admin"
        }
      });

      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json()).toEqual({
        ...expectedInventoryItemReadModel(),
        name: "Tomaten passiert 6kg",
        minStock: 6
      });
      expect(deactivateResponse.statusCode).toBe(200);
      expect(deactivateResponse.json()).toEqual({
        ...expectedInventoryItemReadModel(),
        isActive: false
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

  it("lets staff record withdrawals and passes actor context to the service", async () => {
    const calls: Array<{ input: unknown; actor: Actor }> = [];
    const app = buildApp({
      inventory: fakeInventoryServices({
        withdrawalService: {
          async create(input, actor) {
            calls.push({ input, actor });
            return {
              movementId: "move-2",
              stockAfter: 2,
              reviewTaskIds: []
            };
          }
        }
      })
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/withdrawals",
        headers: {
          "x-actor-id": "staff-1",
          "x-actor-role": "staff"
        },
        payload: {
          inventoryItemId: "item-1",
          quantity: 2,
          unit: "Stück",
          note: "prep usage"
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        movementId: "move-2",
        stockAfter: 2,
        reviewTaskIds: []
      });
      expect(calls).toEqual([
        {
          input: {
            inventoryItemId: "item-1",
            quantity: 2,
            unit: "Stück",
            note: "prep usage"
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

  it("lets staff request inventory corrections without applying them", async () => {
    const calls: Array<{ input: unknown; actor: Actor }> = [];
    const app = buildApp({
      inventory: fakeInventoryServices({
        correctionService: {
          async createRequest(input, actor) {
            calls.push({ input, actor });
            return {
              correctionRequestId: "correction-1",
              status: "open",
              reviewTaskId: "task-2"
            };
          },
          async approve() {
            throw new Error("not used");
          },
          async reject() {
            throw new Error("not used");
          }
        }
      })
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/correction-requests",
        headers: {
          "x-actor-id": "staff-1",
          "x-actor-role": "staff"
        },
        payload: {
          inventoryItemId: "item-1",
          expectedDelta: -2,
          unit: "Stück",
          reason: "count mismatch"
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        correctionRequestId: "correction-1",
        status: "open",
        reviewTaskId: "task-2"
      });
      expect(calls).toEqual([
        {
          input: {
            inventoryItemId: "item-1",
            expectedDelta: -2,
            unit: "Stück",
            reason: "count mismatch"
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

  it("lets admins approve correction requests", async () => {
    const calls: Array<{ id: string; actor: Actor }> = [];
    const app = buildApp({
      inventory: fakeInventoryServices({
        correctionService: {
          async createRequest() {
            throw new Error("not used");
          },
          async approve(id, actor) {
            calls.push({ id, actor });
            return {
              correctionRequestId: "correction-1",
              status: "approved",
              movementId: "move-3",
              stockAfter: 8
            };
          },
          async reject() {
            throw new Error("not used");
          }
        }
      })
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/admin/correction-requests/correction-1/approve",
        headers: {
          "x-actor-id": "admin-1",
          "x-actor-role": "admin"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        correctionRequestId: "correction-1",
        status: "approved",
        movementId: "move-3",
        stockAfter: 8
      });
      expect(calls).toEqual([
        {
          id: "correction-1",
          actor: {
            userId: "admin-1",
            role: "admin"
          }
        }
      ]);
    } finally {
      await app.close();
    }
  });

  it("lets admins reject correction requests", async () => {
    const calls: Array<{ id: string; actor: Actor }> = [];
    const app = buildApp({
      inventory: fakeInventoryServices({
        correctionService: {
          async createRequest() {
            throw new Error("not used");
          },
          async approve() {
            throw new Error("not used");
          },
          async reject(id, actor) {
            calls.push({ id, actor });
            return {
              correctionRequestId: "correction-1",
              status: "rejected"
            };
          }
        }
      })
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/admin/correction-requests/correction-1/reject",
        headers: {
          "x-actor-id": "admin-1",
          "x-actor-role": "admin"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        correctionRequestId: "correction-1",
        status: "rejected"
      });
      expect(calls).toEqual([
        {
          id: "correction-1",
          actor: {
            userId: "admin-1",
            role: "admin"
          }
        }
      ]);
    } finally {
      await app.close();
    }
  });

  it("lets admins start reviewing inventory review tasks", async () => {
    const calls: Array<{ id: string; actor: Actor }> = [];
    const app = buildApp({
      inventory: fakeInventoryServices({
        reviewTaskService: {
          async startReview(id, actor) {
            calls.push({ id, actor });
            return {
              id: "task-1",
              status: "in_review",
              resolvedAt: undefined
            };
          },
          async resolve() {
            throw new Error("not used");
          },
          async dismiss() {
            throw new Error("not used");
          }
        }
      })
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/admin/review-tasks/task-1/start-review",
        headers: {
          "x-actor-id": "admin-1",
          "x-actor-role": "admin"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        id: "task-1",
        status: "in_review"
      });
      expect(calls).toEqual([
        {
          id: "task-1",
          actor: {
            userId: "admin-1",
            role: "admin"
          }
        }
      ]);
    } finally {
      await app.close();
    }
  });

  it("lets admins resolve inventory review tasks", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices({
        reviewTaskService: {
          async startReview() {
            throw new Error("not used");
          },
          async resolve() {
            return {
              id: "task-1",
              status: "resolved",
              resolvedAt: "2026-05-26T12:00:00.000Z"
            };
          },
          async dismiss() {
            throw new Error("not used");
          }
        }
      })
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/admin/review-tasks/task-1/resolve",
        headers: {
          "x-actor-id": "admin-1",
          "x-actor-role": "admin"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        id: "task-1",
        status: "resolved",
        resolvedAt: "2026-05-26T12:00:00.000Z"
      });
    } finally {
      await app.close();
    }
  });

  it("lets admins dismiss inventory review tasks", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices({
        reviewTaskService: {
          async startReview() {
            throw new Error("not used");
          },
          async resolve() {
            throw new Error("not used");
          },
          async dismiss() {
            return {
              id: "task-1",
              status: "dismissed",
              resolvedAt: "2026-05-26T12:15:00.000Z"
            };
          }
        }
      })
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/admin/review-tasks/task-1/dismiss",
        headers: {
          "x-actor-id": "admin-1",
          "x-actor-role": "admin"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        id: "task-1",
        status: "dismissed",
        resolvedAt: "2026-05-26T12:15:00.000Z"
      });
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
    inventoryItemService: InventoryItemServicePort;
    goodsReceiptService: GoodsReceiptServicePort;
    inventoryReadService: InventoryReadServicePort;
    withdrawalService: WithdrawalServicePort;
    correctionService: CorrectionServicePort;
    reviewTaskService: ReviewTaskServicePort;
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
    inventoryItemService: overrides.inventoryItemService ?? {
      async create() {
        return expectedInventoryItemReadModel();
      },
      async list() {
        return [expectedInventoryItemReadModel()];
      },
      async get() {
        return expectedInventoryItemReadModel();
      },
      async update() {
        return {
          ...expectedInventoryItemReadModel(),
          name: "Tomaten passiert 6kg",
          minStock: 6
        };
      },
      async deactivate() {
        return {
          ...expectedInventoryItemReadModel(),
          isActive: false
        };
      }
    } as InventoryItemServicePort,
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
    withdrawalService: overrides.withdrawalService ?? {
      async create() {
        return { movementId: "move-2", stockAfter: 2, reviewTaskIds: [] };
      }
    } as WithdrawalServicePort,
    correctionService: overrides.correctionService ?? {
      async createRequest() {
        return { correctionRequestId: "correction-1", status: "open", reviewTaskId: "task-2" };
      },
      async approve() {
        return {
          correctionRequestId: "correction-1",
          status: "approved",
          movementId: "move-3",
          stockAfter: 8
        };
      },
      async reject() {
        return { correctionRequestId: "correction-1", status: "rejected" };
      }
    } as CorrectionServicePort,
    reviewTaskService: overrides.reviewTaskService ?? {
      async startReview() {
        return { id: "task-1", status: "in_review", resolvedAt: undefined };
      },
      async resolve() {
        return {
          id: "task-1",
          status: "resolved",
          resolvedAt: "2026-05-26T12:00:00.000Z"
        };
      },
      async dismiss() {
        return {
          id: "task-1",
          status: "dismissed",
          resolvedAt: "2026-05-26T12:15:00.000Z"
        };
      }
    } as ReviewTaskServicePort,
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

function expectedInventoryItemReadModel() {
  return {
    inventoryItemId: "item-1",
    name: "Tomaten passiert 5kg",
    sku: "TOM-5",
    category: "food",
    defaultUnit: "Stück",
    minStock: 4,
    storageLocationId: "loc-1",
    storageLocationName: "Küche",
    isActive: true,
    createdAt: "2026-05-26T10:00:00.000Z",
    updatedAt: "2026-05-26T11:00:00.000Z"
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
