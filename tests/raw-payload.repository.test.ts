import { describe, expect, it } from "vitest";

import { RawPayloadRepository } from "../src/modules/raw-payloads/raw-payload.repository.js";

describe("RawPayloadRepository", () => {
  it("looks up raw payloads by payload hash", async () => {
    const calls: unknown[] = [];
    const repository = new RawPayloadRepository({
      rawPayload: {
        async findUnique(args: unknown) {
          calls.push(args);
          return null;
        },
        async create() {
          throw new Error("not used");
        }
      }
    });

    await repository.findByHash("abc123");

    expect(calls).toEqual([
      {
        where: {
          payloadHash: "abc123"
        }
      }
    ]);
  });

  it("persists raw payload data without semantic interpretation", async () => {
    const calls: unknown[] = [];
    const repository = new RawPayloadRepository({
      rawPayload: {
        async findUnique() {
          throw new Error("not used");
        },
        async create(args: unknown) {
          calls.push(args);
          return {
            id: "raw-1",
            source: "gastronovi",
            externalId: "receipt-1",
            entityType: "receipt",
            payloadHash: "hash-1",
            payloadJson: { receiptId: "receipt-1" },
            syncRunId: "sync-1",
            receivedAt: new Date("2026-05-25T18:00:00.000Z")
          };
        }
      }
    });

    const result = await repository.create({
      source: "gastronovi",
      externalId: "receipt-1",
      entityType: "receipt",
      payloadHash: "hash-1",
      payload: { receiptId: "receipt-1" },
      syncRunId: "sync-1"
    });

    expect(result.id).toBe("raw-1");
    expect(calls).toEqual([
      {
        data: {
          source: "gastronovi",
          externalId: "receipt-1",
          entityType: "receipt",
          payloadHash: "hash-1",
          payloadJson: { receiptId: "receipt-1" },
          syncRunId: "sync-1"
        }
      }
    ]);
  });
});
