import { describe, expect, it } from "vitest";

import { WithdrawalService } from "../../src/modules/inventory/withdrawal.service.js";

describe("inventory movement idempotency", () => {
  it("does not create a second movement for the same idempotency key", async () => {
    const now = new Date("2026-05-30T10:00:00.000Z");
    const movementsByKey = new Map<string, { id: string; quantity: number }>();
    const movementCreateCalls: string[] = [];

    const tx = {
      inventoryItem: {
        async findUnique() {
          return {
            id: "item-1",
            name: "Tomaten",
            defaultUnit: "kg"
          };
        }
      },
      inventoryMovement: {
        async create(args: {
          data: {
            idempotencyKey: string;
            quantity: number;
          };
        }) {
          movementCreateCalls.push(args.data.idempotencyKey);

          if (movementsByKey.has(args.data.idempotencyKey)) {
            throw { code: "P2002" };
          }

          const id = `move-${movementsByKey.size + 1}`;
          movementsByKey.set(args.data.idempotencyKey, {
            id,
            quantity: args.data.quantity
          });
          return { id };
        },
        async findFirst(args: { where: { idempotencyKey: string } }) {
          const existing = movementsByKey.get(args.where.idempotencyKey);
          return existing ? { id: existing.id } : null;
        },
        async findMany() {
          const appliedRemoval = [...movementsByKey.values()].reduce(
            (total, movement) => total + movement.quantity,
            0
          );
          return [
            {
              type: "goods_received" as const,
              quantity: 10,
              createdAt: new Date("2026-05-30T09:00:00.000Z")
            },
            {
              type: "item_removed" as const,
              quantity: appliedRemoval,
              createdAt: now
            }
          ];
        }
      },
      inventoryStockSnapshot: {
        async upsert() {
          return { id: "snapshot-1" };
        }
      },
      workflowTask: {
        async create() {
          return { id: "task-1" };
        }
      }
    };

    const service = new WithdrawalService({
      now: () => now,
      db: {
        async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>): Promise<T> {
          return callback(tx);
        }
      }
    });

    const command = {
      inventoryItemId: "item-1",
      quantity: 3,
      unit: "kg",
      idempotencyKey: "cmd-1"
    };
    const actor = {
      userId: "staff-1",
      role: "staff" as const,
      organizationId: "org-1"
    };

    const first = await service.create(command, actor);
    const second = await service.create(command, actor);

    expect(first.movementId).toBe("move-1");
    expect(second.movementId).toBe("move-1");
    expect(first.stockAfter).toBe(7);
    expect(second.stockAfter).toBe(7);
    expect(movementsByKey.size).toBe(1);
    expect(movementCreateCalls).toEqual(["cmd-1", "cmd-1"]);
  });
});
