import { describe, expect, it } from "vitest";

import { CorrectionService } from "../src/modules/inventory/correction.service.js";

describe("CorrectionService", () => {
  it("creates a correction request and review task without changing stock", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const now = new Date("2026-05-26T10:00:00.000Z");
    const tx = correctionTransaction({ calls, now });
    const service = new CorrectionService({
      now: () => now,
      db: {
        async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>): Promise<T> {
          calls.push({ model: "db", method: "$transaction" });
          return callback(tx);
        }
      }
    });

    const result = await service.createRequest(
      {
        inventoryItemId: "item-1",
        expectedDelta: -2,
        unit: "Stück",
        reason: "count mismatch"
      },
      {
        userId: "staff-1",
        role: "staff"
      }
    );

    expect(result).toEqual({
      correctionRequestId: "correction-1",
      status: "open",
      reviewTaskId: "task-1"
    });
    expect(calls.map((call) => `${call.model}.${call.method}`)).toEqual([
      "db.$transaction",
      "inventoryItem.findUnique",
      "inventoryCorrectionRequest.create",
      "workflowTask.create"
    ]);
    expect(calls.some((call) => call.model === "inventoryMovement")).toBe(false);
    expect(calls.some((call) => call.model === "inventoryStockSnapshot")).toBe(false);
  });

  it("approves a correction and creates the stock movement in a transaction", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const now = new Date("2026-05-26T10:30:00.000Z");
    const tx = correctionTransaction({
      calls,
      now,
      existingRequest: {
        id: "correction-1",
        inventoryItemId: "item-1",
        requestedById: "staff-1",
        status: "open",
        expectedDelta: -2,
        unit: "Stück",
        reason: "count mismatch"
      },
      movementsAfterApproval: [
        { type: "goods_received", quantity: 10, createdAt: new Date("2026-05-26T09:00:00.000Z") },
        { type: "correction_negative", quantity: 2, createdAt: now }
      ]
    });
    const service = new CorrectionService({
      now: () => now,
      db: {
        async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>): Promise<T> {
          return callback(tx);
        }
      }
    });

    const result = await service.approve(
      "correction-1",
      {
        userId: "admin-1",
        role: "admin"
      }
    );

    expect(result).toEqual({
      correctionRequestId: "correction-1",
      status: "approved",
      movementId: "move-1",
      stockAfter: 8
    });
    expect(calls).toContainEqual({
      model: "inventoryMovement",
      method: "create",
      args: {
        data: {
          inventoryItemId: "item-1",
          type: "correction_negative",
          quantity: 2,
          unit: "Stück",
          actorUserId: "admin-1",
          relatedMovementId: undefined,
          note: "Correction approved: count mismatch"
        }
      }
    });
    expect(calls).toContainEqual({
      model: "inventoryCorrectionRequest",
      method: "update",
      args: {
        where: {
          id: "correction-1"
        },
        data: {
          status: "approved",
          relatedMovementId: "move-1",
          reviewedById: "admin-1",
          reviewedAt: now
        }
      }
    });
  });

  it("rejects a correction request without changing stock", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const now = new Date("2026-05-26T11:00:00.000Z");
    const tx = correctionTransaction({
      calls,
      now,
      existingRequest: {
        id: "correction-1",
        inventoryItemId: "item-1",
        requestedById: "staff-1",
        status: "open",
        expectedDelta: 3,
        unit: "Stück",
        reason: "count mismatch"
      }
    });
    const service = new CorrectionService({
      now: () => now,
      db: {
        async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>): Promise<T> {
          return callback(tx);
        }
      }
    });

    const result = await service.reject(
      "correction-1",
      {
        userId: "admin-1",
        role: "admin"
      }
    );

    expect(result).toEqual({
      correctionRequestId: "correction-1",
      status: "rejected"
    });
    expect(calls).toContainEqual({
      model: "inventoryCorrectionRequest",
      method: "update",
      args: {
        where: {
          id: "correction-1"
        },
        data: {
          status: "rejected",
          reviewedById: "admin-1",
          reviewedAt: now
        }
      }
    });
    expect(calls.some((call) => call.model === "inventoryMovement")).toBe(false);
    expect(calls.some((call) => call.model === "inventoryStockSnapshot")).toBe(false);
  });

  it("prevents staff from approving their own correction request", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const now = new Date("2026-05-26T11:30:00.000Z");
    const tx = correctionTransaction({
      calls,
      now,
      existingRequest: {
        id: "correction-1",
        inventoryItemId: "item-1",
        requestedById: "staff-1",
        status: "open",
        expectedDelta: 3,
        unit: "Stück",
        reason: "count mismatch"
      }
    });
    const service = new CorrectionService({
      now: () => now,
      db: {
        async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>): Promise<T> {
          return callback(tx);
        }
      }
    });

    await expect(
      service.approve("correction-1", {
        userId: "staff-1",
        role: "staff"
      })
    ).rejects.toThrow("staff cannot approve correction requests");
    expect(calls.some((call) => call.model === "inventoryMovement")).toBe(false);
    expect(calls.some((call) => call.model === "inventoryCorrectionRequest" && call.method === "update")).toBe(false);
  });

  it("prevents shift leads from approving their own correction request", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const now = new Date("2026-05-26T11:45:00.000Z");
    const tx = correctionTransaction({
      calls,
      now,
      existingRequest: {
        id: "correction-1",
        inventoryItemId: "item-1",
        requestedById: "shift-1",
        status: "open",
        expectedDelta: 3,
        unit: "Stück",
        reason: "count mismatch"
      }
    });
    const service = new CorrectionService({
      now: () => now,
      db: {
        async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>): Promise<T> {
          return callback(tx);
        }
      }
    });

    await expect(
      service.approve("correction-1", {
        userId: "shift-1",
        role: "shift_lead"
      })
    ).rejects.toThrow("actor cannot approve own correction request");
    expect(calls.some((call) => call.model === "inventoryMovement")).toBe(false);
    expect(calls.some((call) => call.model === "inventoryCorrectionRequest" && call.method === "update")).toBe(false);
  });
});

function correctionTransaction(input: {
  calls: Array<{ model: string; method: string; args?: unknown }>;
  now: Date;
  existingRequest?: CorrectionRequestRecord;
  movementsAfterApproval?: Array<{
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
    inventoryCorrectionRequest: {
      async create(args: unknown) {
        input.calls.push({ model: "inventoryCorrectionRequest", method: "create", args });
        return {
          id: "correction-1",
          status: "open"
        };
      },
      async findUnique(args: unknown) {
        input.calls.push({ model: "inventoryCorrectionRequest", method: "findUnique", args });
        return input.existingRequest ?? null;
      },
      async update(args: unknown) {
        input.calls.push({ model: "inventoryCorrectionRequest", method: "update", args });
        return {};
      }
    },
    inventoryMovement: {
      async create(args: unknown) {
        input.calls.push({ model: "inventoryMovement", method: "create", args });
        return { id: "move-1" };
      },
      async findMany(args: unknown) {
        input.calls.push({ model: "inventoryMovement", method: "findMany", args });
        return input.movementsAfterApproval ?? [];
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

type CorrectionRequestRecord = {
  id: string;
  inventoryItemId: string;
  requestedById: string;
  status: "open" | "approved" | "rejected";
  expectedDelta: number;
  unit: string;
  reason: string;
};
