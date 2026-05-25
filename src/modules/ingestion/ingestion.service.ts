import { calculatePayloadHash } from "../raw-payloads/payload-hash.js";
import type {
  CreateRawPayloadInput,
  RawPayloadRecord
} from "../raw-payloads/raw-payload.repository.js";
import type { JsonValue } from "../shared/json-value.js";

export type IngestRawPayloadInput = {
  source: string;
  externalId?: string;
  entityType?: string;
  payload: JsonValue;
  syncRunId?: string;
};

export type RawPayloadRepositoryPort = {
  findByHash(payloadHash: string): Promise<RawPayloadRecord | null>;
  create(input: CreateRawPayloadInput): Promise<RawPayloadRecord>;
};

export type IngestionServiceOptions = {
  rawPayloadRepository: RawPayloadRepositoryPort;
};

export type IngestRawPayloadResult =
  | {
      status: "stored";
      duplicate: false;
      payloadHash: string;
      rawPayload: RawPayloadRecord;
    }
  | {
      status: "duplicate";
      duplicate: true;
      payloadHash: string;
      rawPayload: RawPayloadRecord;
    };

export class IngestionService {
  public constructor(private readonly options: IngestionServiceOptions) {}

  public async ingestRawPayload(input: IngestRawPayloadInput): Promise<IngestRawPayloadResult> {
    const source = input.source.trim();

    if (source.length === 0) {
      throw new Error("source is required for raw payload ingestion");
    }

    const payloadHash = calculatePayloadHash(input.payload);
    const existingPayload = await this.options.rawPayloadRepository.findByHash(payloadHash);

    if (existingPayload) {
      return {
        status: "duplicate",
        duplicate: true,
        payloadHash,
        rawPayload: existingPayload
      };
    }

    const rawPayload = await this.options.rawPayloadRepository.create({
      source,
      externalId: input.externalId,
      entityType: input.entityType,
      payloadHash,
      payload: input.payload,
      syncRunId: input.syncRunId
    });

    return {
      status: "stored",
      duplicate: false,
      payloadHash,
      rawPayload
    };
  }
}
