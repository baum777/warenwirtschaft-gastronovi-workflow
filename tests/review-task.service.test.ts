import { describe, expect, it } from "vitest";

import { ReviewTaskService } from "../src/modules/inventory/review-task.service.js";

describe("ReviewTaskService", () => {
  it("marks an open inventory review task as in_review", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const service = new ReviewTaskService({
      db: reviewTaskDb({
        calls,
        existingTask: reviewTaskRecord({
          status: "open"
        })
      })
    });

    const result = await service.startReview("task-1", {
      userId: "admin-1",
      role: "admin"
    });

    expect(result).toEqual({
      id: "task-1",
      status: "in_review",
      resolvedAt: undefined
    });
    expect(calls).toEqual([
      {
        model: "workflowTask",
        method: "findUnique",
        args: {
          where: {
            id: "task-1"
          }
        }
      },
      {
        model: "workflowTask",
        method: "update",
        args: {
          where: {
            id: "task-1"
          },
          data: {
            status: "in_review",
            resolvedAt: null
          }
        }
      }
    ]);
  });

  it("resolves an inventory review task with a resolved timestamp", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const now = new Date("2026-05-26T12:00:00.000Z");
    const service = new ReviewTaskService({
      now: () => now,
      db: reviewTaskDb({
        calls,
        existingTask: reviewTaskRecord({
          status: "in_review"
        })
      })
    });

    const result = await service.resolve("task-1", {
      userId: "admin-1",
      role: "admin"
    });

    expect(result).toEqual({
      id: "task-1",
      status: "resolved",
      resolvedAt: now.toISOString()
    });
    expect(calls).toContainEqual({
      model: "workflowTask",
      method: "update",
      args: {
        where: {
          id: "task-1"
        },
        data: {
          status: "resolved",
          resolvedAt: now
        }
      }
    });
  });

  it("dismisses an inventory review task with a resolved timestamp", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const now = new Date("2026-05-26T12:15:00.000Z");
    const service = new ReviewTaskService({
      now: () => now,
      db: reviewTaskDb({
        calls,
        existingTask: reviewTaskRecord({
          status: "open"
        })
      })
    });

    const result = await service.dismiss("task-1", {
      userId: "admin-1",
      role: "admin"
    });

    expect(result).toEqual({
      id: "task-1",
      status: "dismissed",
      resolvedAt: now.toISOString()
    });
    expect(calls).toContainEqual({
      model: "workflowTask",
      method: "update",
      args: {
        where: {
          id: "task-1"
        },
        data: {
          status: "dismissed",
          resolvedAt: now
        }
      }
    });
  });

  it("rejects already closed review tasks", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const service = new ReviewTaskService({
      db: reviewTaskDb({
        calls,
        existingTask: reviewTaskRecord({
          status: "resolved"
        })
      })
    });

    await expect(
      service.resolve("task-1", {
        userId: "admin-1",
        role: "admin"
      })
    ).rejects.toThrow("review task is already closed");
    expect(calls.some((call) => call.model === "workflowTask" && call.method === "update")).toBe(
      false
    );
  });

  it("rejects non-inventory review tasks", async () => {
    const calls: Array<{ model: string; method: string; args?: unknown }> = [];
    const service = new ReviewTaskService({
      db: reviewTaskDb({
        calls,
        existingTask: reviewTaskRecord({
          type: "external.payload_review",
          status: "open"
        })
      })
    });

    await expect(
      service.startReview("task-1", {
        userId: "admin-1",
        role: "admin"
      })
    ).rejects.toThrow("review task is not an inventory task");
    expect(calls.some((call) => call.model === "workflowTask" && call.method === "update")).toBe(
      false
    );
  });
});

function reviewTaskDb(input: {
  calls: Array<{ model: string; method: string; args?: unknown }>;
  existingTask: ReviewTaskRecord | null;
}) {
  return {
    workflowTask: {
      async findUnique(args: unknown) {
        input.calls.push({ model: "workflowTask", method: "findUnique", args });
        return input.existingTask;
      },
      async update(args: { data: { status: ReviewTaskStatus; resolvedAt: Date | null } }) {
        input.calls.push({ model: "workflowTask", method: "update", args });
        return {
          id: "task-1",
          status: args.data.status,
          resolvedAt: args.data.resolvedAt
        };
      }
    }
  };
}

function reviewTaskRecord(
  overrides: Partial<ReviewTaskRecord> = {}
): ReviewTaskRecord {
  return {
    id: "task-1",
    type: "inventory.overdelivery",
    status: "open",
    resolvedAt: null,
    ...overrides
  };
}

type ReviewTaskStatus = "open" | "in_review" | "resolved" | "dismissed";

type ReviewTaskRecord = {
  id: string;
  type: string;
  status: ReviewTaskStatus;
  resolvedAt: Date | null;
};
