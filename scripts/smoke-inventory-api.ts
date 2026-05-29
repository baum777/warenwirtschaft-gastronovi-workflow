import { randomUUID } from "node:crypto";
import { inspect } from "node:util";

import type { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import type { FastifyInstance } from "fastify";

/**
 * Inventory API smoke test.
 *
 * Strategy: this repo's route tests use Fastify's in-process `app.inject()`
 * against `buildApp()`, and `supertest` is not installed. This smoke test
 * follows that local convention instead of calling an externally running server.
 *
 * Warning: this script writes `codex-smoke-*` InventoryItem rows to the
 * configured DATABASE_URL and removes that scoped data before exit.
 */

const smokePrefix = "codex-smoke-";
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
  console.log("Skipped: DATABASE_URL not set");
  process.exit(0);
}

console.warn(
  `⚠ SMOKE TEST – schreibt gegen die konfigurierte Datenbank: ${redactDatabaseUrl(databaseUrl)}`
);

const appModulePath: string = "../src/app.js";
const prismaModulePath: string = "../src/lib/prisma.js";
const { buildApp } = (await import(appModulePath)) as AppModule;
const { prisma } = (await import(prismaModulePath)) as PrismaModule;

const app = buildApp({
  env: {
    NODE_ENV: normalizeNodeEnv(process.env.NODE_ENV),
    DEMO_MODE: false
  }
});

try {
  await app.ready();
  await cleanupSmokeItems({
    app,
    prisma,
    label: "Pre-flight cleanup",
    verifyAfterDelete: false
  });

  const createdItemName = `${smokePrefix}${randomUUID()}`;
  const createdItemId = await createInventoryItem(app, createdItemName);

  await readInventoryItem(app, createdItemId, createdItemName);
  await listInventoryItems(app, createdItemId, createdItemName);
  await readInventoryMasterData(app);

  await cleanupSmokeItems({
    app,
    prisma,
    label: "Scoped cleanup",
    verifyAfterDelete: true
  });

  console.log("Inventory API smoke test passed.");
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

  console.error("Inventory API smoke test failed:");
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

async function readInventoryMasterData(app: FastifyInstance): Promise<void> {
  const response = await app.inject({
    method: "GET",
    url: "/inventory/master-data",
    headers: adminHeaders
  });

  assertStatus(response, [200], "GET /inventory/master-data");

  const body = assertRecord(response.json(), "inventory master-data body");

  if (Object.keys(body).length === 0) {
    throw new Error("inventory master-data response body was empty");
  }

  console.log("Read non-empty inventory master-data body.");
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
  const record = assertRecord(body, label);

  if (!Array.isArray(record.items)) {
    throw new Error(`${label} did not include an items array`);
  }

  return record.items.map((item, index) => assertRecord(item, `${label}.items[${index}]`));
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
