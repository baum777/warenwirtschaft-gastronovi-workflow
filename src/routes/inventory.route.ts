import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  InMemoryInventoryRepository,
  seedInventoryState,
  type InventoryRepositoryPort
} from "../modules/inventory/in-memory-inventory.repository.js";
import { InventoryMovementService } from "../modules/inventory/inventory-movement.service.js";
import {
  movementRequestTypes,
  userRoles,
  workspaceCodes
} from "../modules/inventory/inventory.types.js";

export type InventoryRouteOptions = {
  inventoryRepository?: InventoryRepositoryPort;
};

const actorHeadersSchema = z.object({
  "x-actor-id": z.string().trim().min(1),
  "x-actor-role": z.enum(userRoles)
});

const movementRequestSchema = z.object({
  type: z.enum(movementRequestTypes),
  inventoryItemId: z.string().trim().min(1),
  workspace: z.enum(workspaceCodes),
  quantity: z.number().positive(),
  unit: z.string().trim().min(1),
  baseStockVersion: z.number().int().nonnegative().optional(),
  clientMutationId: z.string().trim().min(1),
  note: z.string().trim().max(500).optional()
});

const syncRequestSchema = z.object({
  items: z.array(movementRequestSchema).min(1).max(100)
});

const listItemsQuerySchema = z.object({
  workspace: z.enum(workspaceCodes).optional(),
  category: z.string().trim().min(1).optional(),
  subcategory: z.string().trim().min(1).optional()
});

export async function inventoryRoute(
  app: FastifyInstance,
  options: InventoryRouteOptions = {}
): Promise<void> {
  const repository =
    options.inventoryRepository ?? new InMemoryInventoryRepository(seedInventoryState());
  const service = new InventoryMovementService({ repository });

  app.get("/inventory/items", async (request, reply) => {
    const actor = parseActorHeaders(request.headers);
    const query = listItemsQuerySchema.parse(request.query);
    const result = await service.listReadableItems({
      actorId: actor["x-actor-id"],
      actorRole: actor["x-actor-role"],
      ...query
    });

    if (result.status === "REJECTED") {
      return reply.code(403).send({
        error: result.reason
      });
    }

    return reply.send({
      items: result.items
    });
  });

  app.post("/movements", async (request, reply) => {
    const actor = parseActorHeaders(request.headers);
    const body = movementRequestSchema.parse(request.body);
    const result = await service.createMovement({
      actorId: actor["x-actor-id"],
      actorRole: actor["x-actor-role"],
      ...body
    });

    if (result.status === "ACCEPTED") {
      return reply.code(201).send(result);
    }

    if (result.status === "CONFLICT") {
      return reply.code(409).send(result);
    }

    return reply.code(403).send(result);
  });

  app.post("/movements/sync", async (request, reply) => {
    const actor = parseActorHeaders(request.headers);
    const body = syncRequestSchema.parse(request.body);
    const result = await service.syncMovements({
      actorId: actor["x-actor-id"],
      actorRole: actor["x-actor-role"],
      items: body.items
    });

    return reply.send(result);
  });
}

function parseActorHeaders(headers: unknown): z.infer<typeof actorHeadersSchema> {
  return actorHeadersSchema.parse(headers);
}
