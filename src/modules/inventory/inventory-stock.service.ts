type MovementType =
  | "goods_received"
  | "item_removed"
  | "correction_positive"
  | "correction_negative";

type StockMovementRecord = {
  type: MovementType;
  quantity: number;
  createdAt?: Date;
};

type StockSnapshotRecord = {
  id: string;
};

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
    }): Promise<StockMovementRecord[]>;
  };
  inventoryStockSnapshot: {
    findFirst(args: {
      where: {
        inventoryItemId: string;
        storageLocationId: null;
      };
      select: {
        id: true;
      };
    }): Promise<StockSnapshotRecord | null>;
    upsert(args: {
      where: {
        inventoryItemId_storageLocationId: {
          inventoryItemId: string;
          storageLocationId: string;
        };
      };
      create: {
        inventoryItemId: string;
        storageLocationId: string;
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
    update(args: {
      where: {
        id: string;
      };
      data: {
        quantity: number;
        unit: string;
        calculatedAt: Date;
      };
    }): Promise<unknown>;
    create(args: {
      data: {
        inventoryItemId: string;
        storageLocationId: null;
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
      await this.refreshUnlocatedSnapshot({
        inventoryItemId: input.inventoryItemId,
        quantity,
        unit: input.unit,
        calculatedAt
      });
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

  private async refreshUnlocatedSnapshot(input: {
    inventoryItemId: string;
    quantity: number;
    unit: string;
    calculatedAt: Date;
  }): Promise<void> {
    const existingSnapshot = await this.options.db.inventoryStockSnapshot.findFirst({
      where: {
        inventoryItemId: input.inventoryItemId,
        storageLocationId: null
      },
      select: {
        id: true
      }
    });

    if (existingSnapshot) {
      await this.options.db.inventoryStockSnapshot.update({
        where: {
          id: existingSnapshot.id
        },
        data: {
          quantity: input.quantity,
          unit: input.unit,
          calculatedAt: input.calculatedAt
        }
      });
      return;
    }

    await this.options.db.inventoryStockSnapshot.create({
      data: {
        inventoryItemId: input.inventoryItemId,
        storageLocationId: null,
        quantity: input.quantity,
        unit: input.unit,
        calculatedAt: input.calculatedAt
      }
    });
  }
}

export function signedQuantity(movement: Pick<StockMovementRecord, "type" | "quantity">): number {
  if (movement.type === "goods_received" || movement.type === "correction_positive") {
    return movement.quantity;
  }

  return -movement.quantity;
}
