import { describe, expect, it } from "vitest";

import {
  parseInventoryCsv,
  serializeInventoryCsv
} from "../src/modules/inventory/inventory-csv.service.js";

describe("inventory CSV service helpers", () => {
  it("serializes inventory rows with stable headers and escaped cells", () => {
    const csv = serializeInventoryCsv([
      {
        name: 'Tomaten, "San Marzano"',
        sku: "TOM-1",
        category: "food",
        defaultUnit: "kg",
        minStock: 2,
        storageLocationName: "Kueche",
        currentStock: 5
      }
    ]);

    expect(csv).toBe(
      'name,sku,category,defaultUnit,minStock,storageLocationName,currentStock\n"Tomaten, ""San Marzano""",TOM-1,food,kg,2,Kueche,5'
    );
  });

  it("parses inventory rows and normalizes optional numbers", () => {
    const rows = parseInventoryCsv(
      'name,sku,category,defaultUnit,minStock,storageLocationName,currentStock\n"Tomaten, rot",TOM,food,kg,1,Kueche,3\nServietten,,,Packung,,,'
    );

    expect(rows).toEqual([
      {
        name: "Tomaten, rot",
        sku: "TOM",
        category: "food",
        defaultUnit: "kg",
        minStock: 1,
        storageLocationName: "Kueche",
        currentStock: 3
      },
      {
        name: "Servietten",
        sku: undefined,
        category: undefined,
        defaultUnit: "Packung",
        minStock: undefined,
        storageLocationName: undefined,
        currentStock: 0
      }
    ]);
  });

  it("fails closed when required CSV headers are missing", () => {
    expect(() => parseInventoryCsv("name,sku\nTomaten,TOM")).toThrow(/CSV header missing/);
  });
});
