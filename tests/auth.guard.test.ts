import { describe, expect, it } from "vitest";

import {
  parseActorFromHeaders,
  requireActorRole,
  resolveActorFromRequest
} from "../src/modules/auth/actor.js";

describe("temporary actor header guard", () => {
  it("fails closed when actor headers are missing", () => {
    expect(() => parseActorFromHeaders({})).toThrow("actor headers are required");
  });

  it("rejects unknown roles", () => {
    expect(() =>
      parseActorFromHeaders({
        "x-actor-id": "user-1",
        "x-actor-role": "owner"
      })
    ).toThrow("actor role is not allowed");
  });

  it("allows only explicitly permitted roles", () => {
    const actor = parseActorFromHeaders({
      "x-actor-id": "admin-1",
      "x-actor-role": "admin"
    });

    expect(requireActorRole(actor, ["admin"])).toEqual({
      userId: "admin-1",
      role: "admin"
    });
    expect(() => requireActorRole({ userId: "staff-1", role: "staff" }, ["admin"])).toThrow(
      "actor role is not permitted"
    );
  });

  it("ignores browser-supplied actor role headers in supabase auth mode", async () => {
    const actor = await resolveActorFromRequest(
      {
        headers: {
          authorization: "Bearer valid-token",
          "x-actor-id": "browser-admin",
          "x-actor-role": "admin"
        }
      },
      {
        authMode: "supabase",
        supabaseAuthService: {
          async verifyAccessToken(token) {
            expect(token).toBe("valid-token");
            return {
              id: "auth-user-1",
              email: "staff@example.com",
              userMetadata: {
                role: "admin"
              }
            };
          }
        },
        profileService: {
          async resolveActorForAuthUser(authUser) {
            expect(authUser.id).toBe("auth-user-1");
            return {
              authUserId: "auth-user-1",
              profileId: "profile-1",
              teamId: "team-1",
              userId: "profile-1",
              role: "staff"
            };
          }
        }
      }
    );

    expect(actor).toEqual({
      authUserId: "auth-user-1",
      profileId: "profile-1",
      teamId: "team-1",
      userId: "profile-1",
      role: "staff"
    });
  });
});
