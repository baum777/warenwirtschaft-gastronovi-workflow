type SyncRunDatabaseRecord = {
  id: string;
  source: string;
  status: SyncRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SyncRunStatus = "running" | "succeeded" | "failed" | "partially_failed";

export type SyncRunRecord = {
  id: string;
  source: string;
  status: SyncRunStatus;
  startedAt: Date;
  finishedAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type SyncRunDatabaseClient = {
  syncRun: {
    create(args: {
      data: {
        source: string;
        status: SyncRunStatus;
      };
    }): Promise<SyncRunDatabaseRecord>;
    update(args: {
      where: {
        id: string;
      };
      data: {
        status: SyncRunStatus;
        finishedAt: Date;
        errorCode?: string | null;
        errorMessage?: string | null;
      };
    }): Promise<SyncRunDatabaseRecord>;
  };
};

export class SyncRunRepository {
  public constructor(private readonly db: SyncRunDatabaseClient) {}

  public async createRunning(input: { source: string }): Promise<SyncRunRecord> {
    const record = await this.db.syncRun.create({
      data: {
        source: input.source,
        status: "running"
      }
    });

    return mapSyncRun(record);
  }

  public async markSucceeded(
    id: string,
    options: { finishedAt?: Date } = {}
  ): Promise<SyncRunRecord> {
    const record = await this.db.syncRun.update({
      where: {
        id
      },
      data: {
        status: "succeeded",
        finishedAt: options.finishedAt ?? new Date(),
        errorCode: null,
        errorMessage: null
      }
    });

    return mapSyncRun(record);
  }

  public async markFailed(
    id: string,
    input: {
      errorCode?: string;
      errorMessage?: string;
      finishedAt?: Date;
    }
  ): Promise<SyncRunRecord> {
    const record = await this.db.syncRun.update({
      where: {
        id
      },
      data: {
        status: "failed",
        finishedAt: input.finishedAt ?? new Date(),
        errorCode: input.errorCode,
        errorMessage: input.errorMessage
      }
    });

    return mapSyncRun(record);
  }
}

function mapSyncRun(record: SyncRunDatabaseRecord): SyncRunRecord {
  return {
    id: record.id,
    source: record.source,
    status: record.status,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt ?? undefined,
    errorCode: record.errorCode ?? undefined,
    errorMessage: record.errorMessage ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}
