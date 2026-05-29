import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  ActorAuthError,
  requireActorRole,
  resolveActorFromRequest,
  type ActorAuthDependencies
} from "../modules/auth/actor.js";
import type { ProfileServicePort } from "../modules/profile/profile.service.js";

export type ProfileRouteDependencies = {
  actorAuth: ActorAuthDependencies;
  profileService?: ProfileServicePort;
};

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).optional(),
  preferredStorageLocationId: z.string().trim().min(1).nullable().optional()
});

const updatePreferencesSchema = z.object({
  preferences: z.record(z.unknown()).optional(),
  language: z.string().trim().min(1).optional(),
  startPage: z.string().trim().min(1).optional(),
  mobileMode: z.string().trim().min(1).optional()
});

export async function profileRoute(
  app: FastifyInstance,
  dependencies: ProfileRouteDependencies
): Promise<void> {
  app.get("/me", async (request) => {
    const actor = await resolveActorFromRequest(request, dependencies.actorAuth);
    requireActorRole(actor, ["admin", "shift_lead", "staff"]);

    return readProfileService(dependencies).getMe(actor);
  });

  app.patch("/me/profile", async (request, reply) => {
    const actor = await resolveActorFromRequest(request, dependencies.actorAuth);
    requireActorRole(actor, ["admin", "shift_lead", "staff"]);
    const parsed = updateProfileSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "request body validation failed",
        issues: parsed.error.issues
      });
    }

    return readProfileService(dependencies).updateProfile(actor, parsed.data);
  });

  app.patch("/me/preferences", async (request, reply) => {
    const actor = await resolveActorFromRequest(request, dependencies.actorAuth);
    requireActorRole(actor, ["admin", "shift_lead", "staff"]);
    const parsed = updatePreferencesSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "request body validation failed",
        issues: parsed.error.issues
      });
    }

    return readProfileService(dependencies).updatePreferences(actor, parsed.data);
  });
}

function readProfileService(dependencies: ProfileRouteDependencies): ProfileServicePort {
  if (!dependencies.profileService) {
    throw new ActorAuthError("profile service is not configured", 401);
  }

  return dependencies.profileService;
}
