import type { IncomingHttpHeaders } from "node:http";

export const roles = ["staff", "shift_lead", "admin", "system"] as const;

export type Role = (typeof roles)[number];

export type Actor = {
  userId: string;
  role: Role;
};

export class ActorAuthError extends Error {
  public readonly statusCode: 401 | 403;

  public constructor(message: string, statusCode: 401 | 403) {
    super(message);
    this.name = "ActorAuthError";
    this.statusCode = statusCode;
  }
}

export function parseActorFromHeaders(headers: IncomingHttpHeaders): Actor {
  const userId = readHeader(headers, "x-actor-id")?.trim();
  const role = readHeader(headers, "x-actor-role")?.trim();

  if (!userId || !role) {
    throw new ActorAuthError("actor headers are required", 401);
  }

  if (!isRole(role)) {
    throw new ActorAuthError("actor role is not allowed", 403);
  }

  return {
    userId,
    role
  };
}

export function requireActorRole(actor: Actor, allowedRoles: readonly Role[]): Actor {
  if (!allowedRoles.includes(actor.role)) {
    throw new ActorAuthError("actor role is not permitted", 403);
  }

  return actor;
}

function readHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function isRole(value: string): value is Role {
  return roles.includes(value as Role);
}
