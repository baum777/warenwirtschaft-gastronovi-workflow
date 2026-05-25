import { describe, expect, it } from "vitest";

import { parseActorFromHeaders, requireActorRole } from "../src/modules/auth/actor.js";

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
});
