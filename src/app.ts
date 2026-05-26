import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import type { InventoryRepositoryPort } from "./modules/inventory/in-memory-inventory.repository.js";
import { healthRoute } from "./routes/health.route.js";
import { inventoryRoute } from "./routes/inventory.route.js";

export type AppOptions = {
  logger?: FastifyServerOptions["logger"];
  now?: () => Date;
  inventoryRepository?: InventoryRepositoryPort;
};

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false
  });

  app.register(healthRoute, {
    now: options.now
  });
  app.register(inventoryRoute, {
    inventoryRepository: options.inventoryRepository
  });

  return app;
}
