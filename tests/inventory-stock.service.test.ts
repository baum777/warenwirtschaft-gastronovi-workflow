import { describe, expect, it } from "vitest";

import { InventoryStockService } from "../src/modules/inventory/inventory-stock.service.js";

describe("InventoryStockService", () => {
  it("refreshes an unlocated snapshot without nullable compound upsert", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const now = new Date("2026-05-26T12:00:00.000Z");
    const service = new InventoryStockService({
      now: () => now,
      db: {
        inventoryMovement: {
          async findMany(args) {
            calls.push({ model: "inventoryMovement", method: "findMany", args });
            return [
              { type: "goods_received", quantity: 8, createdAt: now },
              { type: "item_removed", quantity: 3, createdAt: now }
            ];
          }
        },
        inventoryStockSnapshot: {
          async findFirst(args) {
            calls.push({ model: "inventoryStockSnapshot", method: "findFirst", args });
            return null;
          },
          async create(args) {
            calls.push({ model: "inventoryStockSnapshot", method: "create", args });
            return { id: "snapshot-1" };
          },
          async update(args) {
            calls.push({ model: "inventoryStockSnapshot", method: "update", args });
            return { id: "snapshot-1" };
          },
          async upsert(args) {
            calls.push({ model: "inventoryStockSnapshot", method: "upsert", args });
            return { id: "snapshot-1" };
          }
        }
      }
    });

    await expect(
      service.refreshSnapshot({
        inventoryItemId: "item-1",
        unit: "Stück"
      })
    ).resolves.toBe(5);

    expect(calls.map((call) => `${call.model}.${call.method}`)).toEqual([
      "inventoryMovement.findMany",
      "inventoryStockSnapshot.findFirst",
      "inventoryStockSnapshot.create"
    ]);
    expect(calls).toContainEqual({
      model: "inventoryStockSnapshot",
      method: "create",
      args: {
        data: {
          inventoryItemId: "item-1",
          storageLocationId: null,
          quantity: 5,
          unit: "Stück",
          calculatedAt: now
        }
      }
    });
  });

  it("updates an existing unlocated snapshot by id", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const now = new Date("2026-05-26T12:05:00.000Z");
    const service = new InventoryStockService({
      now: () => now,
      db: {
        inventoryMovement: {
          async findMany() {
            return [{ type: "goods_received", quantity: 2, createdAt: now }];
          }
        },
        inventoryStockSnapshot: {
          async findFirst(args) {
            calls.push({ model: "inventoryStockSnapshot", method: "findFirst", args });
            return { id: "snapshot-1" };
          },
          async update(args) {
            calls.push({ model: "inventoryStockSnapshot", method: "update", args });
            return { id: "snapshot-1" };
          },
          async create(args) {
            calls.push({ model: "inventoryStockSnapshot", method: "create", args });
            return { id: "snapshot-1" };
          },
          async upsert(args) {
            calls.push({ model: "inventoryStockSnapshot", method: "upsert", args });
            return { id: "snapshot-1" };
          }
        }
      }
    });

    await expect(
      service.refreshSnapshot({
        inventoryItemId: "item-1",
        unit: "Stück"
      })
    ).resolves.toBe(2);

    expect(calls.map((call) => `${call.model}.${call.method}`)).toEqual([
      "inventoryStockSnapshot.findFirst",
      "inventoryStockSnapshot.update"
    ]);
    expect(calls).toContainEqual({
      model: "inventoryStockSnapshot",
      method: "update",
      args: {
        where: {
          id: "snapshot-1"
        },
        data: {
          quantity: 2,
          unit: "Stück",
          calculatedAt: now
        }
      }
    });
  });

  it("keeps compound upsert for located snapshots", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const now = new Date("2026-05-26T12:10:00.000Z");
    const service = new InventoryStockService({
      now: () => now,
      db: {
        inventoryMovement: {
          async findMany() {
            return [{ type: "goods_received", quantity: 4, createdAt: now }];
          }
        },
        inventoryStockSnapshot: {
          async findFirst(args) {
            calls.push({ model: "inventoryStockSnapshot", method: "findFirst", args });
            return null;
          },
          async create(args) {
            calls.push({ model: "inventoryStockSnapshot", method: "create", args });
            return { id: "snapshot-1" };
          },
          async update(args) {
            calls.push({ model: "inventoryStockSnapshot", method: "update", args });
            return { id: "snapshot-1" };
          },
          async upsert(args) {
            calls.push({ model: "inventoryStockSnapshot", method: "upsert", args });
            return { id: "snapshot-1" };
          }
        }
      }
    });

    await expect(
      service.refreshSnapshot({
        inventoryItemId: "item-1",
        storageLocationId: "loc-1",
        unit: "Stück"
      })
    ).resolves.toBe(4);

    expect(calls).toEqual([
      {
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
            quantity: 4,
            unit: "Stück",
            calculatedAt: now
          },
          update: {
            quantity: 4,
            unit: "Stück",
            calculatedAt: now
          }
        }
      }
    ]);
  });
});
