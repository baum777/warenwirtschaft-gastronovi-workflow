import { describe, expect, it } from "vitest";

import { SyncRunRepository } from "../src/modules/ingestion/sync-run.repository.js";

describe("SyncRunRepository", () => {
  it("creates a running sync run for a source", async () => {
    const calls: unknown[] = [];
    const repository = new SyncRunRepository({
      syncRun: {
        async create(args: unknown) {
          calls.push(args);
          return {
            id: "sync-1",
            source: "gastronovi",
            status: "running",
            startedAt: new Date("2026-05-25T18:00:00.000Z"),
            finishedAt: null,
            errorCode: null,
            errorMessage: null,
            createdAt: new Date("2026-05-25T18:00:00.000Z"),
            updatedAt: new Date("2026-05-25T18:00:00.000Z")
          };
        },
        async update() {
          throw new Error("not used");
        }
      }
    });

    const result = await repository.createRunning({ source: "gastronovi" });

    expect(result.id).toBe("sync-1");
    expect(calls).toEqual([
      {
        data: {
          source: "gastronovi",
          status: "running"
        }
      }
    ]);
  });

  it("marks a sync run as failed while preserving error details", async () => {
    const calls: unknown[] = [];
    const repository = new SyncRunRepository({
      syncRun: {
        async create() {
          throw new Error("not used");
        },
        async update(args: unknown) {
          calls.push(args);
          return {
            id: "sync-1",
            source: "gastronovi",
            status: "failed",
            startedAt: new Date("2026-05-25T18:00:00.000Z"),
            finishedAt: new Date("2026-05-25T18:10:00.000Z"),
            errorCode: "store_raw_failed",
            errorMessage: "database unavailable",
            createdAt: new Date("2026-05-25T18:00:00.000Z"),
            updatedAt: new Date("2026-05-25T18:10:00.000Z")
          };
        }
      }
    });

    const finishedAt = new Date("2026-05-25T18:10:00.000Z");

    const result = await repository.markFailed("sync-1", {
      errorCode: "store_raw_failed",
      errorMessage: "database unavailable",
      finishedAt
    });

    expect(result.status).toBe("failed");
    expect(calls).toEqual([
      {
        where: {
          id: "sync-1"
        },
        data: {
          status: "failed",
          finishedAt,
          errorCode: "store_raw_failed",
          errorMessage: "database unavailable"
        }
      }
    ]);
  });
});
