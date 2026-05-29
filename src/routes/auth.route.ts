import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { ActorAuthError, type ActorAuthDependencies } from "../modules/auth/actor.js";
import type { SupabaseAuthServicePort } from "../modules/auth/supabase-auth.service.js";
import type {
  BootstrapProfileInput,
  ProfileServicePort,
  RegistrationMode
} from "../modules/profile/profile.service.js";

export type AuthRouteDependencies = {
  authMode: "demo_headers" | "supabase";
  registrationMode: RegistrationMode;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  supabaseAuthService?: SupabaseAuthServicePort;
  profileService?: ProfileServicePort;
};

const bootstrapSchema = z.object({
  displayName: z.string().trim().min(1).optional(),
  teamName: z.string().trim().min(1).optional(),
  createFirstAdmin: z.boolean().optional()
});

export async function authRoute(
  app: FastifyInstance,
  dependencies: AuthRouteDependencies
): Promise<void> {
  app.get("/auth/public-config", async () => ({
    authMode: dependencies.authMode,
    registrationMode: dependencies.registrationMode,
    supabaseUrl: dependencies.supabaseUrl ?? null,
    supabasePublishableKey: dependencies.supabasePublishableKey ?? null
  }));

  app.post("/auth/bootstrap", async (request, reply) => {
    if (dependencies.authMode === "demo_headers") {
      return {
        profile: {
          profileId: "demo-admin",
          authUserId: "demo-admin",
          email: "demo@example.local",
          displayName: "Demo Admin",
          defaultTeamId: "demo-team",
          preferredStorageLocationId: null,
          preferences: {}
        },
        teams: [
          {
            teamId: "demo-team",
            name: "Demo Team",
            role: "admin"
          }
        ],
        activeTeam: {
          teamId: "demo-team",
          name: "Demo Team",
          role: "admin"
        },
        effectiveActor: {
          userId: "demo-admin",
          role: "admin"
        },
        needsOnboarding: false
      };
    }

    const authUser = await readSupabaseAuthUser(request, dependencies);
    const parseResult = bootstrapSchema.safeParse(request.body ?? {});

    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "request body validation failed",
        issues: parseResult.error.issues
      });
    }

    if (!dependencies.profileService) {
      throw new ActorAuthError("profile service is not configured", 401);
    }

    return dependencies.profileService.bootstrapFromAuthUser(
      authUser,
      parseResult.data satisfies BootstrapProfileInput
    );
  });

  app.post("/auth/logout", async () => ({
    ok: true
  }));
}

export function actorDependenciesFromAuthRoute(
  dependencies: AuthRouteDependencies
): ActorAuthDependencies {
  return {
    authMode: dependencies.authMode,
    supabaseAuthService: dependencies.supabaseAuthService,
    profileService: dependencies.profileService
  };
}

async function readSupabaseAuthUser(
  request: FastifyRequest,
  dependencies: AuthRouteDependencies
) {
  if (!dependencies.supabaseAuthService) {
    throw new ActorAuthError("supabase auth is not configured", 401);
  }

  const authorization = request.headers.authorization?.trim();
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  if (!token) {
    throw new ActorAuthError("bearer token is required", 401);
  }

  return dependencies.supabaseAuthService.verifyAccessToken(token);
}
