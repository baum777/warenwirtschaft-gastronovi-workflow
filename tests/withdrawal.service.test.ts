import { describe, expect, it } from "vitest";

import { WithdrawalService } from "../src/modules/inventory/withdrawal.service.js";

describe("WithdrawalService", () => {
  it("creates an item_removed movement and refreshes stock in a transaction", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const now = new Date("2026-05-26T08:00:00.000Z");
    const tx = withdrawalTransaction({
      calls,
      now,
      movementsAfterWithdrawal: [
        { type: "goods_received", quantity: 10, createdAt: new Date("2026-05-26T07:00:00.000Z") },
        { type: "item_removed", quantity: 3, createdAt: now }
      ]
    });
    const service = new WithdrawalService({
      now: () => now,
      db: {
        async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>): Promise<T> {
          calls.push({ model: "db", method: "$transaction" });
          return callback(tx);
        }
      }
    });

    const result = await service.create(
      {
        inventoryItemId: "item-1",
        quantity: 3,
        unit: "Stück",
        note: "prep usage"
      },
      {
        userId: "staff-1",
        role: "staff"
      }
    );

    expect(result).toEqual({
      movementId: "move-1",
      stockAfter: 7,
      reviewTaskIds: []
    });
    expect(calls.map((call) => `${call.model}.${call.method}`)).toEqual([
      "db.$transaction",
      "inventoryItem.findUnique",
      "inventoryMovement.create",
      "inventoryMovement.findMany"
    ]);
    expect(calls).toContainEqual({
      model: "inventoryMovement",
      method: "create",
      args: {
        data: {
          inventoryItemId: "item-1",
          type: "item_removed",
          quantity: 3,
          unit: "Stück",
          actorUserId: "staff-1",
          storageLocationId: undefined,
          note: "prep usage"
        }
      }
    });
  });

  it("creates a review task when a withdrawal drives stock negative", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const now = new Date("2026-05-26T08:30:00.000Z");
    const tx = withdrawalTransaction({
      calls,
      now,
      movementsAfterWithdrawal: [
        { type: "goods_received", quantity: 2, createdAt: new Date("2026-05-26T07:00:00.000Z") },
        { type: "item_removed", quantity: 5, createdAt: now }
      ]
    });
    const service = new WithdrawalService({
      now: () => now,
      db: {
        async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>): Promise<T> {
          return callback(tx);
        }
      }
    });

    const result = await service.create(
      {
        inventoryItemId: "item-1",
        quantity: 5,
        unit: "Stück"
      },
      {
        userId: "shift-1",
        role: "shift_lead"
      }
    );

    expect(result).toEqual({
      movementId: "move-1",
      stockAfter: -3,
      reviewTaskIds: ["task-1"]
    });
    expect(calls).toContainEqual({
      model: "workflowTask",
      method: "create",
      args: {
        data: {
          type: "inventory.negative_stock_risk",
          status: "open",
          severity: "critical",
          title: "Negative Bestandsprüfung",
          description: "Entnahme von Tomaten passiert 5kg führt zu Bestand -3 Stück.",
          assignedRole: "admin"
        }
      }
    });
  });

  it("does not refresh snapshots when movement creation fails", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const now = new Date("2026-05-26T09:00:00.000Z");
    const tx = withdrawalTransaction({
      calls,
      now,
      failMovementCreate: true,
      movementsAfterWithdrawal: []
    });
    const service = new WithdrawalService({
      now: () => now,
      db: {
        async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>): Promise<T> {
          return callback(tx);
        }
      }
    });

    await expect(
      service.create(
        {
          inventoryItemId: "item-1",
          quantity: 1,
          unit: "Stück"
        },
        {
          userId: "admin-1",
          role: "admin"
        }
      )
    ).rejects.toThrow("movement failed");
    expect(calls.some((call) => call.model === "inventoryStockSnapshot")).toBe(false);
  });
});

function withdrawalTransaction(input: {
  calls: Array<{ model: string; method: string; args?: unknown }>;
  now: Date;
  failMovementCreate?: boolean;
  movementsAfterWithdrawal: Array<{
    type: "goods_received" | "item_removed" | "correction_positive" | "correction_negative";
    quantity: number;
    createdAt: Date;
  }>;
}) {
  return {
    inventoryItem: {
      async findUnique(args: unknown) {
        input.calls.push({ model: "inventoryItem", method: "findUnique", args });
        return {
          id: "item-1",
          name: "Tomaten passiert 5kg",
          defaultUnit: "Stück"
        };
      }
    },
    inventoryMovement: {
      async create(args: unknown) {
        input.calls.push({ model: "inventoryMovement", method: "create", args });
        if (input.failMovementCreate) {
          throw new Error("movement failed");
        }
        return { id: "move-1" };
      },
      async findMany(args: unknown) {
        input.calls.push({ model: "inventoryMovement", method: "findMany", args });
        return input.movementsAfterWithdrawal;
      }
    },
    inventoryStockSnapshot: {
      async upsert(args: unknown) {
        input.calls.push({ model: "inventoryStockSnapshot", method: "upsert", args });
        return { id: "snapshot-1" };
      }
    },
    workflowTask: {
      async create(args: unknown) {
        input.calls.push({ model: "workflowTask", method: "create", args });
        return { id: "task-1" };
      }
    }
  };
}
