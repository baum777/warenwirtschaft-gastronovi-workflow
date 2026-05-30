import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parseActorFromHeaders, requireActorRole } from "../src/modules/auth/actor.js";

const jwtSecret = "test-supabase-jwt-secret";

describe("authorization boundary", () => {
  it("fails closed when authorization header is missing", async () => {
    await expect(
      parseActorFromHeaders(
        {},
        {
          jwtSecret,
          db: membershipDb([])
        }
      )
    ).rejects.toThrow("authorization header is required");
  });

  it("maps organization memberships to route roles", async () => {
    const token = signHs256Token({ sub: "user-1", exp: Math.floor(Date.now() / 1000) + 60 });
    const actor = await parseActorFromHeaders(
      {
        authorization: `Bearer ${token}`
      },
      {
        jwtSecret,
        db: membershipDb([
          {
            organizationId: "org-1",
            role: "manager",
            createdAt: new Date("2026-05-30T10:00:00.000Z")
          }
        ])
      }
    );

    expect(requireActorRole(actor, ["shift_lead"])).toMatchObject({
      userId: "user-1",
      role: "shift_lead",
      organizationId: "org-1",
      organizationRole: "manager"
    });
  });

  it("sets Supabase JWT claim context before membership lookup when transactions are available", async () => {
    const calls: string[] = [];
    const token = signHs256Token({ sub: "user-1", exp: Math.floor(Date.now() / 1000) + 60 });
    const memberships = [
      {
        organizationId: "org-1",
        role: "staff" as const,
        createdAt: new Date("2026-05-30T10:00:00.000Z")
      }
    ];
    const tx = {
      async $executeRawUnsafe(query: string) {
        calls.push(query);
        return 1;
      },
      organizationMember: {
        async findMany() {
          calls.push("findMany");
          return memberships;
        }
      }
    };
    const db = {
      async $transaction<T>(callback: (txClient: typeof tx) => Promise<T>): Promise<T> {
        calls.push("transaction");
        return callback(tx);
      },
      async $executeRawUnsafe(query: string) {
        calls.push(query);
        return 1;
      },
      organizationMember: {
        async findMany() {
          calls.push("findMany");
          return memberships;
        }
      }
    };

    const actor = await parseActorFromHeaders(
      {
        authorization: `Bearer ${token}`
      },
      {
        jwtSecret,
        db
      }
    );

    expect(actor.organizationId).toBe("org-1");
    expect(calls[0]).toBe("transaction");
    expect(calls[1]).toContain("request.jwt.claim.sub");
    expect(calls[1]).toContain("user-1");
    expect(calls[2]).toContain("request.jwt.claims");
    expect(calls[2]).toContain('"sub":"user-1"');
    expect(calls[3]).toBe("findMany");
  });
});

function membershipDb(
  memberships: Array<{ organizationId: string; role: "owner" | "admin" | "manager" | "staff" | "viewer"; createdAt: Date }>
) {
  return {
    organizationMember: {
      async findMany() {
        return memberships;
      }
    }
  };
}

function signHs256Token(claims: Record<string, unknown>): string {
  const header = toBase64Url(
    Buffer.from(
      JSON.stringify({
        alg: "HS256",
        typ: "JWT"
      })
    )
  );
  const payload = toBase64Url(Buffer.from(JSON.stringify(claims)));
  const body = `${header}.${payload}`;
  const signature = createHmac("sha256", jwtSecret).update(body).digest();

  return `${body}.${toBase64Url(signature)}`;
}

function toBase64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
