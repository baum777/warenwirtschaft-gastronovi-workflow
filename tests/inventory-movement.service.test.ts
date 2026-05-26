import { describe, expect, it } from "vitest";

import {
  InMemoryInventoryRepository,
  seedInventoryState
} from "../src/modules/inventory/in-memory-inventory.repository.js";
import { InventoryMovementService } from "../src/modules/inventory/inventory-movement.service.js";

function buildService() {
  const repository = new InMemoryInventoryRepository(seedInventoryState());

  return {
    repository,
    service: new InventoryMovementService({ repository })
  };
}

describe("InventoryMovementService", () => {
  it("accepts a STAFF outbound movement in an assigned workspace", async () => {
    const { service } = buildService();

    const result = await service.createMovement({
      actorId: "user_staff_kitchen",
      actorRole: "STAFF",
      type: "OUT",
      inventoryItemId: "item_tomatoes",
      workspace: "KITCHEN",
      quantity: 2,
      unit: "kg",
      baseStockVersion: 3,
      clientMutationId: "client-kitchen-out-1"
    });

    expect(result).toMatchObject({
      status: "ACCEPTED",
      currentStock: 10,
      stockVersion: 4
    });
  });

  it("rejects STAFF movement attempts outside assigned workspaces", async () => {
    const { service } = buildService();

    const result = await service.createMovement({
      actorId: "user_staff_kitchen",
      actorRole: "STAFF",
      type: "OUT",
      inventoryItemId: "item_beer_keg",
      workspace: "SERVICE",
      quantity: 1,
      unit: "Fass",
      baseStockVersion: 8,
      clientMutationId: "client-service-forbidden-1"
    });

    expect(result).toEqual({
      status: "REJECTED",
      clientMutationId: "client-service-forbidden-1",
      reason: "WORKSPACE_FORBIDDEN"
    });
  });

  it("returns a conflict when STAFF removal would create negative stock", async () => {
    const { service } = buildService();

    const result = await service.createMovement({
      actorId: "user_staff_kitchen",
      actorRole: "STAFF",
      type: "OUT",
      inventoryItemId: "item_milk",
      workspace: "KITCHEN",
      quantity: 6,
      unit: "l",
      baseStockVersion: 2,
      clientMutationId: "client-negative-stock-1"
    });

    expect(result).toEqual({
      status: "CONFLICT",
      clientMutationId: "client-negative-stock-1",
      reason: "INSUFFICIENT_STOCK",
      currentStock: 4,
      stockVersion: 2
    });
  });

  it("returns a conflict when the client stock version is stale", async () => {
    const { service } = buildService();

    const result = await service.createMovement({
      actorId: "user_staff_kitchen",
      actorRole: "STAFF",
      type: "OUT",
      inventoryItemId: "item_tomatoes",
      workspace: "KITCHEN",
      quantity: 1,
      unit: "kg",
      baseStockVersion: 1,
      clientMutationId: "client-stale-version-1"
    });

    expect(result).toEqual({
      status: "CONFLICT",
      clientMutationId: "client-stale-version-1",
      reason: "STALE_STOCK_VERSION",
      currentStock: 12,
      stockVersion: 3
    });
  });

  it("syncs an offline queue with per-item statuses", async () => {
    const { service } = buildService();

    const result = await service.syncMovements({
      actorId: "user_staff_kitchen",
      actorRole: "STAFF",
      items: [
        {
          type: "OUT",
          inventoryItemId: "item_tomatoes",
          workspace: "KITCHEN",
          quantity: 1,
          unit: "kg",
          baseStockVersion: 3,
          clientMutationId: "client-sync-accepted-1"
        },
        {
          type: "OUT",
          inventoryItemId: "item_beer_keg",
          workspace: "SERVICE",
          quantity: 1,
          unit: "Fass",
          baseStockVersion: 8,
          clientMutationId: "client-sync-rejected-1"
        }
      ]
    });

    expect(result.results).toEqual([
      expect.objectContaining({
        status: "ACCEPTED",
        clientMutationId: "client-sync-accepted-1"
      }),
      {
        status: "REJECTED",
        clientMutationId: "client-sync-rejected-1",
        reason: "WORKSPACE_FORBIDDEN"
      }
    ]);
  });
});
