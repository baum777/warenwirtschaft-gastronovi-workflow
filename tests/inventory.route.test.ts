import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import {
  InMemoryInventoryRepository,
  seedInventoryState
} from "../src/modules/inventory/in-memory-inventory.repository.js";

describe("Inventory routes", () => {
  it("filters readable inventory items by actor workspace access", async () => {
    const app = buildApp({
      inventoryRepository: new InMemoryInventoryRepository(seedInventoryState())
    });

    try {
      await app.ready();

      const allowed = await app.inject({
        method: "GET",
        url: "/inventory/items?workspace=KITCHEN",
        headers: {
          "x-actor-id": "user_staff_kitchen",
          "x-actor-role": "STAFF"
        }
      });

      expect(allowed.statusCode).toBe(200);
      expect(allowed.json().items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "item_tomatoes",
            workspace: "KITCHEN"
          })
        ])
      );

      const forbidden = await app.inject({
        method: "GET",
        url: "/inventory/items?workspace=SERVICE",
        headers: {
          "x-actor-id": "user_staff_kitchen",
          "x-actor-role": "STAFF"
        }
      });

      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json()).toMatchObject({
        error: "WORKSPACE_FORBIDDEN"
      });
    } finally {
      await app.close();
    }
  });

  it("creates accepted and conflict movement responses through the API", async () => {
    const app = buildApp({
      inventoryRepository: new InMemoryInventoryRepository(seedInventoryState())
    });

    try {
      await app.ready();

      const accepted = await app.inject({
        method: "POST",
        url: "/movements",
        headers: {
          "x-actor-id": "user_staff_kitchen",
          "x-actor-role": "STAFF"
        },
        payload: {
          type: "OUT",
          inventoryItemId: "item_tomatoes",
          workspace: "KITCHEN",
          quantity: 1,
          unit: "kg",
          baseStockVersion: 3,
          clientMutationId: "client-route-accepted-1"
        }
      });

      expect(accepted.statusCode).toBe(201);
      expect(accepted.json()).toMatchObject({
        status: "ACCEPTED",
        currentStock: 11,
        stockVersion: 4
      });

      const conflict = await app.inject({
        method: "POST",
        url: "/movements",
        headers: {
          "x-actor-id": "user_staff_kitchen",
          "x-actor-role": "STAFF"
        },
        payload: {
          type: "OUT",
          inventoryItemId: "item_milk",
          workspace: "KITCHEN",
          quantity: 6,
          unit: "l",
          baseStockVersion: 2,
          clientMutationId: "client-route-conflict-1"
        }
      });

      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toEqual({
        status: "CONFLICT",
        clientMutationId: "client-route-conflict-1",
        reason: "INSUFFICIENT_STOCK",
        currentStock: 4,
        stockVersion: 2
      });
    } finally {
      await app.close();
    }
  });
});
