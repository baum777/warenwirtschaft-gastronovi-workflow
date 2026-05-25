import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  ActorAuthError,
  parseActorFromHeaders,
  requireActorRole,
  type Role
} from "../modules/auth/actor.js";
import {
  createGoodsReceiptSchema,
  createPurchaseOrderSchema
} from "../modules/inventory/inventory.schemas.js";
import type { GoodsReceiptServicePort } from "../modules/inventory/goods-receipt.service.js";
import type { InventoryReadServicePort } from "../modules/inventory/inventory-read.service.js";
import type { PurchaseOrderServicePort } from "../modules/inventory/purchase-order.service.js";

export type InventoryRouteDependencies = {
  purchaseOrderService: PurchaseOrderServicePort;
  goodsReceiptService: GoodsReceiptServicePort;
  inventoryReadService: InventoryReadServicePort;
};

export async function inventoryRoute(
  app: FastifyInstance,
  dependencies: InventoryRouteDependencies
): Promise<void> {
  app.get("/admin/inventory/stock", async (request, reply) => {
    const actor = authenticate(request, reply, ["admin"]);

    if (!actor) {
      return reply;
    }

    return {
      items: await dependencies.inventoryReadService.listStock()
    };
  });

  app.get("/admin/inventory/movements", async (request, reply) => {
    const actor = authenticate(request, reply, ["admin"]);

    if (!actor) {
      return reply;
    }

    return {
      movements: await dependencies.inventoryReadService.listMovements()
    };
  });

  app.get("/admin/review-tasks", async (request, reply) => {
    const actor = authenticate(request, reply, ["admin"]);

    if (!actor) {
      return reply;
    }

    return {
      tasks: await dependencies.inventoryReadService.listOpenReviewTasks()
    };
  });

  app.post("/admin/purchase-orders", async (request, reply) => {
    const actor = authenticate(request, reply, ["admin"]);

    if (!actor) {
      return reply;
    }

    const input = parseBody(createPurchaseOrderSchema.safeParse(request.body), reply);

    if (!input) {
      return reply;
    }

    const result = await dependencies.purchaseOrderService.create(input, actor.userId);

    return reply.code(201).send(result);
  });

  app.post("/admin/purchase-orders/:id/mark-ordered", async (request, reply) => {
    const actor = authenticate(request, reply, ["admin"]);

    if (!actor) {
      return reply;
    }

    const params = request.params as { id?: string };

    if (!params.id) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "purchase order id is required"
      });
    }

    return dependencies.purchaseOrderService.markOrdered(params.id, actor.userId);
  });

  app.get("/admin/purchase-orders", async (request, reply) => {
    const actor = authenticate(request, reply, ["admin"]);

    if (!actor) {
      return reply;
    }

    return {
      purchaseOrders: await dependencies.purchaseOrderService.list()
    };
  });

  app.get("/admin/purchase-orders/:id", async (request, reply) => {
    const actor = authenticate(request, reply, ["admin"]);

    if (!actor) {
      return reply;
    }

    const params = request.params as { id?: string };

    if (!params.id) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "purchase order id is required"
      });
    }

    return dependencies.purchaseOrderService.get(params.id);
  });

  app.post("/goods-receipts", async (request, reply) => {
    const actor = authenticate(request, reply, ["admin", "shift_lead", "staff"]);

    if (!actor) {
      return reply;
    }

    const input = parseBody(createGoodsReceiptSchema.safeParse(request.body), reply);

    if (!input) {
      return reply;
    }

    const result = await dependencies.goodsReceiptService.create(input, actor);

    return reply.code(201).send(result);
  });

  app.get("/goods-receipts", async (request, reply) => {
    const actor = authenticate(request, reply, ["admin", "shift_lead", "staff"]);

    if (!actor) {
      return reply;
    }

    return {
      goodsReceipts: await dependencies.goodsReceiptService.list()
    };
  });

  app.get("/goods-receipts/:id", async (request, reply) => {
    const actor = authenticate(request, reply, ["admin", "shift_lead", "staff"]);

    if (!actor) {
      return reply;
    }

    const params = request.params as { id?: string };

    if (!params.id) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "goods receipt id is required"
      });
    }

    return dependencies.goodsReceiptService.get(params.id);
  });
}

function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
  allowedRoles: readonly Role[]
) {
  try {
    const actor = parseActorFromHeaders(request.headers);

    return requireActorRole(actor, allowedRoles);
  } catch (error) {
    if (error instanceof ActorAuthError) {
      reply.code(error.statusCode).send({
        error: error.statusCode === 401 ? "Unauthorized" : "Forbidden",
        message: error.message
      });
      return undefined;
    }

    throw error;
  }
}

function parseBody<T>(
  result: { success: true; data: T } | { success: false; error: { issues: unknown[] } },
  reply: FastifyReply
): T | undefined {
  if (result.success) {
    return result.data;
  }

  reply.code(400).send({
    error: "Bad Request",
    message: "request body validation failed",
    issues: result.error.issues
  });

  return undefined;
}
