import { randomUUID } from "node:crypto";

import type { Actor } from "../auth/actor.js";
import type { AuthenticatedAuthUser } from "../auth/supabase-auth.service.js";

export type RegistrationMode = "open" | "invite_only" | "first_admin";
export type TeamRole = "admin" | "shift_lead" | "staff";

export type ProfileContext = {
  profile: {
    profileId: string;
    authUserId: string;
    email: string;
    displayName: string | null;
    defaultTeamId: string | null;
    preferredStorageLocationId: string | null;
    preferences: Record<string, unknown>;
  };
  teams: Array<{
    teamId: string;
    name: string;
    role: TeamRole;
  }>;
  activeTeam: {
    teamId: string;
    name: string;
    role: TeamRole;
  } | null;
  effectiveActor: Actor;
  needsOnboarding: boolean;
};

export type BootstrapProfileInput = {
  displayName?: string;
  teamName?: string;
  createFirstAdmin?: boolean;
};

export type UpdateProfileInput = {
  displayName?: string;
  preferredStorageLocationId?: string | null;
};

export type UpdatePreferencesInput = {
  preferences?: Record<string, unknown>;
  language?: string;
  startPage?: string;
  mobileMode?: string;
};

type ProfileRecord = {
  id: string;
  authUserId: string;
  email: string;
  displayName: string | null;
  defaultTeamId: string | null;
  preferredStorageLocationId: string | null;
  preferencesJson?: unknown;
  isActive: boolean;
};

type TeamMemberWithTeam = {
  teamId: string;
  role: TeamRole;
  status: "invited" | "active" | "suspended";
  team: {
    id: string;
    name: string;
  } | null;
};

export type ProfileDatabaseClient = {
  $transaction<T>(callback: (transaction: ProfileDatabaseClient) => Promise<T>): Promise<T>;
  userProfile: {
    findUnique(args: unknown): Promise<ProfileRecord | null>;
    create(args: unknown): Promise<ProfileRecord>;
    update(args: unknown): Promise<ProfileRecord>;
  };
  team: {
    create(args: unknown): Promise<{ id: string; name: string }>;
  };
  teamMember: {
    count(args: unknown): Promise<number>;
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<TeamMemberWithTeam[]>;
  };
};

export type ProfileServicePort = {
  bootstrapFromAuthUser(
    authUser: AuthenticatedAuthUser,
    input: BootstrapProfileInput
  ): Promise<ProfileContext>;
  resolveActorForAuthUser(authUser: AuthenticatedAuthUser): Promise<Actor>;
  getMe(actor: Actor): Promise<ProfileContext>;
  updateProfile(actor: Actor, input: UpdateProfileInput): Promise<ProfileContext>;
  updatePreferences(actor: Actor, input: UpdatePreferencesInput): Promise<ProfileContext>;
};

export class ProfileService implements ProfileServicePort {
  public constructor(
    private readonly options: {
      db: ProfileDatabaseClient;
      registrationMode: RegistrationMode;
    }
  ) {}

  public async bootstrapFromAuthUser(
    authUser: AuthenticatedAuthUser,
    input: BootstrapProfileInput
  ): Promise<ProfileContext> {
    return this.options.db.$transaction(async (transaction) => {
      const existingProfile = await findProfileByAuthUserId(transaction, authUser.id);
      const profile =
        existingProfile ??
        (await transaction.userProfile.create({
          data: {
            authUserId: authUser.id,
            email: authUser.email,
            displayName: sanitizeOptionalString(input.displayName),
            preferencesJson: {}
          }
        }));

      const memberships = await readActiveMemberships(transaction, profile.id);

      if (memberships.length === 0 && input.teamName && input.createFirstAdmin) {
        await this.createInitialAdminTeam(transaction, profile, input.teamName);
      } else if (input.displayName && input.displayName !== profile.displayName) {
        await transaction.userProfile.update({
          where: {
            id: profile.id
          },
          data: {
            displayName: sanitizeOptionalString(input.displayName)
          }
        });
      }

      return readContext(transaction, profile.id, authUser.id);
    });
  }

  public async resolveActorForAuthUser(authUser: AuthenticatedAuthUser): Promise<Actor> {
    const profile = await findProfileByAuthUserId(this.options.db, authUser.id);

    if (!profile || !profile.isActive) {
      throw profileAuthError("profile is not active");
    }

    const context = await readContext(this.options.db, profile.id, authUser.id);

    if (!context.activeTeam) {
      throw profileAuthError("active team membership is required");
    }

    return context.effectiveActor;
  }

  public async getMe(actor: Actor): Promise<ProfileContext> {
    return readContext(this.options.db, actor.profileId ?? actor.userId, actor.authUserId ?? actor.userId);
  }

  public async updateProfile(actor: Actor, input: UpdateProfileInput): Promise<ProfileContext> {
    await this.options.db.userProfile.update({
      where: {
        id: actor.profileId ?? actor.userId
      },
      data: {
        ...(input.displayName !== undefined
          ? {
              displayName: sanitizeOptionalString(input.displayName)
            }
          : {}),
        ...(input.preferredStorageLocationId !== undefined
          ? {
              preferredStorageLocationId: input.preferredStorageLocationId || null
            }
          : {})
      }
    });

    return this.getMe(actor);
  }

  public async updatePreferences(actor: Actor, input: UpdatePreferencesInput): Promise<ProfileContext> {
    const preferences = input.preferences ?? {
      language: input.language ?? "de",
      startPage: input.startPage ?? "dashboard",
      mobileMode: input.mobileMode ?? "auto"
    };

    await this.options.db.userProfile.update({
      where: {
        id: actor.profileId ?? actor.userId
      },
      data: {
        preferencesJson: preferences
      }
    });

    return this.getMe(actor);
  }

  private async createInitialAdminTeam(
    transaction: ProfileDatabaseClient,
    profile: ProfileRecord,
    teamName: string
  ): Promise<void> {
    const activeAdminCount = await transaction.teamMember.count({
      where: {
        role: "admin",
        status: "active"
      }
    });

    if (this.options.registrationMode === "invite_only") {
      throw profileAuthError("registration requires an invite");
    }

    if (this.options.registrationMode === "first_admin" && activeAdminCount > 0) {
      throw profileAuthError("first admin already exists");
    }

    const team = await transaction.team.create({
      data: {
        name: teamName.trim(),
        slug: `${slugify(teamName)}-${randomUUID().slice(0, 8)}`,
        createdByProfileId: profile.id
      }
    });

    await transaction.teamMember.create({
      data: {
        teamId: team.id,
        profileId: profile.id,
        role: "admin",
        status: "active"
      }
    });

    await transaction.userProfile.update({
      where: {
        id: profile.id
      },
      data: {
        defaultTeamId: team.id
      }
    });
  }
}

async function findProfileByAuthUserId(
  db: ProfileDatabaseClient,
  authUserId: string
): Promise<ProfileRecord | null> {
  return db.userProfile.findUnique({
    where: {
      authUserId
    }
  });
}

async function readContext(
  db: ProfileDatabaseClient,
  profileId: string,
  authUserId: string
): Promise<ProfileContext> {
  const profile = await db.userProfile.findUnique({
    where: {
      id: profileId
    }
  });

  if (!profile || !profile.isActive) {
    throw profileAuthError("profile is not active");
  }

  const memberships = await readActiveMemberships(db, profile.id);
  const teams = memberships
    .filter((membership) => membership.team)
    .map((membership) => ({
      teamId: membership.teamId,
      name: membership.team!.name,
      role: membership.role
    }));
  const activeTeam =
    teams.find((team) => team.teamId === profile.defaultTeamId) ?? teams[0] ?? null;
  const role = activeTeam?.role ?? "staff";
  const teamId = activeTeam?.teamId ?? "";

  return {
    profile: {
      profileId: profile.id,
      authUserId: profile.authUserId,
      email: profile.email,
      displayName: profile.displayName,
      defaultTeamId: profile.defaultTeamId,
      preferredStorageLocationId: profile.preferredStorageLocationId,
      preferences: readPreferences(profile.preferencesJson)
    },
    teams,
    activeTeam,
    effectiveActor: {
      authUserId,
      profileId: profile.id,
      teamId,
      userId: profile.id,
      role
    },
    needsOnboarding: !activeTeam
  };
}

async function readActiveMemberships(
  db: ProfileDatabaseClient,
  profileId: string
): Promise<TeamMemberWithTeam[]> {
  return db.teamMember.findMany({
    where: {
      profileId,
      status: "active"
    },
    include: {
      team: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });
}

function readPreferences(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function sanitizeOptionalString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "team";
}

function profileAuthError(message: string): Error & { statusCode: 403 } {
  const error = new Error(message) as Error & { statusCode: 403 };
  error.name = "ProfileAuthError";
  error.statusCode = 403;
  return error;
}
