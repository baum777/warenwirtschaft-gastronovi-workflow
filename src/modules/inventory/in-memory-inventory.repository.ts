import type {
  InventoryActor,
  InventoryItemRecord,
  InventoryMovementRecord,
  ItemStockRecord,
  MovementConflictReason,
  MovementRequestType,
  WorkspaceCode
} from "./inventory.types.js";

export type InventoryRepositoryState = {
  actors: InventoryActor[];
  items: InventoryItemRecord[];
  stocks: ItemStockRecord[];
  movements?: InventoryMovementRecord[];
};

export type RecordMovementAttemptInput = {
  inventoryItemId: string;
  requestType: MovementRequestType;
  quantity: number;
  unit: string;
  workspace: WorkspaceCode;
  actorUserId: string;
  clientMutationId: string;
  baseStockVersion?: number;
  syncStatus: "CONFLICT" | "REJECTED";
  conflictReason: MovementConflictReason;
  note?: string;
};

export type CommitAcceptedMovementInput = {
  inventoryItemId: string;
  requestType: MovementRequestType;
  quantity: number;
  unit: string;
  workspace: WorkspaceCode;
  actorUserId: string;
  clientMutationId: string;
  baseStockVersion?: number;
  resultingStock: number;
  resultingStockVersion: number;
  note?: string;
};

export type InventoryRepositoryPort = {
  findActor(actorId: string): Promise<InventoryActor | null>;
  findItem(inventoryItemId: string): Promise<InventoryItemRecord | null>;
  findStock(inventoryItemId: string): Promise<ItemStockRecord | null>;
  findMovementByClientMutationId(
    actorUserId: string,
    clientMutationId: string
  ): Promise<InventoryMovementRecord | null>;
  listItems(filter: {
    workspace?: WorkspaceCode;
    category?: string;
    subcategory?: string;
  }): Promise<InventoryItemRecord[]>;
  commitAcceptedMovement(input: CommitAcceptedMovementInput): Promise<{
    movement: InventoryMovementRecord;
    stock: ItemStockRecord;
  }>;
  recordMovementAttempt(input: RecordMovementAttemptInput): Promise<InventoryMovementRecord>;
};

export class InMemoryInventoryRepository implements InventoryRepositoryPort {
  private readonly actors = new Map<string, InventoryActor>();
  private readonly items = new Map<string, InventoryItemRecord>();
  private readonly stocks = new Map<string, ItemStockRecord>();
  private readonly movements = new Map<string, InventoryMovementRecord>();

  public constructor(state: InventoryRepositoryState) {
    for (const actor of state.actors) {
      this.actors.set(actor.id, actor);
    }

    for (const item of state.items) {
      this.items.set(item.id, item);
    }

    for (const stock of state.stocks) {
      this.stocks.set(stock.inventoryItemId, { ...stock });
    }

    for (const movement of state.movements ?? []) {
      this.movements.set(movement.clientMutationId, movement);
    }
  }

  public async findActor(actorId: string): Promise<InventoryActor | null> {
    return this.actors.get(actorId) ?? null;
  }

  public async findItem(inventoryItemId: string): Promise<InventoryItemRecord | null> {
    return this.items.get(inventoryItemId) ?? null;
  }

  public async findStock(inventoryItemId: string): Promise<ItemStockRecord | null> {
    return this.stocks.get(inventoryItemId) ?? null;
  }

  public async findMovementByClientMutationId(
    actorUserId: string,
    clientMutationId: string
  ): Promise<InventoryMovementRecord | null> {
    const movement = this.movements.get(clientMutationId);

    if (!movement || movement.actorUserId !== actorUserId) {
      return null;
    }

    return movement;
  }

  public async listItems(filter: {
    workspace?: WorkspaceCode;
    category?: string;
    subcategory?: string;
  }): Promise<InventoryItemRecord[]> {
    return Array.from(this.items.values()).filter((item) => {
      if (filter.workspace && item.workspace !== filter.workspace) {
        return false;
      }

      if (filter.category && item.category !== filter.category) {
        return false;
      }

      if (filter.subcategory && item.subcategory !== filter.subcategory) {
        return false;
      }

      return true;
    });
  }

  public async commitAcceptedMovement(input: CommitAcceptedMovementInput): Promise<{
    movement: InventoryMovementRecord;
    stock: ItemStockRecord;
  }> {
    const stock: ItemStockRecord = {
      inventoryItemId: input.inventoryItemId,
      currentStock: input.resultingStock,
      unit: input.unit,
      version: input.resultingStockVersion,
      updatedAt: new Date()
    };
    const movement = this.buildMovement({
      ...input,
      syncStatus: "ACCEPTED",
      resultingStockVersion: input.resultingStockVersion
    });

    this.stocks.set(input.inventoryItemId, stock);
    this.movements.set(input.clientMutationId, movement);

    return {
      movement,
      stock
    };
  }

  public async recordMovementAttempt(
    input: RecordMovementAttemptInput
  ): Promise<InventoryMovementRecord> {
    const movement = this.buildMovement(input);
    this.movements.set(input.clientMutationId, movement);
    return movement;
  }

  private buildMovement(
    input: (CommitAcceptedMovementInput | RecordMovementAttemptInput) & {
      syncStatus: InventoryMovementRecord["syncStatus"];
      conflictReason?: MovementConflictReason;
      resultingStockVersion?: number;
    }
  ): InventoryMovementRecord {
    return {
      id: `mov_${this.movements.size + 1}`,
      inventoryItemId: input.inventoryItemId,
      type: mapMovementType(input.requestType),
      quantity: input.quantity,
      unit: input.unit,
      workspace: input.workspace,
      actorUserId: input.actorUserId,
      clientMutationId: input.clientMutationId,
      baseStockVersion: input.baseStockVersion,
      resultingStockVersion: input.resultingStockVersion,
      syncStatus: input.syncStatus,
      conflictReason: input.conflictReason,
      note: input.note,
      createdAt: new Date(),
      syncedAt: input.syncStatus === "ACCEPTED" ? new Date() : undefined
    };
  }
}

export function seedInventoryState(): InventoryRepositoryState {
  return {
    actors: [
      {
        id: "user_admin",
        displayName: "Admin",
        role: "ADMIN",
        assignedWorkspaces: ["SERVICE", "HOTEL", "KITCHEN"],
        isActive: true
      },
      {
        id: "user_area_lead_service",
        displayName: "Bereichsleitung Service",
        role: "AREA_LEAD",
        assignedWorkspaces: ["SERVICE", "KITCHEN"],
        isActive: true
      },
      {
        id: "user_staff_kitchen",
        displayName: "Mitarbeiter Küche",
        role: "STAFF",
        assignedWorkspaces: ["KITCHEN"],
        isActive: true
      }
    ],
    items: [
      {
        id: "item_tomatoes",
        name: "Tomaten",
        sku: "K-FR-001",
        workspace: "KITCHEN",
        category: "FOOD",
        subcategory: "FRESH",
        defaultUnit: "kg",
        minStock: 5,
        isActive: true
      },
      {
        id: "item_milk",
        name: "Milch",
        sku: "K-FR-002",
        workspace: "KITCHEN",
        category: "FOOD",
        subcategory: "FRESH",
        defaultUnit: "l",
        minStock: 8,
        isActive: true
      },
      {
        id: "item_beer_keg",
        name: "Bierfass 30L",
        sku: "S-BAR-001",
        workspace: "SERVICE",
        category: "BEVERAGES",
        subcategory: "BAR_TAP",
        defaultUnit: "Fass",
        minStock: 2,
        isActive: true
      },
      {
        id: "item_cleaning_cloths",
        name: "Reinigungstücher",
        sku: "H-AU-001",
        workspace: "HOTEL",
        category: "WORK_UTENSILS",
        subcategory: "CLEANING_SUPPLIES",
        defaultUnit: "Packung",
        minStock: 4,
        isActive: true
      }
    ],
    stocks: [
      {
        inventoryItemId: "item_tomatoes",
        currentStock: 12,
        unit: "kg",
        version: 3,
        updatedAt: new Date("2026-05-26T08:00:00.000Z")
      },
      {
        inventoryItemId: "item_milk",
        currentStock: 4,
        unit: "l",
        version: 2,
        updatedAt: new Date("2026-05-26T08:00:00.000Z")
      },
      {
        inventoryItemId: "item_beer_keg",
        currentStock: 1,
        unit: "Fass",
        version: 8,
        updatedAt: new Date("2026-05-26T08:00:00.000Z")
      },
      {
        inventoryItemId: "item_cleaning_cloths",
        currentStock: 7,
        unit: "Packung",
        version: 5,
        updatedAt: new Date("2026-05-26T08:00:00.000Z")
      }
    ]
  };
}

function mapMovementType(
  requestType: MovementRequestType
): InventoryMovementRecord["type"] {
  switch (requestType) {
    case "IN":
      return "goods_received";
    case "OUT":
      return "item_removed";
    case "CORRECTION_POSITIVE":
      return "correction_positive";
    case "CORRECTION_NEGATIVE":
      return "correction_negative";
  }
}
