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
      "User",
      "UserWorkspaceAccess",
      "InventoryItem",
      "ItemStock",
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
      "UserRole",
      "WorkspaceCode",
      "ItemCategory",
      "ItemSubcategory",
      "PurchaseOrderStatus",
      "InventoryMovementType",
      "MovementSyncStatus",
      "MovementConflictReason",
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

  it("defines role and workspace governance enums", () => {
    const userRoleBlock = getBlock("enum", "UserRole");
    const workspaceBlock = getBlock("enum", "WorkspaceCode");

    for (const role of ["ADMIN", "AREA_LEAD", "STAFF"]) {
      expectLine(userRoleBlock, role);
    }

    for (const workspace of ["SERVICE", "HOTEL", "KITCHEN"]) {
      expectLine(workspaceBlock, workspace);
    }
  });

  it("adds workspace taxonomy to inventory items", () => {
    const block = getBlock("model", "InventoryItem");

    expectLine(block, "workspace         WorkspaceCode");
    expectLine(block, "category          ItemCategory");
    expectLine(block, "subcategory       ItemSubcategory?");
    expectLine(block, "defaultUnit       String");
    expectLine(block, "@@index([workspace, category, subcategory])");
  });

  it("keeps InventoryMovement as the inventory source-of-truth log", () => {
    const block = getBlock("model", "InventoryMovement");

    expectLine(block, "inventoryItemId   String");
    expectLine(block, "type              InventoryMovementType");
    expectLine(block, "quantity          Float");
    expectLine(block, "unit              String");
    expectLine(block, "workspace         WorkspaceCode");
    expectLine(block, "actorUserId       String");
    expectLine(block, "clientMutationId  String?               @unique");
    expectLine(block, "baseStockVersion  Int?");
    expectLine(block, "resultingStockVersion Int?");
    expectLine(block, "syncStatus        MovementSyncStatus     @default(ACCEPTED)");
    expectLine(block, "conflictReason    MovementConflictReason?");
    expectLine(block, "createdAt         DateTime              @default(now())");
    expectLine(block, "syncedAt          DateTime?");
    expectLine(block, "@@index([inventoryItemId, createdAt])");
    expectLine(block, "@@index([workspace, createdAt])");
    expectLine(block, "@@index([syncStatus])");
  });

  it("defines versioned stock rows for server-wins movement processing", () => {
    const block = getBlock("model", "ItemStock");

    expectLine(block, "inventoryItemId   String");
    expectLine(block, "storageLocationId String?");
    expectLine(block, "currentStock      Float");
    expectLine(block, "unit              String");
    expectLine(block, "version           Int              @default(1)");
    expectLine(block, "@@unique([inventoryItemId, storageLocationId])");
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
