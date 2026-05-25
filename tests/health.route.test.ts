import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

describe("GET /health", () => {
  it("returns service health with a timestamp", async () => {
    const app = buildApp({
      now: () => new Date("2026-05-25T17:00:00.000Z")
    });

    try {
      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: "/health"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: "ok",
        service: "gastronovi-workflow-adapter",
        timestamp: "2026-05-25T17:00:00.000Z"
      });
    } finally {
      await app.close();
    }
  });
});
