import type { Actor } from "../auth/actor.js";
import type {
  CorrectionApprovalDto,
  CorrectionRejectionDto,
  CorrectionRequestDto,
  CreateCorrectionRequestInput
} from "./inventory.schemas.js";
import { InventoryStockService } from "./inventory-stock.service.js";

type CorrectionStatus = "open" | "approved" | "rejected";
type CorrectionMovementType = "correction_positive" | "correction_negative";

type InventoryItemRecord = {
  id: string;
  name: string;
  defaultUnit: string;
};

type CorrectionRequestRecord = {
  id: string;
  inventoryItemId: string;
  requestedById: string;
  status: CorrectionStatus;
  expectedDelta: number;
  unit: string;
  reason: string;
};

type CorrectionTransactionClient = {
  inventoryItem: {
    findUnique(args: {
      where: {
        id: string;
      };
      select: {
        id: true;
        name: true;
        defaultUnit: true;
      };
    }): Promise<InventoryItemRecord | null>;
  };
  inventoryCorrectionRequest: {
    create(args: {
      data: {
        inventoryItemId: string;
        requestedById: string;
        expectedDelta: number;
        unit: string;
        reason: string;
      };
    }): Promise<{ id: string; status: CorrectionStatus }>;
    findUnique(args: {
      where: {
        id: string;
      };
    }): Promise<CorrectionRequestRecord | null>;
    update(args: {
      where: {
        id: string;
      };
      data: {
        status: "approved" | "rejected";
        relatedMovementId?: string;
        reviewedById: string;
        reviewedAt: Date;
      };
    }): Promise<unknown>;
  };
  inventoryMovement: {
    create(args: {
      data: {
        inventoryItemId: string;
        type: CorrectionMovementType;
        quantity: number;
        unit: string;
        actorUserId: string;
        relatedMovementId?: string;
        note: string;
      };
    }): Promise<{ id: string }>;
    findMany(args: unknown): Promise<
      Array<{
        type: "goods_received" | "item_removed" | "correction_positive" | "correction_negative";
        quantity: number;
        createdAt?: Date;
      }>
    >;
  };
  inventoryStockSnapshot: {
    upsert(args: unknown): Promise<unknown>;
  };
  workflowTask: {
    create(args: {
      data: {
        type: string;
        status: "open";
        severity: "warning";
        title: string;
        description: string;
        assignedRole: string;
      };
    }): Promise<{ id: string }>;
  };
};

export type CorrectionDatabaseClient = {
  $transaction<T>(callback: (transaction: any) => Promise<T>): Promise<T>;
};

export type CorrectionServicePort = {
  createRequest(input: CreateCorrectionRequestInput, actor: Actor): Promise<CorrectionRequestDto>;
  approve(id: string, actor: Actor): Promise<CorrectionApprovalDto>;
  reject(id: string, actor: Actor): Promise<CorrectionRejectionDto>;
};

export class CorrectionService implements CorrectionServicePort {
  public constructor(
    private readonly options: {
      db: CorrectionDatabaseClient;
      now?: () => Date;
    }
  ) {}

  public async createRequest(
    input: CreateCorrectionRequestInput,
    actor: Actor
  ): Promise<CorrectionRequestDto> {
    return this.options.db.$transaction(async (transaction) => {
      const tx = transaction as CorrectionTransactionClient;
      const inventoryItem = await this.findInventoryItem(tx, input.inventoryItemId);
      const correctionRequest = await tx.inventoryCorrectionRequest.create({
        data: {
          inventoryItemId: input.inventoryItemId,
          requestedById: actor.userId,
          expectedDelta: input.expectedDelta,
          unit: input.unit,
          reason: input.reason
        }
      });
      const task = await tx.workflowTask.create({
        data: {
          type: "inventory.correction_request",
          status: "open",
          severity: "warning",
          title: "Bestandskorrektur prüfen",
          description: `${inventoryItem.name}: Korrektur um ${input.expectedDelta} ${input.unit} angefordert.`,
          assignedRole: "admin"
        }
      });

      return {
        correctionRequestId: correctionRequest.id,
        status: correctionRequest.status,
        reviewTaskId: task.id
      };
    });
  }

  public async approve(id: string, actor: Actor): Promise<CorrectionApprovalDto> {
    return this.options.db.$transaction(async (transaction) => {
      const tx = transaction as CorrectionTransactionClient;
      const correctionRequest = await this.findOpenCorrectionRequest(tx, id);

      if (actor.role === "staff" && correctionRequest.requestedById === actor.userId) {
        throw new Error("staff cannot approve correction requests");
      }

      const movementType = correctionMovementType(correctionRequest.expectedDelta);
      const movement = await tx.inventoryMovement.create({
        data: {
          inventoryItemId: correctionRequest.inventoryItemId,
          type: movementType,
          quantity: Math.abs(correctionRequest.expectedDelta),
          unit: correctionRequest.unit,
          actorUserId: actor.userId,
          relatedMovementId: undefined,
          note: `Correction approved: ${correctionRequest.reason}`
        }
      });
      const stockService = new InventoryStockService({
        db: tx,
        now: this.options.now
      });
      const stockAfter = await stockService.refreshSnapshot({
        inventoryItemId: correctionRequest.inventoryItemId,
        unit: correctionRequest.unit
      });
      const reviewedAt = this.options.now?.() ?? new Date();

      await tx.inventoryCorrectionRequest.update({
        where: {
          id
        },
        data: {
          status: "approved",
          relatedMovementId: movement.id,
          reviewedById: actor.userId,
          reviewedAt
        }
      });

      return {
        correctionRequestId: id,
        status: "approved",
        movementId: movement.id,
        stockAfter
      };
    });
  }

  public async reject(id: string, actor: Actor): Promise<CorrectionRejectionDto> {
    return this.options.db.$transaction(async (transaction) => {
      const tx = transaction as CorrectionTransactionClient;
      await this.findOpenCorrectionRequest(tx, id);
      const reviewedAt = this.options.now?.() ?? new Date();

      await tx.inventoryCorrectionRequest.update({
        where: {
          id
        },
        data: {
          status: "rejected",
          reviewedById: actor.userId,
          reviewedAt
        }
      });

      return {
        correctionRequestId: id,
        status: "rejected"
      };
    });
  }

  private async findInventoryItem(
    tx: CorrectionTransactionClient,
    inventoryItemId: string
  ): Promise<InventoryItemRecord> {
    const inventoryItem = await tx.inventoryItem.findUnique({
      where: {
        id: inventoryItemId
      },
      select: {
        id: true,
        name: true,
        defaultUnit: true
      }
    });

    if (!inventoryItem) {
      throw new Error("inventory item not found");
    }

    return inventoryItem;
  }

  private async findOpenCorrectionRequest(
    tx: CorrectionTransactionClient,
    id: string
  ): Promise<CorrectionRequestRecord> {
    const correctionRequest = await tx.inventoryCorrectionRequest.findUnique({
      where: {
        id
      }
    });

    if (!correctionRequest) {
      throw new Error("correction request not found");
    }

    if (correctionRequest.status !== "open") {
      throw new Error("correction request is not open");
    }

    return correctionRequest;
  }
}

function correctionMovementType(expectedDelta: number): CorrectionMovementType {
  return expectedDelta > 0 ? "correction_positive" : "correction_negative";
}
