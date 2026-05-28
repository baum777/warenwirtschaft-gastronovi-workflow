import { describe, expect, it } from "vitest";

import { InventoryStockService } from "../src/modules/inventory/inventory-stock.service.js";

describe("InventoryStockService", () => {
  it("does not upsert a snapshot without a storage location", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const service = new InventoryStockService({
      db: stockDb(calls)
    });

    await expect(
      service.refreshSnapshot({
        inventoryItemId: "item-1",
        unit: "piece"
      })
    ).resolves.toBe(3);

    expect(calls.map((call) => `${call.model}.${call.method}`)).toEqual([
      "inventoryMovement.findMany"
    ]);
  });

  it("upserts a snapshot when a storage location is present", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const now = new Date("2026-05-27T20:00:00.000Z");
    const service = new InventoryStockService({
      now: () => now,
      db: stockDb(calls)
    });

    await expect(
      service.refreshSnapshot({
        inventoryItemId: "item-1",
        storageLocationId: "loc-1",
        unit: "piece"
      })
    ).resolves.toBe(3);

    expect(calls).toContainEqual({
      model: "inventoryStockSnapshot",
      method: "upsert",
      args: {
        where: {
          inventoryItemId_storageLocationId: {
            inventoryItemId: "item-1",
            storageLocationId: "loc-1"
          }
        },
        create: {
          inventoryItemId: "item-1",
          storageLocationId: "loc-1",
          quantity: 3,
          unit: "piece",
          calculatedAt: now
        },
        update: {
          quantity: 3,
          unit: "piece",
          calculatedAt: now
        }
      }
    });
  });
});

function stockDb(calls: Array<{ model: string; method: string; args?: unknown }>) {
  return {
    inventoryMovement: {
      async findMany(args: unknown) {
        calls.push({ model: "inventoryMovement", method: "findMany", args });
        return [
          { type: "goods_received" as const, quantity: 5 },
          { type: "item_removed" as const, quantity: 2 }
        ];
      }
    },
    inventoryStockSnapshot: {
      async upsert(args: unknown) {
        calls.push({ model: "inventoryStockSnapshot", method: "upsert", args });
        return { id: "snapshot-1" };
      }
    }
  };
}
