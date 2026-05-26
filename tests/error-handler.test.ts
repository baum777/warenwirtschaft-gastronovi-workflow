import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

describe("unexpected errors", () => {
  it("does not leak raw internal error messages in 500 responses", async () => {
    const app = buildApp();

    app.get("/boom", async () => {
      throw new Error("database credentials for user are not valid");
    });

    try {
      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: "/boom"
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: "Internal Server Error",
        message: "internal server error"
      });
    } finally {
      await app.close();
    }
  });
});
