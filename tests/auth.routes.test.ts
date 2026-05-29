import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { AuthenticatedAuthUser } from "../src/modules/auth/supabase-auth.service.js";
import type { ProfileContext } from "../src/modules/profile/profile.service.js";

const profileContext: ProfileContext = {
  profile: {
    profileId: "profile-1",
    authUserId: "auth-user-1",
    email: "anna@example.com",
    displayName: "Anna Admin",
    defaultTeamId: "team-1",
    preferredStorageLocationId: null,
    preferences: {}
  },
  teams: [
    {
      teamId: "team-1",
      name: "Restaurant Mitte",
      role: "admin"
    }
  ],
  activeTeam: {
    teamId: "team-1",
    name: "Restaurant Mitte",
    role: "admin"
  },
  effectiveActor: {
    authUserId: "auth-user-1",
    profileId: "profile-1",
    teamId: "team-1",
    userId: "profile-1",
    role: "admin"
  },
  needsOnboarding: false
};

describe("auth routes", () => {
  it("returns public Supabase auth configuration without secrets", async () => {
    const app = buildApp({
      env: supabaseEnv(),
      inventory: fakeInventoryServices(),
      auth: fakeAuthDependencies()
    });

    try {
      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: "/auth/public-config"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        authMode: "supabase",
        registrationMode: "first_admin",
        supabaseUrl: "https://project.supabase.co",
        supabasePublishableKey: "publishable-key"
      });
    } finally {
      await app.close();
    }
  });

  it("bootstraps a Supabase session into a server-owned actor context", async () => {
    const calls: Array<{ token: string } | { authUser: AuthenticatedAuthUser; teamName?: string }> = [];
    const app = buildApp({
      env: supabaseEnv(),
      inventory: fakeInventoryServices(),
      auth: fakeAuthDependencies({
        async verifyAccessToken(token) {
          calls.push({ token });
          return {
            id: "auth-user-1",
            email: "anna@example.com",
            userMetadata: {
              role: "staff"
            }
          };
        },
        async bootstrapFromAuthUser(authUser, input) {
          calls.push({ authUser, teamName: input.teamName });
          return profileContext;
        }
      })
    });

    try {
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: "/auth/bootstrap",
        headers: {
          authorization: "Bearer valid-token",
          "x-actor-role": "admin"
        },
        payload: {
          displayName: "Anna Admin",
          teamName: "Restaurant Mitte",
          createFirstAdmin: true
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        profile: {
          profileId: "profile-1",
          email: "anna@example.com",
          displayName: "Anna Admin"
        },
        activeTeam: {
          teamId: "team-1",
          name: "Restaurant Mitte",
          role: "admin"
        },
        effectiveActor: {
          profileId: "profile-1",
          role: "admin"
        },
        needsOnboarding: false
      });
      expect(calls).toEqual([
        { token: "valid-token" },
        {
          authUser: {
            id: "auth-user-1",
            email: "anna@example.com",
            userMetadata: {
              role: "staff"
            }
          },
          teamName: "Restaurant Mitte"
        }
      ]);
    } finally {
      await app.close();
    }
  });
});

function supabaseEnv() {
  return {
    NODE_ENV: "production" as const,
    DEMO_MODE: false,
    AUTH_MODE: "supabase" as const,
    REGISTRATION_MODE: "first_admin" as const,
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "publishable-key"
  };
}

function fakeAuthDependencies(overrides: Partial<AuthOverrides> = {}) {
  return {
    supabaseAuthService: {
      verifyAccessToken:
        overrides.verifyAccessToken ??
        (async () => ({
          id: "auth-user-1",
          email: "anna@example.com",
          userMetadata: {}
        }))
    },
    profileService: {
      bootstrapFromAuthUser: overrides.bootstrapFromAuthUser ?? (async () => profileContext),
      resolveActorForAuthUser: async () => profileContext.effectiveActor,
      getMe: async () => profileContext,
      updateProfile: async () => profileContext,
      updatePreferences: async () => profileContext
    }
  };
}

type AuthOverrides = {
  verifyAccessToken(token: string): Promise<AuthenticatedAuthUser>;
  bootstrapFromAuthUser(
    authUser: AuthenticatedAuthUser,
    input: { displayName?: string; teamName?: string; createFirstAdmin?: boolean }
  ): Promise<ProfileContext>;
};

function fakeInventoryServices() {
  return {
    purchaseOrderService: {},
    inventoryItemService: {},
    inventoryMasterDataService: {},
    goodsReceiptService: {},
    withdrawalService: {},
    correctionService: {},
    reviewTaskService: {},
    inventoryReadService: {},
    inventoryCsvService: {}
  } as any;
}
