import type {
  InventoryActor,
  MovementRequestType,
  UserRole,
  WorkspaceCode
} from "./inventory.types.js";

export function hasWorkspaceAccess(actor: InventoryActor, workspace: WorkspaceCode): boolean {
  if (actor.role === "ADMIN") {
    return true;
  }

  return actor.assignedWorkspaces.includes(workspace);
}

export function canCreateMovement(actor: InventoryActor, type: MovementRequestType): boolean {
  if (actor.role === "ADMIN" || actor.role === "AREA_LEAD") {
    return true;
  }

  return actor.role === "STAFF" && (type === "IN" || type === "OUT");
}

export function actorRoleMatchesHeader(actor: InventoryActor, actorRole: UserRole): boolean {
  return actor.role === actorRole;
}
