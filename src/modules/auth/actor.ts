import type { IncomingHttpHeaders } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

export const roles = ["viewer", "staff", "shift_lead", "admin", "system"] as const;
export const organizationRoles = ["owner", "admin", "manager", "staff", "viewer"] as const;

export type Role = (typeof roles)[number];
export type OrganizationRole = (typeof organizationRoles)[number];

export type Actor = {
  userId: string;
  role: Role;
  organizationId?: string;
  organizationRole?: OrganizationRole;
};

export class ActorAuthError extends Error {
  public readonly statusCode: 401 | 403;

  public constructor(message: string, statusCode: 401 | 403) {
    super(message);
    this.name = "ActorAuthError";
    this.statusCode = statusCode;
  }
}

export type OrganizationMembership = {
  organizationId: string;
  role: OrganizationRole;
  createdAt: Date;
};

export type ActorAuthDatabaseClient = {
  organizationMember: {
    findMany(args: {
      where: {
        userId: string;
      };
      select: {
        organizationId: true;
        role: true;
        createdAt: true;
      };
      orderBy: Array<{
        createdAt?: "asc" | "desc";
        organizationId?: "asc" | "desc";
      }>;
      take: number;
    }): Promise<OrganizationMembership[]>;
  };
  $executeRawUnsafe?(query: string): Promise<unknown>;
  $transaction?<T>(callback: (tx: ActorAuthDatabaseClient) => Promise<T>): Promise<T>;
};

export async function parseActorFromHeaders(
  headers: IncomingHttpHeaders,
  options: {
    db: ActorAuthDatabaseClient;
    jwtSecret: string;
  }
): Promise<Actor> {
  const token = readBearerToken(headers);
  const claims = verifySupabaseJwt(token, options.jwtSecret);

  if (!claims.sub) {
    throw new ActorAuthError("authorization token is missing subject claim", 401);
  }

  const memberships = await findMembershipsForUser(options.db, claims.sub);

  const activeMembership = memberships[0];
  if (!activeMembership) {
    throw new ActorAuthError("actor has no organization membership", 403);
  }

  return {
    userId: claims.sub,
    role: mapOrganizationRoleToRouteRole(activeMembership.role),
    organizationId: activeMembership.organizationId,
    organizationRole: activeMembership.role
  };
}

async function findMembershipsForUser(
  db: ActorAuthDatabaseClient,
  userId: string
): Promise<OrganizationMembership[]> {
  if (db.$transaction && db.$executeRawUnsafe) {
    return db.$transaction(async (tx) => {
      await setSupabaseJwtClaims(tx, userId);
      return findMembershipRows(tx, userId);
    });
  }

  return findMembershipRows(db, userId);
}

async function findMembershipRows(
  db: ActorAuthDatabaseClient,
  userId: string
): Promise<OrganizationMembership[]> {
  return db.organizationMember.findMany({
    where: {
      userId
    },
    select: {
      organizationId: true,
      role: true,
      createdAt: true
    },
    orderBy: [{ createdAt: "asc" }, { organizationId: "asc" }],
    take: 1
  });
}

async function setSupabaseJwtClaims(db: ActorAuthDatabaseClient, userId: string): Promise<void> {
  if (!db.$executeRawUnsafe) {
    return;
  }

  const escapedUserId = escapeSqlLiteral(userId);
  const escapedClaims = escapeSqlLiteral(JSON.stringify({ sub: userId }));

  await db.$executeRawUnsafe(
    `select set_config('request.jwt.claim.sub', '${escapedUserId}', true)`
  );
  await db.$executeRawUnsafe(
    `select set_config('request.jwt.claims', '${escapedClaims}', true)`
  );
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

function isOrganizationRole(value: string): value is OrganizationRole {
  return organizationRoles.includes(value as OrganizationRole);
}

function readBearerToken(headers: IncomingHttpHeaders): string {
  const authorization = readHeader(headers, "authorization")?.trim();
  if (!authorization) {
    throw new ActorAuthError("authorization header is required", 401);
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new ActorAuthError("authorization header must use bearer token", 401);
  }

  return token;
}

type JwtClaims = {
  sub?: string;
  role?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
};

function verifySupabaseJwt(token: string, jwtSecret: string): JwtClaims {
  const segments = token.split(".");
  if (segments.length !== 3) {
    throw new ActorAuthError("authorization token is malformed", 401);
  }

  const [headerSegment, payloadSegment, signatureSegment] = segments;
  const header = parseJwtJson<Record<string, unknown>>(headerSegment);
  const algorithm = typeof header.alg === "string" ? header.alg : undefined;

  if (algorithm !== "HS256") {
    throw new ActorAuthError("authorization token algorithm is not supported", 401);
  }

  const body = `${headerSegment}.${payloadSegment}`;
  const expected = createHmac("sha256", jwtSecret).update(body).digest();
  const actual = decodeJwtBase64url(signatureSegment);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ActorAuthError("authorization token signature is invalid", 401);
  }

  const claims = parseJwtJson<JwtClaims>(payloadSegment);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (typeof claims.exp === "number" && claims.exp <= nowSeconds) {
    throw new ActorAuthError("authorization token is expired", 401);
  }
  if (typeof claims.nbf === "number" && claims.nbf > nowSeconds) {
    throw new ActorAuthError("authorization token is not active yet", 401);
  }

  return claims;
}

function decodeJwtBase64url(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = padded.length % 4;
  const normalized = remainder === 0 ? padded : `${padded}${"=".repeat(4 - remainder)}`;

  try {
    return Buffer.from(normalized, "base64");
  } catch {
    throw new ActorAuthError("authorization token encoding is invalid", 401);
  }
}

function parseJwtJson<T>(segment: string): T {
  const decoded = decodeJwtBase64url(segment).toString("utf8");
  try {
    return JSON.parse(decoded) as T;
  } catch {
    throw new ActorAuthError("authorization token payload is invalid", 401);
  }
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function mapOrganizationRoleToRouteRole(role: OrganizationRole): Role {
  switch (role) {
    case "owner":
    case "admin":
      return "admin";
    case "manager":
      return "shift_lead";
    case "staff":
      return "staff";
    case "viewer":
      return "viewer";
  }
}

const organizationRoleRank: Record<OrganizationRole, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  staff: 2,
  viewer: 1
};

export function canGrantOrganizationRole(
  actorRole: OrganizationRole,
  targetRole: OrganizationRole
): boolean {
  return organizationRoleRank[targetRole] <= organizationRoleRank[actorRole];
}

export function assertCanGrantOrganizationRole(
  actorRole: OrganizationRole,
  targetRole: OrganizationRole
): void {
  if (!isOrganizationRole(actorRole) || !isOrganizationRole(targetRole)) {
    throw new ActorAuthError("organization role is not allowed", 403);
  }

  if (!canGrantOrganizationRole(actorRole, targetRole)) {
    throw new ActorAuthError("actor cannot grant a higher organization role", 403);
  }
}
