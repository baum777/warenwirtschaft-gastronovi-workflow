import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  ActorAuthError,
  parseActorFromHeaders,
  requireActorRole,
  type Role
} from "../modules/auth/actor.js";
import {
  createCorrectionRequestSchema,
  createGoodsReceiptSchema,
  createInventoryItemSchema,
  createPurchaseOrderSchema,
  createWithdrawalSchema,
  updateInventoryItemSchema
} from "../modules/inventory/inventory.schemas.js";
import type { CorrectionServicePort } from "../modules/inventory/correction.service.js";
import type { GoodsReceiptServicePort } from "../modules/inventory/goods-receipt.service.js";
import type { InventoryItemServicePort } from "../modules/inventory/inventory-item.service.js";
import type { InventoryMasterDataServicePort } from "../modules/inventory/inventory-master-data.service.js";
import type { InventoryReadServicePort } from "../modules/inventory/inventory-read.service.js";
import type { PurchaseOrderServicePort } from "../modules/inventory/purchase-order.service.js";
import type { ReviewTaskServicePort } from "../modules/inventory/review-task.service.js";
import type { WithdrawalServicePort } from "../modules/inventory/withdrawal.service.js";

export type InventoryRouteDependencies = {
  purchaseOrderService: PurchaseOrderServicePort;
  inventoryItemService: InventoryItemServicePort;
  inventoryMasterDataService: InventoryMasterDataServicePort;
  goodsReceiptService: GoodsReceiptServicePort;
  withdrawalService: WithdrawalServicePort;
  correctionService: CorrectionServicePort;
  reviewTaskService: ReviewTaskServicePort;
  inventoryReadService: InventoryReadServicePort;
};

const adminOnlyRoles = ["admin"] as const satisfies readonly Role[];
const leadRoles = ["admin", "shift_lead"] as const satisfies readonly Role[];
const operationalRoles = ["admin", "shift_lead", "staff"] as const satisfies readonly Role[];

export async function inventoryRoute(
  app: FastifyInstance,
  dependencies: InventoryRouteDependencies
): Promise<void> {
  app.get("/inventory/master-data", async (request, reply) => {
    const actor = authenticate(request, reply, operationalRoles);

    if (!actor) {
      return reply;
    }

    return dependencies.inventoryMasterDataService.list();
  });

  app.get("/admin/inventory/stock", async (request, reply) => {
    const actor = authenticate(request, reply, operationalRoles);

    if (!actor) {
      return reply;
    }

    return {
      items: await dependencies.inventoryReadService.listStock()
    };
  });

  app.get("/admin/inventory/movements", async (request, reply) => {
    const actor = authenticate(request, reply, adminOnlyRoles);

    if (!actor) {
      return reply;
    }

    return {
      movements: await dependencies.inventoryReadService.listMovements()
    };
  });

  app.get("/admin/review-tasks", async (request, reply) => {
    const actor = authenticate(request, reply, adminOnlyRoles);

    if (!actor) {
      return reply;
    }

    return {
      tasks: await dependencies.inventoryReadService.listOpenReviewTasks()
    };
  });

  app.post("/admin/inventory/items", async (request, reply) => {
    const actor = authenticate(request, reply, adminOnlyRoles);

    if (!actor) {
      return reply;
    }

    const input = parseBody(createInventoryItemSchema.safeParse(request.body), reply);

    if (!input) {
      return reply;
    }

    const result = await dependencies.inventoryItemService.create(input);

    return reply.code(201).send(result);
  });

  app.get("/admin/inventory/items", async (request, reply) => {
    const actor = authenticate(request, reply, adminOnlyRoles);

    if (!actor) {
      return reply;
    }

    return {
      items: await dependencies.inventoryItemService.list()
    };
  });

  app.get("/admin/inventory/items/:id", async (request, reply) => {
    const actor = authenticate(request, reply, adminOnlyRoles);

    if (!actor) {
      return reply;
    }

    const params = request.params as { id?: string };

    if (!params.id) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "inventory item id is required"
      });
    }

    return dependencies.inventoryItemService.get(params.id);
  });

  app.patch("/admin/inventory/items/:id", async (request, reply) => {
    const actor = authenticate(request, reply, adminOnlyRoles);

    if (!actor) {
      return reply;
    }

    const params = request.params as { id?: string };

    if (!params.id) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "inventory item id is required"
      });
    }

    const input = parseBody(updateInventoryItemSchema.safeParse(request.body), reply);

    if (!input) {
      return reply;
    }

    return dependencies.inventoryItemService.update(params.id, input);
  });

  app.post("/admin/inventory/items/:id/deactivate", async (request, reply) => {
    const actor = authenticate(request, reply, adminOnlyRoles);

    if (!actor) {
      return reply;
    }

    const params = request.params as { id?: string };

    if (!params.id) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "inventory item id is required"
      });
    }

    return dependencies.inventoryItemService.deactivate(params.id);
  });

  app.post("/admin/purchase-orders", async (request, reply) => {
    const actor = authenticate(request, reply, leadRoles);

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
    const actor = authenticate(request, reply, ["admin", "shift_lead"]);

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

  app.post("/admin/purchase-orders/:id/cancel", async (request, reply) => {
    const actor = authenticate(request, reply, ["admin", "shift_lead"]);

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

    return dependencies.purchaseOrderService.cancel(params.id, actor.userId);
  });

  app.get("/admin/purchase-orders", async (request, reply) => {
    const actor = authenticate(request, reply, leadRoles);

    if (!actor) {
      return reply;
    }

    return {
      purchaseOrders: await dependencies.purchaseOrderService.list()
    };
  });

  app.get("/admin/purchase-orders/:id", async (request, reply) => {
    const actor = authenticate(request, reply, leadRoles);

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
    const actor = authenticate(request, reply, leadRoles);

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
    const actor = authenticate(request, reply, leadRoles);

    if (!actor) {
      return reply;
    }

    return {
      goodsReceipts: await dependencies.goodsReceiptService.list()
    };
  });

  app.get("/goods-receipts/:id", async (request, reply) => {
    const actor = authenticate(request, reply, leadRoles);

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

  app.post("/withdrawals", async (request, reply) => {
    const actor = authenticate(request, reply, operationalRoles);

    if (!actor) {
      return reply;
    }

    const input = parseBody(createWithdrawalSchema.safeParse(request.body), reply);

    if (!input) {
      return reply;
    }

    const result = await dependencies.withdrawalService.create(input, actor);

    return reply.code(201).send(result);
  });

  app.post("/correction-requests", async (request, reply) => {
    const actor = authenticate(request, reply, operationalRoles);

    if (!actor) {
      return reply;
    }

    const input = parseBody(createCorrectionRequestSchema.safeParse(request.body), reply);

    if (!input) {
      return reply;
    }

    const result = await dependencies.correctionService.createRequest(input, actor);

    return reply.code(201).send(result);
  });

  app.post("/admin/correction-requests/:id/approve", async (request, reply) => {
    const actor = authenticate(request, reply, adminOnlyRoles);

    if (!actor) {
      return reply;
    }

    const params = request.params as { id?: string };

    if (!params.id) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "correction request id is required"
      });
    }

    return dependencies.correctionService.approve(params.id, actor);
  });

  app.post("/admin/correction-requests/:id/reject", async (request, reply) => {
    const actor = authenticate(request, reply, adminOnlyRoles);

    if (!actor) {
      return reply;
    }

    const params = request.params as { id?: string };

    if (!params.id) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "correction request id is required"
      });
    }

    return dependencies.correctionService.reject(params.id, actor);
  });

  app.post("/admin/review-tasks/:id/start-review", async (request, reply) => {
    const actor = authenticate(request, reply, adminOnlyRoles);

    if (!actor) {
      return reply;
    }

    const params = request.params as { id?: string };

    if (!params.id) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "review task id is required"
      });
    }

    return dependencies.reviewTaskService.startReview(params.id, actor);
  });

  app.post("/admin/review-tasks/:id/resolve", async (request, reply) => {
    const actor = authenticate(request, reply, adminOnlyRoles);

    if (!actor) {
      return reply;
    }

    const params = request.params as { id?: string };

    if (!params.id) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "review task id is required"
      });
    }

    return dependencies.reviewTaskService.resolve(params.id, actor);
  });

  app.post("/admin/review-tasks/:id/dismiss", async (request, reply) => {
    const actor = authenticate(request, reply, adminOnlyRoles);

    if (!actor) {
      return reply;
    }

    const params = request.params as { id?: string };

    if (!params.id) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "review task id is required"
      });
    }

    return dependencies.reviewTaskService.dismiss(params.id, actor);
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
