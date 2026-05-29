import { randomUUID } from "node:crypto";
import { inspect } from "node:util";

import type { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import type { FastifyInstance } from "fastify";

/**
 * Inventory API live-prod baseline smoke test.
 *
 * Strategy: this repo's route tests use Fastify's in-process `app.inject()`
 * against `buildApp()`, and `supertest` is not installed. This smoke test
 * follows that local convention instead of calling an externally running server.
 *
 * Safety model for live/prod database use:
 * - only creates InventoryItem rows whose names start with `codex-smoke-*`;
 * - exercises the public inventory API flow, not direct writes;
 * - never calls global reset endpoints;
 * - removes only scoped smoke rows and direct dependencies before exit;
 * - fails the baseline gate if cleanup leaves smoke inventory items visible.
 */

const smokePrefix = "codex-smoke-";
const receiptQuantity = 3;
const withdrawalQuantity = 1;
const expectedStockAfterReceipt = receiptQuantity;
const expectedStockAfterWithdrawal = receiptQuantity - withdrawalQuantity;
const smokeTarget = process.env.SMOKE_TARGET?.trim() || "configured-db";
const isLiveProdBaseline = smokeTarget === "live-prod" || process.env.LIVE_PROD_BASELINE === "true";
const runtimeNodeEnv = normalizeNodeEnv(process.env.NODE_ENV);
const adminHeaders = {
  "x-actor-id": "codex-smoke-admin",
  "x-actor-role": "admin"
};

type SmokeItem = {
  id: string;
  name: string;
};

type CleanupOptions = {
  app: FastifyInstance;
  prisma: PrismaClient;
  label: string;
  verifyAfterDelete: boolean;
};

type BuildApp = (options?: {
  logger?: false;
  env?: {
    NODE_ENV: "development" | "test" | "production";
    DEMO_MODE: boolean;
  };
}) => FastifyInstance;

type AppModule = {
  buildApp: BuildApp;
};

type PrismaModule = {
  prisma: PrismaClient;
};

config();

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  if (isLiveProdBaseline) {
    console.error("Failed: DATABASE_URL not set for live-prod baseline smoke gate.");
    process.exit(1);
  }

  console.log("Skipped: DATABASE_URL not set");
  process.exit(0);
}

if (isLiveProdBaseline && runtimeNodeEnv !== "production") {
  console.error("Failed: live-prod baseline smoke gate requires NODE_ENV=production.");
  process.exit(1);
}

if (isLiveProdBaseline && isLocalDatabaseUrl(databaseUrl)) {
  console.error("Failed: live-prod baseline smoke gate must not target a local database URL.");
  process.exit(1);
}

console.warn(
  `${isLiveProdBaseline ? "⚠ LIVE PROD BASELINE GATE" : "⚠ SMOKE TEST"} – schreibt scoped ${smokePrefix}* Daten gegen die konfigurierte Datenbank: ${redactDatabaseUrl(databaseUrl)}`
);

const appModulePath: string = "../src/app.js";
const prismaModulePath: string = "../src/lib/prisma.js";
const { buildApp } = (await import(appModulePath)) as AppModule;
const { prisma } = (await import(prismaModulePath)) as PrismaModule;

const app = buildApp({
  env: {
    NODE_ENV: runtimeNodeEnv,
    DEMO_MODE: false
  }
});

try {
  await app.ready();
  await cleanupSmokeItems({
    app,
    prisma,
    label: "Pre-flight cleanup",
    verifyAfterDelete: true
  });

  const createdItemName = `${smokePrefix}${randomUUID()}`;
  const createdItemId = await createInventoryItem(app, createdItemName);

  await readInventoryItem(app, createdItemId, createdItemName);
  await listInventoryItems(app, createdItemId, createdItemName);
  await readInventoryMasterData(app, createdItemId, createdItemName, 0);

  const goodsReceiptId = await recordGoodsReceipt(app, createdItemId, createdItemName);
  await assertInventoryStock(app, createdItemId, createdItemName, expectedStockAfterReceipt);
  await readInventoryMasterData(app, createdItemId, createdItemName, expectedStockAfterReceipt);

  const withdrawalMovementId = await recordWithdrawal(app, createdItemId, createdItemName);
  await assertInventoryStock(app, createdItemId, createdItemName, expectedStockAfterWithdrawal);
  await readInventoryMasterData(app, createdItemId, createdItemName, expectedStockAfterWithdrawal);
  await readInventoryMovements(app, createdItemId, goodsReceiptId, withdrawalMovementId);

  await cleanupSmokeItems({
    app,
    prisma,
    label: "Scoped cleanup",
    verifyAfterDelete: true
  });

  console.log("Inventory API live-prod baseline smoke gate passed.");
} catch (error) {
  try {
    await cleanupSmokeItems({
      app,
      prisma,
      label: "Error cleanup",
      verifyAfterDelete: true
    });
  } catch (cleanupError) {
    console.error("Cleanup failed after smoke-test error:");
    console.error(formatError(cleanupError));
  }

  console.error("Inventory API live-prod baseline smoke gate failed:");
  console.error(formatError(error));
  process.exitCode = 1;
} finally {
  await app.close();
  await prisma.$disconnect();
}

async function createInventoryItem(
  app: FastifyInstance,
  name: string
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/admin/inventory/items",
    headers: adminHeaders,
    payload: {
      name,
      sku: name,
      category: "codex-smoke",
      defaultUnit: "unit",
      minStock: 0
    }
  });

  assertStatus(response, [200, 201], "POST /admin/inventory/items");

  const body = assertRecord(response.json(), "created inventory item body");
  assertItemName(body, name, "created inventory item");

  const inventoryItemId = body.inventoryItemId;

  if (typeof inventoryItemId !== "string" || inventoryItemId.length === 0) {
    throw new Error("created inventory item response did not include inventoryItemId");
  }

  console.log(`Created smoke inventory item: ${inventoryItemId}`);

  return inventoryItemId;
}

async function readInventoryItem(
  app: FastifyInstance,
  inventoryItemId: string,
  expectedName: string
): Promise<void> {
  const response = await app.inject({
    method: "GET",
    url: `/admin/inventory/items/${inventoryItemId}`,
    headers: adminHeaders
  });

  assertStatus(response, [200], "GET /admin/inventory/items/:id");
  assertItemName(
    assertRecord(response.json(), "inventory item detail body"),
    expectedName,
    "read inventory item"
  );
  console.log("Read smoke inventory item by id.");
}

async function listInventoryItems(
  app: FastifyInstance,
  inventoryItemId: string,
  expectedName: string
): Promise<void> {
  const response = await app.inject({
    method: "GET",
    url: "/admin/inventory/items",
    headers: adminHeaders
  });

  assertStatus(response, [200], "GET /admin/inventory/items");

  const items = readItemsArray(response.json(), "inventory item list body");
  const matchingItem = items.find((item) => item.inventoryItemId === inventoryItemId);

  if (!matchingItem) {
    throw new Error("created smoke inventory item was not present in list response");
  }

  assertItemName(matchingItem, expectedName, "listed inventory item");
  console.log("Listed smoke inventory item.");
}

async function readInventoryMasterData(
  app: FastifyInstance,
  inventoryItemId: string,
  expectedName: string,
  expectedCurrentStock: number
): Promise<void> {
  const response = await app.inject({
    method: "GET",
    url: "/inventory/master-data",
    headers: adminHeaders
  });

  assertStatus(response, [200], "GET /inventory/master-data");

  const body = assertRecord(response.json(), "inventory master-data body");
  const items = readArrayProperty(body, "items", "inventory master-data body");
  const stockRows = readArrayProperty(body, "stock", "inventory master-data body");
  const matchingItem = items.find((item) => item.inventoryItemId === inventoryItemId);
  const matchingStock = stockRows.find((item) => item.inventoryItemId === inventoryItemId);

  if (!matchingItem) {
    throw new Error("created smoke inventory item was not present in master-data items");
  }

  if (!matchingStock) {
    throw new Error("created smoke inventory item was not present in master-data stock");
  }

  assertItemName(matchingItem, expectedName, "master-data inventory item");
  assertStockQuantity(matchingStock.currentStock, expectedCurrentStock, "master-data stock currentStock");

  console.log(`Read inventory master-data for smoke item with stock ${expectedCurrentStock}.`);
}

async function recordGoodsReceipt(
  app: FastifyInstance,
  inventoryItemId: string,
  itemName: string
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/goods-receipts",
    headers: adminHeaders,
    payload: {
      note: `Live prod baseline receipt for ${itemName}`,
      items: [
        {
          inventoryItemId,
          quantity: receiptQuantity,
          unit: "unit",
          note: `Live prod baseline receipt for ${itemName}`
        }
      ]
    }
  });

  assertStatus(response, [200, 201], "POST /goods-receipts");

  const body = assertRecord(response.json(), "goods receipt body");
  const goodsReceiptId = body.goodsReceiptId;

  if (typeof goodsReceiptId !== "string" || goodsReceiptId.length === 0) {
    throw new Error("goods receipt response did not include goodsReceiptId");
  }

  if (!Array.isArray(body.movementIds) || body.movementIds.length === 0) {
    throw new Error("goods receipt response did not include movementIds");
  }

  console.log(`Recorded smoke goods receipt: ${goodsReceiptId}`);

  return goodsReceiptId;
}

async function recordWithdrawal(
  app: FastifyInstance,
  inventoryItemId: string,
  itemName: string
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/withdrawals",
    headers: adminHeaders,
    payload: {
      inventoryItemId,
      quantity: withdrawalQuantity,
      unit: "unit",
      note: `Live prod baseline withdrawal for ${itemName}`
    }
  });

  assertStatus(response, [200, 201], "POST /withdrawals");

  const body = assertRecord(response.json(), "withdrawal body");
  const movementId = body.movementId;

  if (typeof movementId !== "string" || movementId.length === 0) {
    throw new Error("withdrawal response did not include movementId");
  }

  assertStockQuantity(body.stockAfter, expectedStockAfterWithdrawal, "withdrawal stockAfter");
  console.log(`Recorded smoke withdrawal movement: ${movementId}`);

  return movementId;
}

async function assertInventoryStock(
  app: FastifyInstance,
  inventoryItemId: string,
  expectedName: string,
  expectedCurrentStock: number
): Promise<void> {
  const response = await app.inject({
    method: "GET",
    url: "/admin/inventory/stock",
    headers: adminHeaders
  });

  assertStatus(response, [200], "GET /admin/inventory/stock");

  const items = readItemsArray(response.json(), "inventory stock body");
  const matchingItem = items.find((item) => item.inventoryItemId === inventoryItemId);

  if (!matchingItem) {
    throw new Error("created smoke inventory item was not present in stock response");
  }

  assertItemName(matchingItem, expectedName, "stock inventory item");
  assertStockQuantity(matchingItem.currentStock, expectedCurrentStock, "stock currentStock");

  console.log(`Read smoke stock row with currentStock ${expectedCurrentStock}.`);
}

async function readInventoryMovements(
  app: FastifyInstance,
  inventoryItemId: string,
  goodsReceiptId: string,
  withdrawalMovementId: string
): Promise<void> {
  const response = await app.inject({
    method: "GET",
    url: "/admin/inventory/movements",
    headers: adminHeaders
  });

  assertStatus(response, [200], "GET /admin/inventory/movements");

  const movements = readArrayProperty(assertRecord(response.json(), "inventory movements body"), "movements", "inventory movements body");
  const smokeMovements = movements.filter((movement) => movement.inventoryItemId === inventoryItemId);
  const receiptMovement = smokeMovements.find((movement) => movement.goodsReceiptId === goodsReceiptId);
  const withdrawalMovement = smokeMovements.find((movement) => movement.id === withdrawalMovementId);

  if (!receiptMovement) {
    throw new Error("goods receipt movement was not present in movement audit response");
  }

  if (!withdrawalMovement) {
    throw new Error("withdrawal movement was not present in movement audit response");
  }

  assertStockQuantity(receiptMovement.quantity, receiptQuantity, "goods receipt movement quantity");
  assertStockQuantity(withdrawalMovement.quantity, withdrawalQuantity, "withdrawal movement quantity");

  if (receiptMovement.type !== "goods_received") {
    throw new Error(`goods receipt movement type mismatch: ${String(receiptMovement.type)}`);
  }

  if (withdrawalMovement.type !== "item_removed") {
    throw new Error(`withdrawal movement type mismatch: ${String(withdrawalMovement.type)}`);
  }

  console.log("Read smoke movement audit rows.");
}

async function cleanupSmokeItems(options: CleanupOptions): Promise<void> {
  const smokeItems = await options.prisma.inventoryItem.findMany({
    where: {
      name: {
        startsWith: smokePrefix
      }
    },
    select: {
      id: true,
      name: true
    },
    orderBy: {
      name: "asc"
    }
  });

  if (smokeItems.length > 0) {
    await cleanupSmokeItemDependencies(options.prisma, smokeItems.map((item) => item.id));
  }

  const deleted =
    smokeItems.length === 0
      ? { count: 0 }
      : await options.prisma.inventoryItem.deleteMany({
          where: {
            id: {
              in: smokeItems.map((item) => item.id)
            }
          }
        });

  logCleanup(options.label, smokeItems, deleted.count);

  if (options.verifyAfterDelete) {
    await verifyNoSmokeItemsVisible(options.app);
  }
}

async function cleanupSmokeItemDependencies(prisma: PrismaClient, inventoryItemIds: string[]): Promise<void> {
  const candidateGoodsReceiptIds = Array.from(
    new Set(
      [
        ...(await prisma.inventoryMovement.findMany({
          where: {
            inventoryItemId: {
              in: inventoryItemIds
            },
            goodsReceiptId: {
              not: null
            }
          },
          select: {
            goodsReceiptId: true
          }
        })).map((movement) => movement.goodsReceiptId),
        ...(await prisma.goodsReceiptItem.findMany({
          where: {
            inventoryItemId: {
              in: inventoryItemIds
            }
          },
          select: {
            goodsReceiptId: true
          }
        })).map((item) => item.goodsReceiptId)
      ].filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );

  const deletableGoodsReceiptIds =
    candidateGoodsReceiptIds.length === 0
      ? []
      : (
          await prisma.goodsReceipt.findMany({
            where: {
              id: {
                in: candidateGoodsReceiptIds
              },
              items: {
                every: {
                  inventoryItem: {
                    name: {
                      startsWith: smokePrefix
                    }
                  }
                }
              }
            },
            select: {
              id: true
            }
          })
        ).map((receipt) => receipt.id);

  const purchaseOrderIds = Array.from(
    new Set(
      (
        await prisma.purchaseOrderItem.findMany({
          where: {
            inventoryItemId: {
              in: inventoryItemIds
            }
          },
          select: {
            purchaseOrderId: true
          }
        })
      ).map((item) => item.purchaseOrderId)
    )
  );

  await prisma.workflowTask.deleteMany({
    where: {
      OR: [
        {
          title: {
            contains: smokePrefix
          }
        },
        {
          description: {
            contains: smokePrefix
          }
        }
      ]
    }
  });

  if (deletableGoodsReceiptIds.length > 0) {
    await prisma.workflowEvent.deleteMany({
      where: {
        type: "inventory.goods_receipt.recorded",
        externalId: {
          in: deletableGoodsReceiptIds
        }
      }
    });
  }

  await prisma.inventoryCorrectionRequest.deleteMany({
    where: {
      inventoryItemId: {
        in: inventoryItemIds
      }
    }
  });

  await prisma.inventoryStockSnapshot.deleteMany({
    where: {
      inventoryItemId: {
        in: inventoryItemIds
      }
    }
  });

  await prisma.inventoryMovement.deleteMany({
    where: {
      inventoryItemId: {
        in: inventoryItemIds
      }
    }
  });

  await prisma.goodsReceiptItem.deleteMany({
    where: {
      inventoryItemId: {
        in: inventoryItemIds
      }
    }
  });

  if (deletableGoodsReceiptIds.length > 0) {
    await prisma.goodsReceipt.deleteMany({
      where: {
        id: {
          in: deletableGoodsReceiptIds
        }
      }
    });
  }

  await prisma.purchaseOrderItem.deleteMany({
    where: {
      inventoryItemId: {
        in: inventoryItemIds
      }
    }
  });

  if (purchaseOrderIds.length > 0) {
    await prisma.purchaseOrder.deleteMany({
      where: {
        id: {
          in: purchaseOrderIds
        },
        items: {
          none: {}
        }
      }
    });
  }
}

async function verifyNoSmokeItemsVisible(app: FastifyInstance): Promise<void> {
  const response = await app.inject({
    method: "GET",
    url: "/admin/inventory/items",
    headers: adminHeaders
  });

  assertStatus(response, [200], "cleanup verification GET /admin/inventory/items");

  const leakedItems = readItemsArray(response.json(), "cleanup verification body").filter((item) =>
    typeof item.name === "string" && item.name.startsWith(smokePrefix)
  );

  if (leakedItems.length > 0) {
    throw new Error(
      `cleanup verification failed; still visible: ${leakedItems
        .map((item) => String(item.name))
        .join(", ")}`
    );
  }

  console.log("Cleanup verification passed: no codex-smoke inventory items visible.");
}

function readItemsArray(body: unknown, label: string): Array<Record<string, unknown>> {
  return readArrayProperty(assertRecord(body, label), "items", label);
}

function readArrayProperty(
  record: Record<string, unknown>,
  propertyName: string,
  label: string
): Array<Record<string, unknown>> {
  const value = record[propertyName];

  if (!Array.isArray(value)) {
    throw new Error(`${label} did not include a ${propertyName} array`);
  }

  return value.map((item, index) => assertRecord(item, `${label}.${propertyName}[${index}]`));
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} was not a JSON object`);
  }

  return value as Record<string, unknown>;
}

function assertItemName(
  item: Record<string, unknown>,
  expectedName: string,
  label: string
): void {
  if (item.name !== expectedName) {
    throw new Error(`${label} name mismatch: expected ${expectedName}, got ${String(item.name)}`);
  }
}

function assertStockQuantity(value: unknown, expected: number, label: string): void {
  const actual = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(actual) || Math.abs(actual - expected) > 0.000001) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${String(value)}`);
  }
}

function assertStatus(
  response: { statusCode: number; body: string },
  acceptedStatusCodes: number[],
  label: string
): void {
  if (!acceptedStatusCodes.includes(response.statusCode)) {
    throw new Error(
      `${label} expected HTTP ${acceptedStatusCodes.join(" or ")}, got ${response.statusCode}: ${
        response.body
      }`
    );
  }
}

function logCleanup(label: string, items: SmokeItem[], deletedCount: number): void {
  console.log(`${label}: found ${items.length} smoke inventory item(s); deleted ${deletedCount}.`);

  for (const item of items) {
    console.log(`- ${item.id} ${item.name}`);
  }
}

function normalizeNodeEnv(value: string | undefined): "development" | "test" | "production" {
  if (value === "test" || value === "production") {
    return value;
  }

  return "development";
}

function isLocalDatabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  } catch {
    return false;
  }
}

function redactDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);

    if (url.password) {
      url.password = "*****";
    }

    for (const [key] of url.searchParams) {
      if (/password|token|secret|key/i.test(key)) {
        url.searchParams.set(key, "*****");
      }
    }

    return url.toString();
  } catch {
    return "[redacted non-url DATABASE_URL]";
  }
}

function formatError(error: unknown): string {
  return inspect(error, {
    colors: false,
    depth: null
  });
}
