import { describe, expect, it } from "vitest";

import { ensureDemoData } from "../src/modules/inventory/demo-seed.service.js";

describe("ensureDemoData", () => {
  it("seeds the MVP demo dataset through deterministic upserts", async () => {
    const calls: Array<{ model: string; args: unknown }> = [];
    const db = demoSeedDb(calls);
    const now = new Date("2026-05-28T08:00:00.000Z");

    await ensureDemoData(db, now);

    expect(calls.every((call) => "where" in (call.args as Record<string, unknown>))).toBe(true);
    expect(calls).toContainEqual(
      expect.objectContaining({
        model: "supplier",
        args: expect.objectContaining({
          where: { id: "demo-supplier-frischemarkt-sued" },
          create: expect.objectContaining({ name: "Frischemarkt Süd" })
        })
      })
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        model: "storageLocation",
        args: expect.objectContaining({
          where: { id: "demo-location-kuehlhaus" },
          create: expect.objectContaining({ name: "Kühlhaus" })
        })
      })
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        model: "inventoryItem",
        args: expect.objectContaining({
          where: { id: "demo-item-tomaten" },
          create: expect.objectContaining({ name: "Tomaten" })
        })
      })
    );
    expect(calls.filter((call) => call.model === "inventoryItem")).toHaveLength(9);
    expect(calls).toContainEqual(
      expect.objectContaining({
        model: "purchaseOrder",
        args: expect.objectContaining({
          where: { id: "demo-po-open-frischemarkt" },
          create: expect.objectContaining({ status: "ordered" })
        })
      })
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        model: "goodsReceipt",
        args: expect.objectContaining({
          where: { id: "demo-goods-receipt-1" }
        })
      })
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        model: "inventoryMovement",
        args: expect.objectContaining({
          where: { id: "demo-movement-withdrawal-1" },
          create: expect.objectContaining({ type: "item_removed" })
        })
      })
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        model: "inventoryCorrectionRequest",
        args: expect.objectContaining({
          where: { id: "demo-correction-request-1" },
          create: expect.objectContaining({ reason: "Inventurdifferenz Demo" })
        })
      })
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        model: "workflowTask",
        args: expect.objectContaining({
          where: { id: "demo-review-task-correction-1" },
          create: expect.objectContaining({ status: "open", title: "Bestandskorrektur prüfen" })
        })
      })
    );
  });
});

function demoSeedDb(calls: Array<{ model: string; args: unknown }>) {
  const model = (name: string) => ({
    async upsert(args: unknown) {
      calls.push({ model: name, args });
      return (args as { create: unknown }).create;
    }
  });

  return {
    supplier: model("supplier"),
    storageLocation: model("storageLocation"),
    inventoryItem: model("inventoryItem"),
    purchaseOrder: model("purchaseOrder"),
    purchaseOrderItem: model("purchaseOrderItem"),
    goodsReceipt: model("goodsReceipt"),
    goodsReceiptItem: model("goodsReceiptItem"),
    inventoryMovement: model("inventoryMovement"),
    inventoryStockSnapshot: model("inventoryStockSnapshot"),
    inventoryCorrectionRequest: model("inventoryCorrectionRequest"),
    workflowTask: model("workflowTask")
  };
}
