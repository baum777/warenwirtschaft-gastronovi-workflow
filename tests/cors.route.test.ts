import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

describe("CORS preflight", () => {
  it("allows the local web app to call protected inventory routes", async () => {
    const app = buildApp();

    try {
      await app.ready();

      const response = await app.inject({
        method: "OPTIONS",
        url: "/admin/inventory/items",
        headers: {
          origin: "http://127.0.0.1:4173",
          "access-control-request-method": "GET",
          "access-control-request-headers": "content-type,x-actor-id,x-actor-role"
        }
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:4173");
      expect(response.headers["access-control-allow-methods"]).toContain("GET");
      expect(response.headers["access-control-allow-headers"]).toContain("x-actor-id");
      expect(response.body).toBe("");
    } finally {
      await app.close();
    }
  });
});
