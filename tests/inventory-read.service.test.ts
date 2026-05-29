import { describe, expect, it } from "vitest";

import { InventoryReadService } from "../src/modules/inventory/inventory-read.service.js";

describe("InventoryReadService", () => {
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
