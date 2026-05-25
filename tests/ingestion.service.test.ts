import { describe, expect, it } from "vitest";

import {
  IngestionService,
  type IngestRawPayloadInput,
  type RawPayloadRepositoryPort
} from "../src/modules/ingestion/ingestion.service.js";
import type { RawPayloadRecord } from "../src/modules/raw-payloads/raw-payload.repository.js";

class InMemoryRawPayloadRepository implements RawPayloadRepositoryPort {
  public createInputs: IngestRawPayloadInput[] = [];
  public records = new Map<string, RawPayloadRecord>();

  async findByHash(payloadHash: string): Promise<RawPayloadRecord | null> {
    return this.records.get(payloadHash) ?? null;
  }

  async create(input: IngestRawPayloadInput & { payloadHash: string }): Promise<RawPayloadRecord> {
    this.createInputs.push(input);
    const record: RawPayloadRecord = {
      id: `raw_${this.records.size + 1}`,
      source: input.source,
      externalId: input.externalId,
      entityType: input.entityType,
      payloadHash: input.payloadHash,
      payloadJson: input.payload,
      syncRunId: input.syncRunId,
      receivedAt: new Date("2026-05-25T18:00:00.000Z")
    };
    this.records.set(input.payloadHash, record);
    return record;
  }
}

describe("IngestionService", () => {
  it("stores a raw payload with hash and sync run link", async () => {
    const repository = new InMemoryRawPayloadRepository();
    const service = new IngestionService({ rawPayloadRepository: repository });

    const result = await service.ingestRawPayload({
      source: "gastronovi",
      externalId: "receipt-1",
      entityType: "receipt",
      syncRunId: "sync-1",
      payload: {
        receiptId: "receipt-1",
        totalGross: 42.5
      }
    });

    expect(result.status).toBe("stored");
    expect(result.duplicate).toBe(false);
    expect(result.rawPayload.syncRunId).toBe("sync-1");
    expect(result.rawPayload.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.createInputs).toHaveLength(1);
    expect(repository.createInputs[0]).toMatchObject({
      source: "gastronovi",
      externalId: "receipt-1",
      entityType: "receipt",
      syncRunId: "sync-1"
    });
  });

  it("returns duplicate result without storing an existing payload again", async () => {
    const repository = new InMemoryRawPayloadRepository();
    const service = new IngestionService({ rawPayloadRepository: repository });
    const input = {
      source: "gastronovi",
      entityType: "receipt",
      payload: {
        receiptId: "receipt-duplicate",
        totalGross: 12.3
      }
    };

    const first = await service.ingestRawPayload(input);
    const second = await service.ingestRawPayload(input);

    expect(first.status).toBe("stored");
    expect(second.status).toBe("duplicate");
    expect(second.duplicate).toBe(true);
    expect(second.rawPayload.id).toBe(first.rawPayload.id);
    expect(repository.createInputs).toHaveLength(1);
  });

  it("propagates repository errors instead of swallowing them", async () => {
    const service = new IngestionService({
      rawPayloadRepository: {
        async findByHash() {
          return null;
        },
        async create() {
          throw new Error("database unavailable");
        }
      }
    });

    await expect(
      service.ingestRawPayload({
        source: "gastronovi",
        payload: {
          receiptId: "receipt-error"
        }
      })
    ).rejects.toThrow("database unavailable");
  });
});
