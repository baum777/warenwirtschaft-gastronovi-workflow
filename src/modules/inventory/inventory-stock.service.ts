import type { InventoryMovementRecord } from "./inventory-movement.types.js";

export type InventoryStockDatabaseClient = {
  inventoryMovement: {
    findMany(args: {
      where: {
        inventoryItemId: string;
        storageLocationId?: string | null;
      };
      select?: {
        type?: true;
        quantity?: true;
        createdAt?: true;
      };
      orderBy?: {
        createdAt: "asc" | "desc";
      };
    }): Promise<InventoryMovementRecord[]>;
  };
  inventoryStockSnapshot: {
    upsert(args: {
      where: {
        inventoryItemId_storageLocationId: {
          inventoryItemId: string;
          storageLocationId?: string | null;
        };
      };
      create: {
        inventoryItemId: string;
        storageLocationId?: string | null;
        quantity: number;
        unit: string;
        calculatedAt: Date;
      };
      update: {
        quantity: number;
        unit: string;
        calculatedAt: Date;
      };
    }): Promise<unknown>;
  };
};

export class InventoryStockService {
  public constructor(
    private readonly options: {
      db: InventoryStockDatabaseClient;
      now?: () => Date;
    }
  ) {}

  public async calculateStock(input: {
    inventoryItemId: string;
    storageLocationId?: string;
  }): Promise<number> {
    const movements = await this.options.db.inventoryMovement.findMany({
      where: {
        inventoryItemId: input.inventoryItemId,
        storageLocationId: input.storageLocationId ?? null
      },
      select: {
        type: true,
        quantity: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return movements.reduce((total, movement) => total + signedQuantity(movement), 0);
  }

  public async refreshSnapshot(input: {
    inventoryItemId: string;
    storageLocationId?: string;
    unit: string;
  }): Promise<number> {
    const quantity = await this.calculateStock(input);
    const calculatedAt = this.options.now?.() ?? new Date();

    if (!input.storageLocationId) {
      return quantity;
    }

    await this.options.db.inventoryStockSnapshot.upsert({
      where: {
        inventoryItemId_storageLocationId: {
          inventoryItemId: input.inventoryItemId,
          storageLocationId: input.storageLocationId
        }
      },
      create: {
        inventoryItemId: input.inventoryItemId,
        storageLocationId: input.storageLocationId,
        quantity,
        unit: input.unit,
        calculatedAt
      },
      update: {
        quantity,
        unit: input.unit,
        calculatedAt
      }
    });

    return quantity;
  }
}

export function signedQuantity(
  movement: Pick<InventoryMovementRecord, "type" | "quantity">
): number {
  if (movement.type === "goods_received" || movement.type === "correction_positive") {
    return movement.quantity;
  }

  return -movement.quantity;
}
