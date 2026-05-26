import type { IncomingMessage, ServerResponse } from "node:http";

import { buildApp } from "../src/app.js";
import { parseEnv } from "../src/config/env.js";

const env = parseEnv(process.env);
const app = buildApp({
  logger: {
    level: env.LOG_LEVEL
  }
});

const appReady = app.ready();

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  await appReady;
  app.server.emit("request", req, res);
}
