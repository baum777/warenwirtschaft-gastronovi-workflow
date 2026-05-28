import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

describe("GET /app-context", () => {
  it("returns public app context without actor headers", async () => {
    const app = buildApp({
      env: {
        NODE_ENV: "production",
        DEMO_MODE: false
      }
    });

    try {
      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: "/app-context"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        demoMode: false,
        devPanelEnabled: false,
        defaultActor: {
          userId: "demo-admin",
          role: "admin"
        }
      });
    } finally {
      await app.close();
    }
  });
});
