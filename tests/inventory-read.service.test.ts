import { describe, expect, it } from "vitest";

import { InventoryReadService } from "../src/modules/inventory/inventory-read.service.js";

describe("InventoryReadService", () => {
  it("maps movement timeline rows with audit metadata and source linkage", async () => {
    const service = new InventoryReadService({
      inventoryItem: {
        async findMany() {
          return [];
        }
      },
      inventoryMovement: {
        async findMany() {
          return [
            {
              id: "move-1",
              inventoryItemId: "item-1",
              inventoryItem: {
                name: "Tomaten passiert 5kg"
              },
              type: "goods_received",
              quantity: 8,
              unit: "Stück",
              actorUserId: "shift-1",
              storageLocation: {
                name: "Küche"
              },
              purchaseOrderId: "po-1",
              goodsReceiptId: "gr-1",
              relatedMovementId: null,
              note: "Wareneingang",
              createdAt: new Date("2026-05-29T07:45:00.000Z")
            },
            {
              id: "move-2",
              inventoryItemId: "item-2",
              inventoryItem: {
                name: "Mozzarella"
              },
              type: "correction_negative",
              quantity: 1,
              unit: "kg",
              actorUserId: "admin-1",
              storageLocation: null,
              purchaseOrderId: null,
              goodsReceiptId: null,
              relatedMovementId: "move-1",
              note: "Korrektur",
              createdAt: new Date("2026-05-29T07:50:00.000Z")
            }
          ];
        }
      },
      workflowTask: {
        async findMany() {
          return [];
        }
      }
    });

    const rows = await service.listMovements();

    expect(rows).toEqual([
      {
        id: "move-1",
        inventoryItemId: "item-1",
        inventoryItemName: "Tomaten passiert 5kg",
        type: "goods_received",
        quantity: 8,
        unit: "Stück",
        actorUserId: "shift-1",
        storageLocationName: "Küche",
        purchaseOrderId: "po-1",
        goodsReceiptId: "gr-1",
        relatedMovementId: undefined,
        idempotencyKey: "inventory.goods_receipt.recorded:gr-1",
        correlationId: "gr-1",
        sourceType: "goods_receipt",
        sourceId: "gr-1",
        note: "Wareneingang",
        createdAt: "2026-05-29T07:45:00.000Z"
      },
      {
        id: "move-2",
        inventoryItemId: "item-2",
        inventoryItemName: "Mozzarella",
        type: "correction_negative",
        quantity: 1,
        unit: "kg",
        actorUserId: "admin-1",
        storageLocationName: undefined,
        purchaseOrderId: undefined,
        goodsReceiptId: undefined,
        relatedMovementId: "move-1",
        idempotencyKey: undefined,
        correlationId: "move-1",
        sourceType: "correction_movement",
        sourceId: "move-2",
        note: "Korrektur",
        createdAt: "2026-05-29T07:50:00.000Z"
      }
    ]);
  });

  it("exposes correctionRequestId for inventory correction review tasks", async () => {
    const service = new InventoryReadService({
      inventoryItem: {
        async findMany() {
          return [];
        }
      },
      inventoryMovement: {
        async findMany() {
          return [];
        }
      },
      workflowTask: {
        async findMany() {
          return [
            {
              id: "task-correction-1",
              type: "inventory.correction_request",
              status: "open",
              severity: "warning",
              title: "Bestandskorrektur prüfen",
              description: "Tomaten: Korrektur um -1 kg angefordert.",
              workflowEvent: {
                metadataJson: {
                  correctionRequestId: "correction-1"
                }
              },
              createdAt: new Date("2026-05-29T08:00:00.000Z")
            },
            {
              id: "task-risk-1",
              type: "inventory.negative_stock_risk",
              status: "open",
              severity: "high",
              title: "Negativbestand prüfen",
              description: "Artikel droht negativ zu werden.",
              workflowEvent: null,
              createdAt: new Date("2026-05-29T08:05:00.000Z")
            }
          ];
        }
      }
    });

    const rows = await service.listOpenReviewTasks();

    expect(rows).toEqual([
      {
        id: "task-correction-1",
        type: "inventory.correction_request",
        status: "open",
        severity: "warning",
        title: "Bestandskorrektur prüfen",
        description: "Tomaten: Korrektur um -1 kg angefordert.",
        correctionRequestId: "correction-1",
        createdAt: "2026-05-29T08:00:00.000Z"
      },
      {
        id: "task-risk-1",
        type: "inventory.negative_stock_risk",
        status: "open",
        severity: "high",
        title: "Negativbestand prüfen",
        description: "Artikel droht negativ zu werden.",
        correctionRequestId: undefined,
        createdAt: "2026-05-29T08:05:00.000Z"
      }
    ]);
  });
});
