import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { Actor } from "../src/modules/auth/actor.js";
import type { CorrectionServicePort } from "../src/modules/inventory/correction.service.js";
import type { GoodsReceiptServicePort } from "../src/modules/inventory/goods-receipt.service.js";
import type { InventoryCsvServicePort } from "../src/modules/inventory/inventory-csv.service.js";
import type { InventoryItemServicePort } from "../src/modules/inventory/inventory-item.service.js";
import type { InventoryMasterDataServicePort } from "../src/modules/inventory/inventory-master-data.service.js";
import type { InventoryReadServicePort } from "../src/modules/inventory/inventory-read.service.js";
import type { PurchaseOrderServicePort } from "../src/modules/inventory/purchase-order.service.js";
import type { ReviewTaskServicePort } from "../src/modules/inventory/review-task.service.js";
import type { WithdrawalServicePort } from "../src/modules/inventory/withdrawal.service.js";

const testJwtSecret = "test-supabase-jwt-secret";
const testOrganizationId = "org-test";

type TestRouteRole = "admin" | "shift_lead" | "staff" | "viewer" | "owner";

function authHeaders(userId: string, role: TestRouteRole): Record<string, string> {
  return {
    authorization: `Bearer ${createTestToken(userId, role)}`
  };
}

function createTestToken(userId: string, role: TestRouteRole): string {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(
    Buffer.from(
      JSON.stringify({
        alg: "HS256",
        typ: "JWT"
      })
    )
  );
  const payload = toBase64Url(
    Buffer.from(
      JSON.stringify({
        sub: userId,
        role,
        iat: now,
        exp: now + 60 * 60
      })
    )
  );
  const body = `${header}.${payload}`;
  const signature = createHmac("sha256", testJwtSecret).update(body).digest();

  return `${body}.${toBase64Url(signature)}`;
}

function toBase64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

describe("inventory API routes", () => {
  it("returns public app context and only seeds demo data when demo mode is enabled", async () => {
    const seedCalls: string[] = [];
    const app = buildApp({
      env: {
        NODE_ENV: "production",
        DEMO_MODE: true
      },
      demoSeedService: {
        async ensure() {
          seedCalls.push("ensure");
        }
      },
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      expect(seedCalls).toEqual(["ensure"]);

      const response = await app.inject({
        method: "GET",
        url: "/app-context"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        demoMode: true,
        devPanelEnabled: true,
        defaultActor: {
          userId: "demo-admin",
          role: "admin"
        }
      });
    } finally {
      await app.close();
    }
  });

  it("does not seed demo data when demo mode is disabled", async () => {
    const seedCalls: string[] = [];
    const app = buildApp({
      env: {
        NODE_ENV: "production",
        DEMO_MODE: false
      },
      demoSeedService: {
        async ensure() {
          seedCalls.push("ensure");
        }
      },
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();

      expect(seedCalls).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("requires bearer authorization for protected admin routes", async () => {
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
        message: "authorization header is required"
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
        headers: authHeaders("staff-1", "staff"),
        payload: {
          items: [{ inventoryItemId: "item-1", orderedQty: 10, unit: "Stück" }]
        }
      });

      expect(response.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("lets shift leads create purchase orders", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/admin/purchase-orders",
        headers: authHeaders("shift-1", "shift_lead"),
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

  it("prevents staff from calling admin read routes", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "GET",
        url: "/admin/inventory/movements",
        headers: authHeaders("staff-1", "staff")
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
        headers: authHeaders("shift-1", "shift_lead")
      });

      expect(response.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("lets shift leads read movement audit rows", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "GET",
        url: "/admin/inventory/movements",
        headers: authHeaders("shift-1", "shift_lead")
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        movements: [
          {
            id: "move-1",
            inventoryItemId: "item-1",
            inventoryItemName: "Tomaten passiert 5kg",
            type: "goods_received",
            quantity: 8,
            unit: "Stück",
            actorUserId: "shift-1",
            storageLocationName: "Küche",
            goodsReceiptId: "gr-1",
            purchaseOrderId: "po-1",
            relatedMovementId: undefined,
            idempotencyKey: "inventory.goods_receipt.recorded:gr-1",
            correlationId: "gr-1",
            sourceType: "goods_receipt",
            sourceId: "gr-1",
            note: "DEMO_MODE Wareneingang",
            createdAt: "2026-05-25T20:00:00.000Z"
          }
        ]
      });
    } finally {
      await app.close();
    }
  });

  it("rejects authenticated users without organization membership", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "GET",
        url: "/admin/inventory/stock",
        headers: authHeaders("orphan-user-1", "staff")
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: "Forbidden",
        message: "actor has no organization membership"
      });
    } finally {
      await app.close();
    }
  });

  it("rejects malformed bearer tokens over HTTP", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/withdrawals",
        headers: {
          authorization: "Bearer invalid-token"
        },
        payload: {
          inventoryItemId: "item-1",
          quantity: 2,
          unit: "Stück"
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: "Unauthorized",
        message: "authorization token is malformed"
      });
    } finally {
      await app.close();
    }
  });

  it("lets admin, shift lead, and staff read operational inventory master data", async () => {
    for (const role of ["admin", "shift_lead", "staff"] as const) {
      const app = buildApp({
        inventory: fakeInventoryServices()
      });

      try {
        await app.ready();
        const response = await app.inject({
          method: "GET",
          url: "/inventory/master-data",
          headers: authHeaders(`${role}-1`, role)
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual(expectedMasterData());
      } finally {
        await app.close();
      }
    }
  });

  it("lets staff read operational stock for booking workflows", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "GET",
        url: "/admin/inventory/stock",
        headers: authHeaders("staff-1", "staff")
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
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
        headers: authHeaders("admin-1", "admin"),
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

  it("lets shift leads create purchase orders", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/admin/purchase-orders",
        headers: authHeaders("shift-1", "shift_lead"),
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
        headers: authHeaders("admin-1", "admin"),
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

  it("prevents shift leads and staff from creating inventory items", async () => {
    for (const role of ["shift_lead", "staff"] as const) {
      const app = buildApp({
        inventory: fakeInventoryServices()
      });

      try {
        await app.ready();
        const response = await app.inject({
          method: "POST",
          url: "/admin/inventory/items",
          headers: authHeaders(`${role}-1`, role),
          payload: {
            name: "Tomaten passiert 5kg",
            defaultUnit: "Stück"
          }
        });

        expect(response.statusCode).toBe(403);
      } finally {
        await app.close();
      }
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
        headers: authHeaders("admin-1", "admin")
      });
      const detailResponse = await app.inject({
        method: "GET",
        url: "/admin/inventory/items/item-1",
        headers: authHeaders("admin-1", "admin")
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
        headers: authHeaders("admin-1", "admin"),
        payload: {
          name: "Tomaten passiert 6kg",
          minStock: 6
        }
      });
      const deactivateResponse = await app.inject({
        method: "POST",
        url: "/admin/inventory/items/item-1/deactivate",
        headers: authHeaders("admin-1", "admin")
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
        headers: authHeaders("admin-1", "admin")
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

  it("lets admins cancel purchase orders", async () => {
    const calls: Array<{ id: string; actorUserId: string }> = [];
    const app = buildApp({
      inventory: fakeInventoryServices({
        purchaseOrderService: {
          async create() {
            throw new Error("not used");
          },
          async markOrdered() {
            throw new Error("not used");
          },
          async cancel(id, actorUserId) {
            calls.push({ id, actorUserId });
            return { purchaseOrderId: id, status: "cancelled" };
          },
          async list() {
            return [expectedPurchaseOrderReadModel()];
          },
          async get() {
            return expectedPurchaseOrderReadModel();
          }
        } as PurchaseOrderServicePort
      })
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/admin/purchase-orders/po-1/cancel",
        headers: authHeaders("admin-1", "admin")
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        purchaseOrderId: "po-1",
        status: "cancelled"
      });
      expect(calls).toEqual([
        {
          id: "po-1",
          actorUserId: "admin-1"
        }
      ]);
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
        headers: authHeaders("admin-1", "admin")
      });
      const detailResponse = await app.inject({
        method: "GET",
        url: "/admin/purchase-orders/po-1",
        headers: authHeaders("admin-1", "admin")
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

  it("returns purchase orders with pending quantities for shift leads", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const listResponse = await app.inject({
        method: "GET",
        url: "/admin/purchase-orders",
        headers: authHeaders("shift-1", "shift_lead")
      });
      const detailResponse = await app.inject({
        method: "GET",
        url: "/admin/purchase-orders/po-1",
        headers: authHeaders("shift-1", "shift_lead")
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

  it("prevents staff from reading purchase orders", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const listResponse = await app.inject({
        method: "GET",
        url: "/admin/purchase-orders",
        headers: authHeaders("staff-1", "staff")
      });
      const detailResponse = await app.inject({
        method: "GET",
        url: "/admin/purchase-orders/po-1",
        headers: authHeaders("staff-1", "staff")
      });

      expect(listResponse.statusCode).toBe(403);
      expect(detailResponse.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("lets shift leads record goods receipts and passes actor context to the service", async () => {
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
        headers: authHeaders("shift-1", "shift_lead"),
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
          actor: expect.objectContaining({
            userId: "shift-1",
            role: "shift_lead",
            organizationId: testOrganizationId
          })
        }
      ]);
    } finally {
      await app.close();
    }
  });

  it("prevents staff from recording goods receipts", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "POST",
        url: "/goods-receipts",
        headers: authHeaders("staff-1", "staff"),
        payload: {
          items: [{ inventoryItemId: "item-1", quantity: 8, unit: "Stück" }]
        }
      });

      expect(response.statusCode).toBe(403);
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
        headers: authHeaders("shift-1", "shift_lead")
      });
      const detailResponse = await app.inject({
        method: "GET",
        url: "/goods-receipts/gr-1",
        headers: authHeaders("shift-1", "shift_lead")
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

  it("prevents staff from booking or reading goods receipts", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const createResponse = await app.inject({
        method: "POST",
        url: "/goods-receipts",
        headers: authHeaders("staff-1", "staff"),
        payload: {
          items: [{ inventoryItemId: "item-1", quantity: 8, unit: "Stück" }]
        }
      });
      const listResponse = await app.inject({
        method: "GET",
        url: "/goods-receipts",
        headers: authHeaders("staff-1", "staff")
      });
      const detailResponse = await app.inject({
        method: "GET",
        url: "/goods-receipts/gr-1",
        headers: authHeaders("staff-1", "staff")
      });

      expect(createResponse.statusCode).toBe(403);
      expect(listResponse.statusCode).toBe(403);
      expect(detailResponse.statusCode).toBe(403);
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
        headers: authHeaders("staff-1", "staff"),
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
          actor: expect.objectContaining({
            userId: "staff-1",
            role: "staff",
            organizationId: testOrganizationId
          })
        }
      ]);
    } finally {
      await app.close();
    }
  });

  it("lets admins and shift leads record withdrawals", async () => {
    for (const role of ["admin", "shift_lead"] as const) {
      const app = buildApp({
        inventory: fakeInventoryServices()
      });

      try {
        await app.ready();
        const response = await app.inject({
          method: "POST",
          url: "/withdrawals",
          headers: authHeaders(`${role}-1`, role),
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
      } finally {
        await app.close();
      }
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
        headers: authHeaders("staff-1", "staff"),
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
          actor: expect.objectContaining({
            userId: "staff-1",
            role: "staff",
            organizationId: testOrganizationId
          })
        }
      ]);
    } finally {
      await app.close();
    }
  });

  it("lets admins and shift leads request inventory corrections", async () => {
    for (const role of ["admin", "shift_lead"] as const) {
      const app = buildApp({
        inventory: fakeInventoryServices()
      });

      try {
        await app.ready();
        const response = await app.inject({
          method: "POST",
          url: "/correction-requests",
          headers: authHeaders(`${role}-1`, role),
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
      } finally {
        await app.close();
      }
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
        headers: authHeaders("admin-1", "admin")
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
          actor: expect.objectContaining({
            userId: "admin-1",
            role: "admin",
            organizationId: testOrganizationId
          })
        }
      ]);
    } finally {
      await app.close();
    }
  });

  it("prevents shift leads from approving correction requests", async () => {
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
        headers: authHeaders("shift-1", "shift_lead")
      });

      expect(response.statusCode).toBe(403);
      expect(calls).toEqual([]);
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
        headers: authHeaders("admin-1", "admin")
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        correctionRequestId: "correction-1",
        status: "rejected"
      });
      expect(calls).toEqual([
        {
          id: "correction-1",
          actor: expect.objectContaining({
            userId: "admin-1",
            role: "admin",
            organizationId: testOrganizationId
          })
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
        headers: authHeaders("admin-1", "admin")
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        id: "task-1",
        status: "in_review"
      });
      expect(calls).toEqual([
        {
          id: "task-1",
          actor: expect.objectContaining({
            userId: "admin-1",
            role: "admin",
            organizationId: testOrganizationId
          })
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
        headers: authHeaders("admin-1", "admin")
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
        headers: authHeaders("admin-1", "admin")
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

  it("prevents shift leads and staff from reading or changing review tasks", async () => {
    for (const role of ["shift_lead", "staff"] as const) {
      const app = buildApp({
        inventory: fakeInventoryServices()
      });

      try {
        await app.ready();
        const readResponse = await app.inject({
          method: "GET",
          url: "/admin/review-tasks",
          headers: authHeaders(`${role}-1`, role)
        });
        const startResponse = await app.inject({
          method: "POST",
          url: "/admin/review-tasks/task-1/start-review",
          headers: authHeaders(`${role}-1`, role)
        });
        const resolveResponse = await app.inject({
          method: "POST",
          url: "/admin/review-tasks/task-1/resolve",
          headers: authHeaders(`${role}-1`, role)
        });
        const dismissResponse = await app.inject({
          method: "POST",
          url: "/admin/review-tasks/task-1/dismiss",
          headers: authHeaders(`${role}-1`, role)
        });

        expect(readResponse.statusCode).toBe(403);
        expect(startResponse.statusCode).toBe(403);
        expect(resolveResponse.statusCode).toBe(403);
        expect(dismissResponse.statusCode).toBe(403);
      } finally {
        await app.close();
      }
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
        headers: authHeaders("admin-1", "admin")
      });
      const reviewResponse = await app.inject({
        method: "GET",
        url: "/admin/review-tasks",
        headers: authHeaders("admin-1", "admin")
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
            type: "inventory.correction_request",
            status: "open",
            severity: "warning",
            title: "Bestandskorrektur prüfen",
            description: "Tomaten passiert 5kg: Korrektur um -1 Stück angefordert.",
            correctionRequestId: "correction-1",
            createdAt: "2026-05-25T20:00:00.000Z"
          }
        ]
      });
    } finally {
      await app.close();
    }
  });

  it("lets admins export, import, and reset inventory CSV data", async () => {
    const calls: Array<{ csv: string; reset?: boolean; actorUserId: string; actorOrganizationId: string } | "reset"> = [];
    const app = buildApp({
      inventory: fakeInventoryServices({
        inventoryCsvService: {
          async exportCsv() {
            return "name,sku,category,defaultUnit,minStock,storageLocationName,currentStock\nTomaten,TOM,food,kg,1,Kueche,3";
          },
          async importCsv(input) {
            calls.push(input);

            return {
              importedItems: 1,
              importedMovements: 1,
              reset: input.reset ?? false
            };
          },
          async reset() {
            calls.push("reset");

            return {
              deletedWorkflowTasks: 1,
              deletedWorkflowEvents: 1,
              deletedCorrectionRequests: 1,
              deletedStockSnapshots: 1,
              deletedMovements: 1,
              deletedReceiptItems: 1,
              deletedReceipts: 1,
              deletedOrderItems: 1,
              deletedOrders: 1,
              deletedItems: 1,
              deletedSuppliers: 1,
              deletedStorageLocations: 1
            };
          }
        }
      })
    });

    try {
      await app.ready();

      const exportResponse = await app.inject({
        method: "GET",
        url: "/admin/inventory/csv",
        headers: authHeaders("admin-1", "admin")
      });
      const importResponse = await app.inject({
        method: "POST",
        url: "/admin/inventory/csv-import",
        headers: authHeaders("admin-1", "admin"),
        payload: {
          csv: "name,sku,category,defaultUnit,minStock,storageLocationName,currentStock\nTomaten,TOM,food,kg,1,Kueche,3",
          reset: true
        }
      });
      const resetResponse = await app.inject({
        method: "POST",
        url: "/admin/inventory/reset",
        headers: authHeaders("admin-1", "admin"),
        payload: {}
      });

      expect(exportResponse.statusCode).toBe(200);
      expect(exportResponse.headers["content-type"]).toContain("text/csv");
      expect(exportResponse.body).toContain("Tomaten,TOM,food,kg,1,Kueche,3");
      expect(importResponse.statusCode).toBe(200);
      expect(importResponse.json()).toEqual({
        importedItems: 1,
        importedMovements: 1,
        reset: true
      });
      expect(resetResponse.statusCode).toBe(200);
      expect(resetResponse.json()).toMatchObject({
        deletedItems: 1,
        deletedStorageLocations: 1
      });
      expect(calls).toEqual([
        {
          csv: "name,sku,category,defaultUnit,minStock,storageLocationName,currentStock\nTomaten,TOM,food,kg,1,Kueche,3",
          reset: true,
          actorUserId: "admin-1",
          actorOrganizationId: testOrganizationId
        },
        "reset"
      ]);
    } finally {
      await app.close();
    }
  });

  it("prevents non-admin roles from CSV and reset endpoints", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();

      for (const route of ["/admin/inventory/csv", "/admin/inventory/csv-import", "/admin/inventory/reset"]) {
        const response = await app.inject({
          method: route === "/admin/inventory/csv" ? "GET" : "POST",
          url: route,
          headers: authHeaders("staff-1", "staff"),
          payload: route === "/admin/inventory/csv-import" ? { csv: "name" } : {}
        });

        expect(response.statusCode).toBe(403);
      }
    } finally {
      await app.close();
    }
  });

  it("returns operational master data for workflow controls", async () => {
    const app = buildApp({
      inventory: fakeInventoryServices()
    });

    try {
      await app.ready();
      const response = await app.inject({
        method: "GET",
        url: "/inventory/master-data",
        headers: authHeaders("staff-1", "staff")
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(expectedMasterData());
    } finally {
      await app.close();
    }
  });
});

function fakeInventoryServices(
  overrides: Partial<{
    purchaseOrderService: PurchaseOrderServicePort;
    inventoryItemService: InventoryItemServicePort;
    inventoryMasterDataService: InventoryMasterDataServicePort;
    goodsReceiptService: GoodsReceiptServicePort;
    inventoryReadService: InventoryReadServicePort;
    withdrawalService: WithdrawalServicePort;
    correctionService: CorrectionServicePort;
    reviewTaskService: ReviewTaskServicePort;
    inventoryCsvService: InventoryCsvServicePort;
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
      async cancel() {
        return { purchaseOrderId: "po-1", status: "cancelled" };
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
    inventoryMasterDataService: overrides.inventoryMasterDataService ?? {
      async list() {
        return expectedMasterData();
      }
    } as InventoryMasterDataServicePort,
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
    inventoryCsvService: overrides.inventoryCsvService ?? {
      async exportCsv() {
        return "name,sku,category,defaultUnit,minStock,storageLocationName,currentStock\n";
      },
      async importCsv() {
        return {
          importedItems: 0,
          importedMovements: 0,
          reset: false
        };
      },
      async reset() {
        return {
          deletedWorkflowTasks: 0,
          deletedWorkflowEvents: 0,
          deletedCorrectionRequests: 0,
          deletedStockSnapshots: 0,
          deletedMovements: 0,
          deletedReceiptItems: 0,
          deletedReceipts: 0,
          deletedOrderItems: 0,
          deletedOrders: 0,
          deletedItems: 0,
          deletedSuppliers: 0,
          deletedStorageLocations: 0
        };
      }
    } as InventoryCsvServicePort,
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
        return [
          {
            id: "move-1",
            inventoryItemId: "item-1",
            inventoryItemName: "Tomaten passiert 5kg",
            type: "goods_received",
            quantity: 8,
            unit: "Stück",
            actorUserId: "shift-1",
            storageLocationName: "Küche",
            goodsReceiptId: "gr-1",
            purchaseOrderId: "po-1",
            relatedMovementId: undefined,
            idempotencyKey: "inventory.goods_receipt.recorded:gr-1",
            correlationId: "gr-1",
            sourceType: "goods_receipt",
            sourceId: "gr-1",
            note: "DEMO_MODE Wareneingang",
            createdAt: "2026-05-25T20:00:00.000Z"
          }
        ];
      },
      async listOpenReviewTasks() {
        return [
          {
            id: "task-1",
            type: "inventory.correction_request",
            status: "open",
            severity: "warning",
            title: "Bestandskorrektur prüfen",
            description: "Tomaten passiert 5kg: Korrektur um -1 Stück angefordert.",
            correctionRequestId: "correction-1",
            createdAt: "2026-05-25T20:00:00.000Z"
          }
        ];
      }
    },
    auth: {
      jwtSecret: testJwtSecret,
      db: {
        organizationMember: {
          async findMany(args: { where: { userId: string } }) {
            const role = organizationRoleForUser(args.where.userId);
            if (!role) {
              return [];
            }

            return [
              {
                organizationId: testOrganizationId,
                role,
                createdAt: new Date("2026-05-30T10:00:00.000Z")
              }
            ];
          }
        }
      }
    }
  };
}

function organizationRoleForUser(userId: string): "owner" | "admin" | "manager" | "staff" | "viewer" | null {
  if (userId.startsWith("owner-")) {
    return "owner";
  }
  if (userId.startsWith("admin-")) {
    return "admin";
  }
  if (userId.startsWith("shift-") || userId.startsWith("shift_lead-")) {
    return "manager";
  }
  if (userId.startsWith("staff-")) {
    return "staff";
  }
  if (userId.startsWith("viewer-")) {
    return "viewer";
  }

  return null;
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

function expectedMasterData() {
  return {
    suppliers: [
      {
        supplierId: "supplier-1",
        name: "Frischemarkt",
        email: "bestellung@example.test",
        phone: "030-123456",
        isActive: true
      }
    ],
    storageLocations: [
      {
        storageLocationId: "loc-1",
        name: "Küche",
        type: "kitchen",
        isActive: true
      }
    ],
    items: [expectedInventoryItemReadModel()],
    stock: [
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
    ],
    openPurchaseOrders: [expectedPurchaseOrderReadModel()]
  };
}
