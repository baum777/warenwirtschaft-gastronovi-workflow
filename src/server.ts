import { buildApp } from "./app.js";
import { parseEnv } from "./config/env.js";

const env = parseEnv();
const app = buildApp({
  env,
  logger: {
    level: env.LOG_LEVEL
  }
});

async function start(): Promise<void> {
  try {
    await app.listen({
      host: "0.0.0.0",
      port: env.PORT
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
