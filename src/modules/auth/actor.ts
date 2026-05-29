import type { IncomingHttpHeaders } from "node:http";

import type {
  AuthenticatedAuthUser,
  SupabaseAuthServicePort
} from "./supabase-auth.service.js";

export const roles = ["staff", "shift_lead", "admin", "system"] as const;

export type Role = (typeof roles)[number];

export type Actor = {
  userId: string;
  role: Role;
  authUserId?: string;
  profileId?: string;
  teamId?: string;
};

export type AuthMode = "demo_headers" | "supabase";

export type ActorProfileServicePort = {
  resolveActorForAuthUser(authUser: AuthenticatedAuthUser): Promise<Actor>;
};

export type ActorAuthDependencies = {
  authMode: AuthMode;
  supabaseAuthService?: SupabaseAuthServicePort;
  profileService?: ActorProfileServicePort;
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

export async function resolveActorFromRequest(
  request: { headers: IncomingHttpHeaders },
  dependencies: ActorAuthDependencies
): Promise<Actor> {
  if (dependencies.authMode === "demo_headers") {
    return parseActorFromHeaders(request.headers);
  }

  if (!dependencies.supabaseAuthService || !dependencies.profileService) {
    throw new ActorAuthError("supabase auth is not configured", 401);
  }

  const token = readBearerToken(request.headers);
  const authUser = await dependencies.supabaseAuthService.verifyAccessToken(token);

  return dependencies.profileService.resolveActorForAuthUser(authUser);
}

function readHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function readBearerToken(headers: IncomingHttpHeaders): string {
  const authorization = readHeader(headers, "authorization")?.trim();
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  if (!token) {
    throw new ActorAuthError("bearer token is required", 401);
  }

  return token;
}

function isRole(value: string): value is Role {
  return roles.includes(value as Role);
}
