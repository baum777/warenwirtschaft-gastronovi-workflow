import type { FastifyPluginAsync } from "fastify";

const serviceName = "gastronovi-workflow-adapter";

export type HealthRouteOptions = {
  now?: () => Date;
};

type HealthResponse = {
  status: "ok";
  service: typeof serviceName;
  timestamp: string;
};

export const healthRoute: FastifyPluginAsync<HealthRouteOptions> = async (app, options) => {
  const now = options.now ?? (() => new Date());

  app.get<{ Reply: HealthResponse }>("/health", async () => ({
    status: "ok",
    service: serviceName,
    timestamp: now().toISOString()
  }));
};
