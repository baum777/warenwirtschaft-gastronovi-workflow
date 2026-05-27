import { describe, expect, it } from "vitest";

import { parseEnv } from "../src/config/env.js";

const exampleEnv = {
  NODE_ENV: "development",
  PORT: "4000",
  DATABASE_URL:
    "postgresql://prisma.project-ref:replace_me@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=require",
  DIRECT_URL:
    "postgresql://postgres:replace_me@db.project-ref.supabase.co:5432/postgres?sslmode=require",
  REDIS_URL: "redis://localhost:6379",
  GASTRONOVI_API_BASE_URL: "",
  GASTRONOVI_API_KEY: "",
  GASTRONOVI_TENANT_ID: "",
  SYNC_DEFAULT_LOOKBACK_DAYS: "7",
  SYNC_ENABLE_SCHEDULED_JOBS: "false",
  LOG_LEVEL: "info"
};

describe("parseEnv", () => {
  it("accepts the .env.example development configuration", () => {
    expect(parseEnv(exampleEnv)).toEqual({
      NODE_ENV: "development",
      PORT: 4000,
      DATABASE_URL:
        "postgresql://prisma.project-ref:replace_me@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=require",
      DIRECT_URL:
        "postgresql://postgres:replace_me@db.project-ref.supabase.co:5432/postgres?sslmode=require",
      REDIS_URL: "redis://localhost:6379",
      GASTRONOVI_API_BASE_URL: undefined,
      GASTRONOVI_API_KEY: undefined,
      GASTRONOVI_TENANT_ID: undefined,
      SYNC_DEFAULT_LOOKBACK_DAYS: 7,
      SYNC_ENABLE_SCHEDULED_JOBS: false,
      LOG_LEVEL: "info"
    });
  });

  it("rejects an invalid port", () => {
    expect(() => parseEnv({ ...exampleEnv, PORT: "70000" })).toThrow(/PORT/);
  });

  it("rejects an invalid sync lookback window", () => {
    expect(() => parseEnv({ ...exampleEnv, SYNC_DEFAULT_LOOKBACK_DAYS: "0" })).toThrow(
      /SYNC_DEFAULT_LOOKBACK_DAYS/
    );
  });

  it("rejects non-boolean scheduled job values", () => {
    expect(() => parseEnv({ ...exampleEnv, SYNC_ENABLE_SCHEDULED_JOBS: "yes" })).toThrow(
      /SYNC_ENABLE_SCHEDULED_JOBS/
    );
  });

  it("requires database and redis URLs in production", () => {
    expect(() =>
      parseEnv({
        ...exampleEnv,
        NODE_ENV: "production",
        DATABASE_URL: "",
        DIRECT_URL: "",
        REDIS_URL: ""
      })
    ).toThrow(/DATABASE_URL.*DIRECT_URL.*REDIS_URL/);
  });

  it("requires database urls in development", () => {
    expect(() =>
      parseEnv({
        ...exampleEnv,
        DATABASE_URL: "",
        DIRECT_URL: ""
      })
    ).toThrow(/DATABASE_URL.*DIRECT_URL/);
  });

  it("syncs explicit database urls into process.env for runtime clients", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousDirectUrl = process.env.DIRECT_URL;
    const previousRedisUrl = process.env.REDIS_URL;

    try {
      process.env.NODE_ENV = "development";
      process.env.DATABASE_URL = exampleEnv.DATABASE_URL;
      process.env.DIRECT_URL = exampleEnv.DIRECT_URL;
      delete process.env.REDIS_URL;

      const env = parseEnv();

      expect(process.env.DATABASE_URL).toBe(env.DATABASE_URL);
      expect(process.env.DIRECT_URL).toBe(env.DIRECT_URL);
      expect(process.env.REDIS_URL).toBe(env.REDIS_URL);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }

      if (previousDirectUrl === undefined) {
        delete process.env.DIRECT_URL;
      } else {
        process.env.DIRECT_URL = previousDirectUrl;
      }

      if (previousRedisUrl === undefined) {
        delete process.env.REDIS_URL;
      } else {
        process.env.REDIS_URL = previousRedisUrl;
      }
    }
  });
});
