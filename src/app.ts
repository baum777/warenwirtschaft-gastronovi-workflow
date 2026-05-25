import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import { healthRoute } from "./routes/health.route.js";

export type AppOptions = {
  logger?: FastifyServerOptions["logger"];
  now?: () => Date;
};

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false
  });

  app.register(healthRoute, {
    now: options.now
  });

  return app;
}
