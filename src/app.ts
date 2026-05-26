import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import { prisma } from "./lib/prisma.js";
import {
  CorrectionService,
  type CorrectionDatabaseClient
} from "./modules/inventory/correction.service.js";
import {
  GoodsReceiptService,
  type GoodsReceiptDatabaseClient
} from "./modules/inventory/goods-receipt.service.js";
import {
  InventoryReadService,
  type InventoryReadDatabaseClient
} from "./modules/inventory/inventory-read.service.js";
import {
  PurchaseOrderService,
  type PurchaseOrderDatabaseClient
} from "./modules/inventory/purchase-order.service.js";
import {
  ReviewTaskService,
  type ReviewTaskDatabaseClient
} from "./modules/inventory/review-task.service.js";
import {
  WithdrawalService,
  type WithdrawalDatabaseClient
} from "./modules/inventory/withdrawal.service.js";
import { healthRoute } from "./routes/health.route.js";
import { inventoryRoute, type InventoryRouteDependencies } from "./routes/inventory.route.js";

export type AppOptions = {
  logger?: FastifyServerOptions["logger"];
  now?: () => Date;
  inventory?: InventoryRouteDependencies;
};

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false
  });

  app.register(healthRoute, {
    now: options.now
  });
  app.register(inventoryRoute, options.inventory ?? buildInventoryDependencies(options));

  return app;
}

function buildInventoryDependencies(options: AppOptions): InventoryRouteDependencies {
  return {
    purchaseOrderService: new PurchaseOrderService({
      db: prisma as unknown as PurchaseOrderDatabaseClient,
      now: options.now
    }),
    goodsReceiptService: new GoodsReceiptService({
      db: prisma as unknown as GoodsReceiptDatabaseClient,
      now: options.now
    }),
    withdrawalService: new WithdrawalService({
      db: prisma as unknown as WithdrawalDatabaseClient,
      now: options.now
    }),
    correctionService: new CorrectionService({
      db: prisma as unknown as CorrectionDatabaseClient,
      now: options.now
    }),
    reviewTaskService: new ReviewTaskService({
      db: prisma as unknown as ReviewTaskDatabaseClient
    }),
    inventoryReadService: new InventoryReadService(prisma as unknown as InventoryReadDatabaseClient)
  };
}
