import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

function getBlock(kind: "model" | "enum", name: string): string {
  const match = schema.match(new RegExp(`^${kind}\\s+${name}\\s+\\{([\\s\\S]*?)^\\}`, "m"));

  expect(match, `${kind} ${name} should exist`).not.toBeNull();

  return match?.[1] ?? "";
}

function expectLine(block: string, line: string): void {
  expect(block).toMatch(new RegExp(`^\\s*${escapeRegExp(line)}\\s*$`, "m"));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("Inventory Prisma schema presence", () => {
  it("contains the Inventory-1 domain models", () => {
    const expectedModels = [
      "InventoryItem",
      "Supplier",
      "StorageLocation",
      "PurchaseOrder",
      "PurchaseOrderItem",
      "GoodsReceipt",
      "GoodsReceiptItem",
      "InventoryMovement",
      "InventoryStockSnapshot",
      "InventoryCorrectionRequest"
    ];

    for (const model of expectedModels) {
      expect(getBlock("model", model)).toBeTruthy();
    }
  });

  it("contains the Inventory-1 domain enums", () => {
    const expectedEnums = [
      "PurchaseOrderStatus",
      "InventoryMovementType",
      "InventoryCorrectionStatus"
    ];

    for (const enumName of expectedEnums) {
      expect(getBlock("enum", enumName)).toBeTruthy();
    }
  });

  it("preserves existing POS workflow models", () => {
    const existingModels = ["SyncRun", "RawPayload", "WorkflowEvent", "WorkflowTask"];

    for (const model of existingModels) {
      expect(getBlock("model", model)).toBeTruthy();
    }
  });
});

describe("Inventory Prisma schema contract", () => {
  it("defines the expected purchase order statuses", () => {
    const block = getBlock("enum", "PurchaseOrderStatus");

    for (const status of ["draft", "ordered", "partially_received", "received", "cancelled"]) {
      expectLine(block, status);
    }
  });

  it("defines the expected inventory movement types", () => {
    const block = getBlock("enum", "InventoryMovementType");

    for (const type of [
      "goods_received",
      "item_removed",
      "correction_positive",
      "correction_negative"
    ]) {
      expectLine(block, type);
    }
  });

  it("keeps InventoryMovement as the inventory source-of-truth log", () => {
    const block = getBlock("model", "InventoryMovement");

    expectLine(block, "inventoryItemId   String");
    expectLine(block, "type              InventoryMovementType");
    expectLine(block, "quantity          Float");
    expectLine(block, "unit              String");
    expectLine(block, "actorUserId       String");
    expectLine(block, "createdAt         DateTime              @default(now())");
    expectLine(block, "@@index([inventoryItemId, createdAt])");
  });

  it("keeps InventoryStockSnapshot unique per item and location", () => {
    const block = getBlock("model", "InventoryStockSnapshot");

    expectLine(block, "inventoryItemId   String");
    expectLine(block, "storageLocationId String?");
    expectLine(block, "quantity          Float");
    expectLine(block, "unit              String");
    expectLine(block, "@@unique([inventoryItemId, storageLocationId])");
  });

  it("keeps purchase orders non-stock-changing at the schema boundary", () => {
    const block = getBlock("model", "PurchaseOrder");

    expectLine(block, "status      PurchaseOrderStatus @default(draft)");
    expectLine(block, "items     PurchaseOrderItem[]");
    expectLine(block, "receipts  GoodsReceipt[]");
    expect(block).not.toMatch(/quantity\s+Float/);
  });
});
