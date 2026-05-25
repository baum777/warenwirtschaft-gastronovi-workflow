import { config } from "dotenv";
import { z } from "zod";

config();

const developmentDatabaseUrl =
  "postgresql://user:password@localhost:5432/gastronovi_workflow_adapter";
const developmentRedisUrl = "redis://localhost:6379";

const emptyToUndefined = (value: unknown): unknown => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const integerEnv = (name: string, min: number, max: number, defaultValue: number) =>
  z.preprocess(
    (value) => (value === undefined ? String(defaultValue) : value),
    z
      .string()
      .trim()
      .regex(/^\d+$/, `${name} must be an integer`)
      .transform(Number)
      .refine((value) => value >= min && value <= max, {
        message: `${name} must be between ${min} and ${max}`
      })
  );

const booleanEnv = (name: string, defaultValue: boolean) =>
  z.preprocess(
    (value) => (value === undefined ? String(defaultValue) : value),
    z.enum(["true", "false"], {
      errorMap: () => ({
        message: `${name} must be "true" or "false"`
      })
    }).transform((value) => value === "true")
  );

const optionalNonEmptyString = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional()
);

const optionalUrl = z.preprocess(emptyToUndefined, z.string().trim().url().optional());

const rawEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: integerEnv("PORT", 1, 65535, 4000),
    DATABASE_URL: optionalNonEmptyString,
    REDIS_URL: optionalNonEmptyString,
    GASTRONOVI_API_BASE_URL: optionalUrl,
    GASTRONOVI_API_KEY: optionalNonEmptyString,
    GASTRONOVI_TENANT_ID: optionalNonEmptyString,
    SYNC_DEFAULT_LOOKBACK_DAYS: integerEnv("SYNC_DEFAULT_LOOKBACK_DAYS", 1, 365, 7),
    SYNC_ENABLE_SCHEDULED_JOBS: booleanEnv("SYNC_ENABLE_SCHEDULED_JOBS", false),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
  })
  .passthrough();

export type Env = {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  GASTRONOVI_API_BASE_URL?: string;
  GASTRONOVI_API_KEY?: string;
  GASTRONOVI_TENANT_ID?: string;
  SYNC_DEFAULT_LOOKBACK_DAYS: number;
  SYNC_ENABLE_SCHEDULED_JOBS: boolean;
  LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
};

export function parseEnv(input: NodeJS.ProcessEnv = process.env): Env {
  const parsed = rawEnvSchema.safeParse(input);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const data = parsed.data;

  if (data.NODE_ENV === "production") {
    const missing = [
      data.DATABASE_URL ? undefined : "DATABASE_URL",
      data.REDIS_URL ? undefined : "REDIS_URL"
    ].filter((value): value is string => Boolean(value));

    if (missing.length > 0) {
      throw new Error(
        `Invalid environment configuration: ${missing.join(" and ")} required in production`
      );
    }
  }

  return {
    NODE_ENV: data.NODE_ENV,
    PORT: data.PORT,
    DATABASE_URL: data.DATABASE_URL ?? developmentDatabaseUrl,
    REDIS_URL: data.REDIS_URL ?? developmentRedisUrl,
    GASTRONOVI_API_BASE_URL: data.GASTRONOVI_API_BASE_URL,
    GASTRONOVI_API_KEY: data.GASTRONOVI_API_KEY,
    GASTRONOVI_TENANT_ID: data.GASTRONOVI_TENANT_ID,
    SYNC_DEFAULT_LOOKBACK_DAYS: data.SYNC_DEFAULT_LOOKBACK_DAYS,
    SYNC_ENABLE_SCHEDULED_JOBS: data.SYNC_ENABLE_SCHEDULED_JOBS,
    LOG_LEVEL: data.LOG_LEVEL
  };
}
