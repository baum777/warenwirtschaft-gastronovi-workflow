import type { JsonValue } from "../shared/json-value.js";

type RawPayloadDatabaseRecord = {
  id: string;
  source: string;
  externalId: string | null;
  entityType: string | null;
  payloadHash: string;
  payloadJson: unknown;
  syncRunId: string | null;
  receivedAt: Date;
};

export type RawPayloadRecord = {
  id: string;
  source: string;
  externalId?: string;
  entityType?: string;
  payloadHash: string;
  payloadJson: JsonValue;
  syncRunId?: string;
  receivedAt: Date;
};

export type CreateRawPayloadInput = {
  source: string;
  externalId?: string;
  entityType?: string;
  payloadHash: string;
  payload: JsonValue;
  syncRunId?: string;
};

export type RawPayloadDatabaseClient = {
  rawPayload: {
    findUnique(args: { where: { payloadHash: string } }): Promise<RawPayloadDatabaseRecord | null>;
    create(args: {
      data: {
        source: string;
        externalId?: string;
        entityType?: string;
        payloadHash: string;
        payloadJson: JsonValue;
        syncRunId?: string;
      };
    }): Promise<RawPayloadDatabaseRecord>;
  };
};

export class RawPayloadRepository {
  public constructor(private readonly db: RawPayloadDatabaseClient) {}

  public async findByHash(payloadHash: string): Promise<RawPayloadRecord | null> {
    const record = await this.db.rawPayload.findUnique({
      where: {
        payloadHash
      }
    });

    return record ? mapRawPayload(record) : null;
  }

  public async create(input: CreateRawPayloadInput): Promise<RawPayloadRecord> {
    const record = await this.db.rawPayload.create({
      data: {
        source: input.source,
        externalId: input.externalId,
        entityType: input.entityType,
        payloadHash: input.payloadHash,
        payloadJson: input.payload,
        syncRunId: input.syncRunId
      }
    });

    return mapRawPayload(record);
  }
}

function mapRawPayload(record: RawPayloadDatabaseRecord): RawPayloadRecord {
  return {
    id: record.id,
    source: record.source,
    externalId: record.externalId ?? undefined,
    entityType: record.entityType ?? undefined,
    payloadHash: record.payloadHash,
    payloadJson: record.payloadJson as JsonValue,
    syncRunId: record.syncRunId ?? undefined,
    receivedAt: record.receivedAt
  };
}
