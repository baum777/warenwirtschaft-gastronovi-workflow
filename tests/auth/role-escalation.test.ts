import { describe, expect, it } from "vitest";

import { assertCanGrantOrganizationRole, canGrantOrganizationRole } from "../../src/modules/auth/actor.js";

describe("organization role grant rules", () => {
  it("blocks manager from granting admin", () => {
    expect(canGrantOrganizationRole("manager", "admin")).toBe(false);
    expect(() => assertCanGrantOrganizationRole("manager", "admin")).toThrow(
      "actor cannot grant a higher organization role"
    );
  });

  it("allows manager to grant staff", () => {
    expect(canGrantOrganizationRole("manager", "staff")).toBe(true);
    expect(() => assertCanGrantOrganizationRole("manager", "staff")).not.toThrow();
  });
});
