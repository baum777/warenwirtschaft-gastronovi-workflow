import {
  actorRoleMatchesHeader,
  canCreateMovement,
  hasWorkspaceAccess
} from "./inventory-authorization.js";
import type { InventoryRepositoryPort } from "./in-memory-inventory.repository.js";
import type {
  CreateMovementInput,
  InventoryMovementRecord,
  MovementConflictReason,
  MovementResult,
  WorkspaceCode
} from "./inventory.types.js";

export type InventoryMovementServiceOptions = {
  repository: InventoryRepositoryPort;
};

export type SyncMovementsInput = {
  actorId: string;
  actorRole: CreateMovementInput["actorRole"];
  items: Array<Omit<CreateMovementInput, "actorId" | "actorRole">>;
};

export class InventoryMovementService {
  public constructor(private readonly options: InventoryMovementServiceOptions) {}

  public async listReadableItems(input: {
    actorId: string;
    actorRole: CreateMovementInput["actorRole"];
    workspace?: WorkspaceCode;
    category?: string;
    subcategory?: string;
  }): Promise<{ status: "OK"; items: unknown[] } | { status: "REJECTED"; reason: "WORKSPACE_FORBIDDEN" }> {
    const actor = await this.options.repository.findActor(input.actorId);

    if (!actor || !actor.isActive || !actorRoleMatchesHeader(actor, input.actorRole)) {
      return {
        status: "REJECTED",
        reason: "WORKSPACE_FORBIDDEN"
      };
    }

    if (input.workspace && !hasWorkspaceAccess(actor, input.workspace)) {
      return {
        status: "REJECTED",
        reason: "WORKSPACE_FORBIDDEN"
      };
    }

    const items = await this.options.repository.listItems({
      workspace: input.workspace,
      category: input.category,
      subcategory: input.subcategory
    });

    return {
      status: "OK",
      items: items.filter((item) => hasWorkspaceAccess(actor, item.workspace))
    };
  }

  public async syncMovements(input: SyncMovementsInput): Promise<{ results: MovementResult[] }> {
    const results: MovementResult[] = [];

    for (const item of input.items) {
      results.push(
        await this.createMovement({
          actorId: input.actorId,
          actorRole: input.actorRole,
          ...item
        })
      );
    }

    return { results };
  }

  public async createMovement(input: CreateMovementInput): Promise<MovementResult> {
    const actor = await this.options.repository.findActor(input.actorId);

    if (!actor || !actor.isActive || !actorRoleMatchesHeader(actor, input.actorRole)) {
      return this.reject(input, "WORKSPACE_FORBIDDEN");
    }

    const duplicate = await this.options.repository.findMovementByClientMutationId(
      input.actorId,
      input.clientMutationId
    );

    if (duplicate) {
      return this.mapExistingMovement(duplicate);
    }

    if (!hasWorkspaceAccess(actor, input.workspace) || !canCreateMovement(actor, input.type)) {
      return this.reject(input, "WORKSPACE_FORBIDDEN");
    }

    const item = await this.options.repository.findItem(input.inventoryItemId);

    if (!item || !item.isActive) {
      return this.reject(input, "ITEM_INACTIVE");
    }

    if (item.workspace !== input.workspace || !hasWorkspaceAccess(actor, item.workspace)) {
      return this.reject(input, "WORKSPACE_FORBIDDEN");
    }

    const stock = await this.options.repository.findStock(input.inventoryItemId);

    if (!stock) {
      return this.conflict(input, "ITEM_INACTIVE", 0, 0);
    }

    if (stock.unit !== input.unit || item.defaultUnit !== input.unit) {
      return this.conflict(input, "UNIT_MISMATCH", stock.currentStock, stock.version);
    }

    if (input.baseStockVersion !== undefined && input.baseStockVersion !== stock.version) {
      return this.conflict(input, "STALE_STOCK_VERSION", stock.currentStock, stock.version);
    }

    const nextStock = stock.currentStock + getSignedQuantity(input.type, input.quantity);

    if (actor.role === "STAFF" && nextStock < 0) {
      return this.conflict(input, "INSUFFICIENT_STOCK", stock.currentStock, stock.version);
    }

    const committed = await this.options.repository.commitAcceptedMovement({
      inventoryItemId: input.inventoryItemId,
      requestType: input.type,
      quantity: input.quantity,
      unit: input.unit,
      workspace: input.workspace,
      actorUserId: input.actorId,
      clientMutationId: input.clientMutationId,
      baseStockVersion: input.baseStockVersion,
      resultingStock: nextStock,
      resultingStockVersion: stock.version + 1,
      note: input.note
    });

    return {
      status: "ACCEPTED",
      clientMutationId: input.clientMutationId,
      movementId: committed.movement.id,
      currentStock: committed.stock.currentStock,
      stockVersion: committed.stock.version
    };
  }

  private async conflict(
    input: CreateMovementInput,
    reason: MovementConflictReason,
    currentStock: number,
    stockVersion: number
  ): Promise<MovementResult> {
    await this.options.repository.recordMovementAttempt({
      inventoryItemId: input.inventoryItemId,
      requestType: input.type,
      quantity: input.quantity,
      unit: input.unit,
      workspace: input.workspace,
      actorUserId: input.actorId,
      clientMutationId: input.clientMutationId,
      baseStockVersion: input.baseStockVersion,
      syncStatus: "CONFLICT",
      conflictReason: reason,
      note: input.note
    });

    return {
      status: "CONFLICT",
      clientMutationId: input.clientMutationId,
      reason,
      currentStock,
      stockVersion
    };
  }

  private async reject(
    input: CreateMovementInput,
    reason: MovementConflictReason
  ): Promise<MovementResult> {
    await this.options.repository.recordMovementAttempt({
      inventoryItemId: input.inventoryItemId,
      requestType: input.type,
      quantity: input.quantity,
      unit: input.unit,
      workspace: input.workspace,
      actorUserId: input.actorId,
      clientMutationId: input.clientMutationId,
      baseStockVersion: input.baseStockVersion,
      syncStatus: "REJECTED",
      conflictReason: reason,
      note: input.note
    });

    return {
      status: "REJECTED",
      clientMutationId: input.clientMutationId,
      reason
    };
  }

  private mapExistingMovement(movement: InventoryMovementRecord): MovementResult {
    if (movement.syncStatus === "ACCEPTED") {
      const stockVersion = movement.resultingStockVersion ?? 0;

      return {
        status: "ACCEPTED",
        clientMutationId: movement.clientMutationId,
        movementId: movement.id,
        currentStock: 0,
        stockVersion
      };
    }

    if (movement.syncStatus === "CONFLICT") {
      return {
        status: "CONFLICT",
        clientMutationId: movement.clientMutationId,
        reason: movement.conflictReason ?? "DUPLICATE_CLIENT_MUTATION",
        currentStock: 0,
        stockVersion: movement.resultingStockVersion ?? 0
      };
    }

    return {
      status: "REJECTED",
      clientMutationId: movement.clientMutationId,
      reason: movement.conflictReason ?? "DUPLICATE_CLIENT_MUTATION"
    };
  }
}

function getSignedQuantity(type: CreateMovementInput["type"], quantity: number): number {
  switch (type) {
    case "IN":
    case "CORRECTION_POSITIVE":
      return quantity;
    case "OUT":
    case "CORRECTION_NEGATIVE":
      return -quantity;
  }
}
