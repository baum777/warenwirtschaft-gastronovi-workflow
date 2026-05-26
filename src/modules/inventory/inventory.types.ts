export const workspaceCodes = ["SERVICE", "HOTEL", "KITCHEN"] as const;
export const userRoles = ["ADMIN", "AREA_LEAD", "STAFF"] as const;
export const movementRequestTypes = [
  "IN",
  "OUT",
  "CORRECTION_POSITIVE",
  "CORRECTION_NEGATIVE"
] as const;

export type WorkspaceCode = (typeof workspaceCodes)[number];
export type UserRole = (typeof userRoles)[number];
export type MovementRequestType = (typeof movementRequestTypes)[number];

export type ItemCategory =
  | "BEVERAGES"
  | "FOOD"
  | "DEVICES"
  | "WORK_UTENSILS"
  | "HYGIENE"
  | "EQUIPMENT";

export type ItemSubcategory =
  | "BAR_TAP"
  | "STORAGE"
  | "FRESH"
  | "DRY"
  | "NAPKINS"
  | "CLEANING_SUPPLIES"
  | "CONSUMABLES"
  | "SEATING"
  | "LIGHTS"
  | "OTHER";

export type MovementSyncStatus = "ACCEPTED" | "CONFLICT" | "REJECTED";

export type MovementConflictReason =
  | "INSUFFICIENT_STOCK"
  | "STALE_STOCK_VERSION"
  | "ITEM_INACTIVE"
  | "WORKSPACE_FORBIDDEN"
  | "UNIT_MISMATCH"
  | "DUPLICATE_CLIENT_MUTATION"
  | "SERVER_ERROR_RETRYABLE";

export type InventoryActor = {
  id: string;
  displayName: string;
  role: UserRole;
  assignedWorkspaces: WorkspaceCode[];
  isActive: boolean;
};

export type InventoryItemRecord = {
  id: string;
  name: string;
  sku?: string;
  workspace: WorkspaceCode;
  category: ItemCategory;
  subcategory?: ItemSubcategory;
  defaultUnit: string;
  minStock?: number;
  isActive: boolean;
};

export type ItemStockRecord = {
  inventoryItemId: string;
  storageLocationId?: string;
  currentStock: number;
  unit: string;
  version: number;
  updatedAt: Date;
};

export type InventoryMovementRecord = {
  id: string;
  inventoryItemId: string;
  type: "goods_received" | "item_removed" | "correction_positive" | "correction_negative";
  quantity: number;
  unit: string;
  workspace: WorkspaceCode;
  actorUserId: string;
  clientMutationId: string;
  baseStockVersion?: number;
  resultingStockVersion?: number;
  syncStatus: MovementSyncStatus;
  conflictReason?: MovementConflictReason;
  note?: string;
  createdAt: Date;
  syncedAt?: Date;
};

export type CreateMovementInput = {
  actorId: string;
  actorRole: UserRole;
  type: MovementRequestType;
  inventoryItemId: string;
  workspace: WorkspaceCode;
  quantity: number;
  unit: string;
  baseStockVersion?: number;
  clientMutationId: string;
  note?: string;
};

export type AcceptedMovementResult = {
  status: "ACCEPTED";
  clientMutationId: string;
  movementId: string;
  currentStock: number;
  stockVersion: number;
};

export type ConflictMovementResult = {
  status: "CONFLICT";
  clientMutationId: string;
  reason: MovementConflictReason;
  currentStock: number;
  stockVersion: number;
};

export type RejectedMovementResult = {
  status: "REJECTED";
  clientMutationId: string;
  reason: MovementConflictReason;
};

export type MovementResult =
  | AcceptedMovementResult
  | ConflictMovementResult
  | RejectedMovementResult;
