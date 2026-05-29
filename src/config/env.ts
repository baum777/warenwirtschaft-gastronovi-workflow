import { config } from "dotenv";
import { z } from "zod";

config();

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
const authModeSchema = z.enum(["demo_headers", "supabase"]).default("demo_headers");
const registrationModeSchema = z.enum(["open", "invite_only", "first_admin"]).default("first_admin");

const rawEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: integerEnv("PORT", 1, 65535, 4000),
    DATABASE_URL: optionalNonEmptyString,
    DIRECT_URL: optionalNonEmptyString,
    REDIS_URL: optionalNonEmptyString,
    UPSTASH_REDIS_REST_URL: optionalUrl,
    UPSTASH_REDIS_REST_TOKEN: optionalNonEmptyString,
    GASTRONOVI_API_BASE_URL: optionalUrl,
    GASTRONOVI_API_KEY: optionalNonEmptyString,
    GASTRONOVI_TENANT_ID: optionalNonEmptyString,
    SYNC_DEFAULT_LOOKBACK_DAYS: integerEnv("SYNC_DEFAULT_LOOKBACK_DAYS", 1, 365, 7),
    SYNC_ENABLE_SCHEDULED_JOBS: booleanEnv("SYNC_ENABLE_SCHEDULED_JOBS", false),
    AUTH_MODE: authModeSchema,
    REGISTRATION_MODE: registrationModeSchema,
    SUPABASE_URL: optionalUrl,
    SUPABASE_PUBLISHABLE_KEY: optionalNonEmptyString,
    DEMO_MODE: booleanEnv("DEMO_MODE", false),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
  })
  .passthrough();

export type Env = {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;
  DATABASE_URL: string;
  DIRECT_URL: string;
  REDIS_URL?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  GASTRONOVI_API_BASE_URL?: string;
  GASTRONOVI_API_KEY?: string;
  GASTRONOVI_TENANT_ID?: string;
  SYNC_DEFAULT_LOOKBACK_DAYS: number;
  SYNC_ENABLE_SCHEDULED_JOBS: boolean;
  AUTH_MODE: "demo_headers" | "supabase";
  REGISTRATION_MODE: "open" | "invite_only" | "first_admin";
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  DEMO_MODE: boolean;
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
  const hasProductionRedis =
    Boolean(data.REDIS_URL) ||
    Boolean(data.UPSTASH_REDIS_REST_URL && data.UPSTASH_REDIS_REST_TOKEN);
  const redisUrl = data.REDIS_URL ?? (data.NODE_ENV === "production" ? undefined : developmentRedisUrl);

  const missingRequiredValues = [
    data.DATABASE_URL ? undefined : "DATABASE_URL",
    data.DIRECT_URL ? undefined : "DIRECT_URL",
    data.NODE_ENV === "production" && !hasProductionRedis ? "REDIS_URL or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN" : undefined,
    data.AUTH_MODE === "supabase" && !data.SUPABASE_URL ? "SUPABASE_URL" : undefined,
    data.AUTH_MODE === "supabase" && !data.SUPABASE_PUBLISHABLE_KEY ? "SUPABASE_PUBLISHABLE_KEY" : undefined
  ].filter((value): value is string => Boolean(value));

  if (missingRequiredValues.length > 0) {
    throw new Error(
      `Invalid environment configuration: ${missingRequiredValues.join(
        " and "
      )} required`
    );
  }

  const env = {
    NODE_ENV: data.NODE_ENV,
    PORT: data.PORT,
    DATABASE_URL: data.DATABASE_URL!,
    DIRECT_URL: data.DIRECT_URL!,
    REDIS_URL: redisUrl,
    UPSTASH_REDIS_REST_URL: data.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: data.UPSTASH_REDIS_REST_TOKEN,
    GASTRONOVI_API_BASE_URL: data.GASTRONOVI_API_BASE_URL,
    GASTRONOVI_API_KEY: data.GASTRONOVI_API_KEY,
    GASTRONOVI_TENANT_ID: data.GASTRONOVI_TENANT_ID,
    SYNC_DEFAULT_LOOKBACK_DAYS: data.SYNC_DEFAULT_LOOKBACK_DAYS,
    SYNC_ENABLE_SCHEDULED_JOBS: data.SYNC_ENABLE_SCHEDULED_JOBS,
    AUTH_MODE: data.AUTH_MODE,
    REGISTRATION_MODE: data.REGISTRATION_MODE,
    SUPABASE_URL: data.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: data.SUPABASE_PUBLISHABLE_KEY,
    DEMO_MODE: data.DEMO_MODE,
    LOG_LEVEL: data.LOG_LEVEL
  };

  if (input === process.env) {
    process.env.DATABASE_URL ??= env.DATABASE_URL;
    process.env.DIRECT_URL ??= env.DIRECT_URL;
    if (env.REDIS_URL) {
      process.env.REDIS_URL ??= env.REDIS_URL;
    }
    if (env.UPSTASH_REDIS_REST_URL) {
      process.env.UPSTASH_REDIS_REST_URL ??= env.UPSTASH_REDIS_REST_URL;
    }
    if (env.UPSTASH_REDIS_REST_TOKEN) {
      process.env.UPSTASH_REDIS_REST_TOKEN ??= env.UPSTASH_REDIS_REST_TOKEN;
    }
  }

  return env;
}
