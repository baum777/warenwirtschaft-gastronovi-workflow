import { describe, expect, it } from "vitest";

import { InventoryItemService } from "../src/modules/inventory/inventory-item.service.js";

describe("InventoryItemService", () => {
  it("creates active inventory items without changing stock", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const service = new InventoryItemService({
      db: inventoryItemDb({ calls })
    });

    const result = await service.create({
      name: "Tomaten passiert 5kg",
      sku: "TOM-5",
      category: "food",
      defaultUnit: "Stück",
      minStock: 4,
      storageLocationId: "loc-1"
    });

    expect(result).toEqual(expectedItemReadModel());
    expect(calls).toEqual([
      {
        model: "inventoryItem",
        method: "create",
        args: {
          data: {
            name: "Tomaten passiert 5kg",
            sku: "TOM-5",
            category: "food",
            defaultUnit: "Stück",
            minStock: 4,
            storageLocationId: "loc-1"
          },
          include: inventoryItemIncludeExpectation()
        }
      }
    ]);
    expect(calls.some((call) => call.model === "inventoryMovement")).toBe(false);
    expect(calls.some((call) => call.model === "inventoryStockSnapshot")).toBe(false);
  });

  it("lists inventory items including inactive items for admins", async () => {
    const service = new InventoryItemService({
      db: inventoryItemDb({
        listRecords: [
          inventoryItemRecord(),
          inventoryItemRecord({
            id: "item-2",
            name: "Altes Öl",
            isActive: false
          })
        ]
      })
    });

    await expect(service.list()).resolves.toEqual([
      expectedItemReadModel(),
      {
        ...expectedItemReadModel(),
        inventoryItemId: "item-2",
        name: "Altes Öl",
        isActive: false
      }
    ]);
  });

  it("updates item metadata without changing stock", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const service = new InventoryItemService({
      db: inventoryItemDb({ calls })
    });

    const result = await service.update("item-1", {
      name: "Tomaten passiert 6kg",
      minStock: 6
    });

    expect(result).toEqual({
      ...expectedItemReadModel(),
      name: "Tomaten passiert 6kg",
      minStock: 6
    });
    expect(calls).toContainEqual({
      model: "inventoryItem",
      method: "update",
      args: {
        where: {
          id: "item-1"
        },
        data: {
          name: "Tomaten passiert 6kg",
          minStock: 6
        },
        include: inventoryItemIncludeExpectation()
      }
    });
    expect(calls.some((call) => call.model === "inventoryMovement")).toBe(false);
    expect(calls.some((call) => call.model === "inventoryStockSnapshot")).toBe(false);
  });

  it("soft-deactivates inventory items instead of deleting them", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const service = new InventoryItemService({
      db: inventoryItemDb({
        calls,
        updatedRecord: inventoryItemRecord({
          isActive: false
        })
      })
    });

    const result = await service.deactivate("item-1");

    expect(result).toEqual({
      ...expectedItemReadModel(),
      isActive: false
    });
    expect(calls).toContainEqual({
      model: "inventoryItem",
      method: "update",
      args: {
        where: {
          id: "item-1"
        },
        data: {
          isActive: false
        },
        include: inventoryItemIncludeExpectation()
      }
    });
    expect(calls.some((call) => call.method === "delete")).toBe(false);
  });
});

function inventoryItemDb(input: {
  calls?: Array<{ model: string; method: string; args?: unknown }>;
  listRecords?: InventoryItemRecord[];
  updatedRecord?: InventoryItemRecord;
} = {}) {
  const calls = input.calls ?? [];

  return {
    inventoryItem: {
      async create(args: unknown) {
        calls.push({ model: "inventoryItem", method: "create", args });
        return inventoryItemRecord();
      },
      async findMany(args: unknown) {
        calls.push({ model: "inventoryItem", method: "findMany", args });
        return input.listRecords ?? [inventoryItemRecord()];
      },
      async findUnique(args: unknown) {
        calls.push({ model: "inventoryItem", method: "findUnique", args });
        return inventoryItemRecord();
      },
      async update(args: { data: Partial<InventoryItemRecord> }) {
        calls.push({ model: "inventoryItem", method: "update", args });
        return input.updatedRecord ?? inventoryItemRecord(args.data);
      }
    }
  };
}

function inventoryItemRecord(overrides: Partial<InventoryItemRecord> = {}): InventoryItemRecord {
  return {
    id: "item-1",
    name: "Tomaten passiert 5kg",
    sku: "TOM-5",
    category: "food",
    defaultUnit: "Stück",
    minStock: 4,
    storageLocationId: "loc-1",
    storageLocation: {
      name: "Küche"
    },
    isActive: true,
    createdAt: new Date("2026-05-26T10:00:00.000Z"),
    updatedAt: new Date("2026-05-26T11:00:00.000Z"),
    ...overrides
  };
}

function expectedItemReadModel() {
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

function inventoryItemIncludeExpectation() {
  return {
    storageLocation: {
      select: {
        name: true
      }
    }
  };
}

type InventoryItemRecord = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  defaultUnit: string;
  minStock: number | null;
  storageLocationId: string | null;
  storageLocation?: {
    name: string;
  } | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};
