import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import { prisma } from "./lib/prisma.js";
import {
  CorrectionService,
  type CorrectionDatabaseClient
} from "./modules/inventory/correction.service.js";
import {
  DemoSeedService,
  type DemoSeedDatabaseClient,
  type DemoSeedServicePort
} from "./modules/inventory/demo-seed.service.js";
import {
  GoodsReceiptService,
  type GoodsReceiptDatabaseClient
} from "./modules/inventory/goods-receipt.service.js";
import {
  InventoryCsvService,
  type InventoryCsvDatabaseClient
} from "./modules/inventory/inventory-csv.service.js";
import {
  InventoryItemService,
  type InventoryItemDatabaseClient
} from "./modules/inventory/inventory-item.service.js";
import {
  InventoryMasterDataService,
  type InventoryMasterDataDatabaseClient
} from "./modules/inventory/inventory-master-data.service.js";
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
import { SupabaseAuthService } from "./modules/auth/supabase-auth.service.js";
import {
  ProfileService,
  type ProfileDatabaseClient,
  type ProfileServicePort
} from "./modules/profile/profile.service.js";
import {
  WithdrawalService,
  type WithdrawalDatabaseClient
} from "./modules/inventory/withdrawal.service.js";
import {
  actorDependenciesFromAuthRoute,
  authRoute,
  type AuthRouteDependencies
} from "./routes/auth.route.js";
import { healthRoute } from "./routes/health.route.js";
import { inventoryRoute, type InventoryRouteDependencies } from "./routes/inventory.route.js";
import { profileRoute } from "./routes/profile.route.js";
import type { Env } from "./config/env.js";
import { resolveActorFromRequest } from "./modules/auth/actor.js";

const localWebAppOriginPattern = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/;
const allowedCorsMethods = "GET,POST,PATCH,OPTIONS";
const allowedCorsHeaders = "authorization,content-type,x-actor-id,x-actor-role";

type ErrorWithStatusCode = Error & {
  statusCode?: number;
};

export type AppOptions = {
  logger?: FastifyServerOptions["logger"];
  now?: () => Date;
  inventory?: InventoryRouteDependencies;
  env?: Partial<
    Pick<
      Env,
      | "NODE_ENV"
      | "DEMO_MODE"
      | "AUTH_MODE"
      | "REGISTRATION_MODE"
      | "SUPABASE_URL"
      | "SUPABASE_PUBLISHABLE_KEY"
    >
  >;
  auth?: Partial<AuthRouteDependencies>;
  demoSeedService?: DemoSeedServicePort;
};

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false
  });

  const env = runtimeContext(options);
  const authDependencies = buildAuthDependencies(options, env);

  registerUnexpectedErrorHandler(app);
  registerLocalCors(app);
  registerAppContext(app, env, authDependencies);
  registerDemoSeed(app, options);

  app.register(authRoute, authDependencies);
  app.register(profileRoute, {
    actorAuth: actorDependenciesFromAuthRoute(authDependencies),
    profileService: authDependencies.profileService
  });
  app.register(healthRoute, {
    now: options.now
  });
  app.register(inventoryRoute, {
    ...(options.inventory ?? buildInventoryDependencies(options)),
    actorAuth: actorDependenciesFromAuthRoute(authDependencies)
  });

  return app;
}

type RuntimeContext = Pick<
  Env,
  | "NODE_ENV"
  | "DEMO_MODE"
  | "AUTH_MODE"
  | "REGISTRATION_MODE"
  | "SUPABASE_URL"
  | "SUPABASE_PUBLISHABLE_KEY"
>;

function runtimeContext(options: AppOptions): RuntimeContext {
  return {
    NODE_ENV: options.env?.NODE_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development"),
    DEMO_MODE: options.env?.DEMO_MODE ?? process.env.DEMO_MODE === "true",
    AUTH_MODE:
      options.env?.AUTH_MODE ??
      (process.env.AUTH_MODE === "supabase" ? "supabase" : "demo_headers"),
    REGISTRATION_MODE:
      options.env?.REGISTRATION_MODE === "open" || options.env?.REGISTRATION_MODE === "invite_only"
        ? options.env.REGISTRATION_MODE
        : process.env.REGISTRATION_MODE === "open" || process.env.REGISTRATION_MODE === "invite_only"
          ? process.env.REGISTRATION_MODE
          : "first_admin",
    SUPABASE_URL: options.env?.SUPABASE_URL ?? process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY:
      options.env?.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY
  };
}

function registerAppContext(
  app: FastifyInstance,
  env: RuntimeContext,
  authDependencies: AuthRouteDependencies
): void {
  app.get("/app-context", async (request) => {
    const baseContext = {
      authMode: env.AUTH_MODE,
      demoMode: env.DEMO_MODE,
      devPanelEnabled: env.AUTH_MODE === "demo_headers" && (env.NODE_ENV !== "production" || env.DEMO_MODE)
    };

    if (env.AUTH_MODE === "supabase") {
      try {
        const actor = await resolveActorFromRequest(
          request,
          actorDependenciesFromAuthRoute(authDependencies)
        );

        return {
          ...baseContext,
          defaultActor: {
            userId: actor.userId,
            role: actor.role
          }
        };
      } catch {
        return {
          ...baseContext,
          defaultActor: null
        };
      }
    }

    return {
      ...baseContext,
      defaultActor: {
        userId: "demo-admin",
        role: "admin"
      }
    };
  });
}

function registerDemoSeed(app: FastifyInstance, options: AppOptions): void {
  const env = runtimeContext(options);

  if (!env.DEMO_MODE) {
    return;
  }

  const demoSeedService =
    options.demoSeedService ??
    new DemoSeedService({
      db: prisma as unknown as DemoSeedDatabaseClient,
      now: options.now
    });

  app.addHook("onReady", async () => {
    await demoSeedService.ensure();
  });
}

function buildAuthDependencies(
  options: AppOptions,
  env: RuntimeContext
): AuthRouteDependencies {
  const profileService =
    options.auth?.profileService ??
    new ProfileService({
      db: prisma as unknown as ProfileDatabaseClient,
      registrationMode: env.REGISTRATION_MODE
    });
  const supabaseAuthService =
    options.auth?.supabaseAuthService ??
    (env.AUTH_MODE === "supabase" && env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY
      ? new SupabaseAuthService({
          supabaseUrl: env.SUPABASE_URL,
          publishableKey: env.SUPABASE_PUBLISHABLE_KEY
        })
      : undefined);

  return {
    authMode: env.AUTH_MODE,
    registrationMode: env.REGISTRATION_MODE,
    supabaseUrl: env.SUPABASE_URL,
    supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY,
    supabaseAuthService,
    profileService: profileService as ProfileServicePort
  };
}

function registerUnexpectedErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: ErrorWithStatusCode, _request, reply) => {
    const rawStatusCode = error.statusCode;
    const statusCode =
      typeof rawStatusCode === "number" && Number.isInteger(rawStatusCode) ? rawStatusCode : 500;

    if (statusCode >= 500) {
      reply.code(500).send({
        error: "Internal Server Error",
        message: "internal server error"
      });
      return;
    }

    reply.code(statusCode).send({
      error: error.name || "Error",
      message: error.message
    });
  });
}

function registerLocalCors(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;

    if (typeof origin === "string" && localWebAppOriginPattern.test(origin)) {
      reply.header("access-control-allow-origin", origin);
      reply.header("vary", "origin");
      reply.header("access-control-allow-methods", allowedCorsMethods);
      reply.header("access-control-allow-headers", allowedCorsHeaders);
    }

    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }

    return undefined;
  });
}

function buildInventoryDependencies(options: AppOptions): InventoryRouteDependencies {
  const inventoryReadService = new InventoryReadService(
    prisma as unknown as InventoryReadDatabaseClient
  );

  return {
    purchaseOrderService: new PurchaseOrderService({
      db: prisma as unknown as PurchaseOrderDatabaseClient,
      now: options.now
    }),
    inventoryItemService: new InventoryItemService({
      db: prisma as unknown as InventoryItemDatabaseClient
    }),
    inventoryMasterDataService: new InventoryMasterDataService({
      db: prisma as unknown as InventoryMasterDataDatabaseClient,
      inventoryReadService
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
    inventoryReadService,
    inventoryCsvService: new InventoryCsvService({
      db: prisma as unknown as InventoryCsvDatabaseClient,
      now: options.now
    })
  };
}
