import type { Actor } from "../auth/actor.js";
import { InventoryNotFoundError } from "./errors.js";
import type { InventoryMovementRecord } from "./inventory-movement.types.js";
import type { CreateWithdrawalInput, WithdrawalDto } from "./inventory.schemas.js";
import { InventoryStockService } from "./inventory-stock.service.js";

type InventoryItemRecord = {
  id: string;
  name: string;
  defaultUnit: string;
};

type WithdrawalTransactionClient = {
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
  inventoryMovement: {
    create(args: {
      data: {
        inventoryItemId: string;
        type: "item_removed";
        quantity: number;
        unit: string;
        actorUserId: string;
        storageLocationId?: string;
        note?: string;
      };
    }): Promise<{ id: string }>;
    findMany(args: unknown): Promise<InventoryMovementRecord[]>;
  };
  inventoryStockSnapshot: {
    upsert(args: unknown): Promise<unknown>;
  };
  workflowTask: {
    create(args: {
      data: {
        type: string;
        status: "open";
        severity: "critical";
        title: string;
        description: string;
        assignedRole: string;
      };
    }): Promise<{ id: string }>;
  };
};

export type WithdrawalDatabaseClient = {
  $transaction<T>(callback: (transaction: any) => Promise<T>): Promise<T>;
};

export type WithdrawalServicePort = {
  create(input: CreateWithdrawalInput, actor: Actor): Promise<WithdrawalDto>;
};

export class WithdrawalService implements WithdrawalServicePort {
  public constructor(
    private readonly options: {
      db: WithdrawalDatabaseClient;
      now?: () => Date;
    }
  ) {}

  public async create(input: CreateWithdrawalInput, actor: Actor): Promise<WithdrawalDto> {
    return this.options.db.$transaction(async (transaction) => {
      const tx = transaction as WithdrawalTransactionClient;
      const inventoryItem = await tx.inventoryItem.findUnique({
        where: {
          id: input.inventoryItemId
        },
        select: {
          id: true,
          name: true,
          defaultUnit: true
        }
      });

      if (!inventoryItem) {
        throw new InventoryNotFoundError("inventory item not found");
      }

      const movement = await tx.inventoryMovement.create({
        data: {
          inventoryItemId: input.inventoryItemId,
          type: "item_removed",
          quantity: input.quantity,
          unit: input.unit,
          actorUserId: actor.userId,
          storageLocationId: input.storageLocationId,
          note: input.note
        }
      });
      const stockService = new InventoryStockService({
        db: tx,
        now: this.options.now
      });
      const stockAfter = await stockService.refreshSnapshot({
        inventoryItemId: input.inventoryItemId,
        storageLocationId: input.storageLocationId,
        unit: input.unit
      });
      const reviewTaskIds: string[] = [];

      if (stockAfter < 0) {
        const task = await tx.workflowTask.create({
          data: {
            type: "inventory.negative_stock_risk",
            status: "open",
            severity: "critical",
            title: "Negative Bestandsprüfung",
            description: `Entnahme von ${inventoryItem.name} führt zu Bestand ${stockAfter} ${input.unit}.`,
            assignedRole: "admin"
          }
        });
        reviewTaskIds.push(task.id);
      }

      return {
        movementId: movement.id,
        stockAfter,
        reviewTaskIds
      };
    });
  }
}
