import { signedQuantity } from "./inventory-stock.service.js";

const csvHeaders = [
  "name",
  "sku",
  "category",
  "defaultUnit",
  "minStock",
  "storageLocationName",
  "currentStock"
] as const;

type CsvHeader = (typeof csvHeaders)[number];

type CsvMovementType =
  | "goods_received"
  | "item_removed"
  | "correction_positive"
  | "correction_negative";

type CsvInventoryItemRecord = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  defaultUnit: string;
  minStock: number | null;
  storageLocation?: {
    name: string;
  } | null;
  movements: Array<{
    type: CsvMovementType;
    quantity: number;
  }>;
};

type StorageLocationRecord = {
  id: string;
  name: string;
};

type CountResult = {
  count: number;
};

type InventoryCsvTransactionClient = {
  workflowTask: {
    deleteMany(args?: unknown): Promise<CountResult>;
  };
  workflowEvent: {
    deleteMany(args?: unknown): Promise<CountResult>;
  };
  inventoryCorrectionRequest: {
    deleteMany(args?: unknown): Promise<CountResult>;
  };
  inventoryStockSnapshot: {
    deleteMany(args?: unknown): Promise<CountResult>;
    create(args: unknown): Promise<unknown>;
  };
  inventoryMovement: {
    deleteMany(args?: unknown): Promise<CountResult>;
    create(args: unknown): Promise<unknown>;
  };
  goodsReceiptItem: {
    deleteMany(args?: unknown): Promise<CountResult>;
  };
  goodsReceipt: {
    deleteMany(args?: unknown): Promise<CountResult>;
  };
  purchaseOrderItem: {
    deleteMany(args?: unknown): Promise<CountResult>;
  };
  purchaseOrder: {
    deleteMany(args?: unknown): Promise<CountResult>;
  };
  inventoryItem: {
    deleteMany(args?: unknown): Promise<CountResult>;
    create(args: {
      data: {
        name: string;
        sku?: string;
        category?: string;
        defaultUnit: string;
        minStock?: number;
        storageLocationId?: string;
      };
    }): Promise<{ id: string }>;
  };
  supplier: {
    deleteMany(args?: unknown): Promise<CountResult>;
  };
  storageLocation: {
    deleteMany(args?: unknown): Promise<CountResult>;
    findFirst(args: { where: { name: string } }): Promise<StorageLocationRecord | null>;
    create(args: { data: { name: string; type?: string } }): Promise<StorageLocationRecord>;
  };
};

export type InventoryCsvDatabaseClient = {
  $transaction<T>(callback: (transaction: InventoryCsvTransactionClient) => Promise<T>): Promise<T>;
  inventoryItem: {
    findMany(args: unknown): Promise<CsvInventoryItemRecord[]>;
  };
};

export type ImportInventoryCsvInput = {
  csv: string;
  reset?: boolean;
  actorUserId: string;
  actorOrganizationId: string;
};

export type InventoryCsvImportResult = {
  importedItems: number;
  importedMovements: number;
  reset: boolean;
};

export type InventoryResetResult = {
  deletedWorkflowTasks: number;
  deletedWorkflowEvents: number;
  deletedCorrectionRequests: number;
  deletedStockSnapshots: number;
  deletedMovements: number;
  deletedReceiptItems: number;
  deletedReceipts: number;
  deletedOrderItems: number;
  deletedOrders: number;
  deletedItems: number;
  deletedSuppliers: number;
  deletedStorageLocations: number;
};

export type InventoryCsvServicePort = {
  exportCsv(): Promise<string>;
  importCsv(input: ImportInventoryCsvInput): Promise<InventoryCsvImportResult>;
  reset(): Promise<InventoryResetResult>;
};

export class InventoryCsvService implements InventoryCsvServicePort {
  public constructor(
    private readonly options: {
      db: InventoryCsvDatabaseClient;
      now?: () => Date;
    }
  ) {}

  public async exportCsv(): Promise<string> {
    const items = await this.options.db.inventoryItem.findMany({
      include: {
        storageLocation: {
          select: {
            name: true
          }
        },
        movements: {
          select: {
            type: true,
            quantity: true
          }
        }
      },
      orderBy: {
        name: "asc"
      }
    });

    return serializeInventoryCsv(
      items.map((item) => ({
        name: item.name,
        sku: item.sku ?? "",
        category: item.category ?? "",
        defaultUnit: item.defaultUnit,
        minStock: item.minStock ?? "",
        storageLocationName: item.storageLocation?.name ?? "",
        currentStock: item.movements.reduce(
          (total, movement) => total + signedQuantity(movement),
          0
        )
      }))
    );
  }

  public async importCsv(input: ImportInventoryCsvInput): Promise<InventoryCsvImportResult> {
    const rows = parseInventoryCsv(input.csv);

    return this.options.db.$transaction(async (transaction) => {
      if (input.reset) {
        await resetInventoryData(transaction);
      }

      let importedMovements = 0;
      const storageLocationIds = new Map<string, string>();

      for (const row of rows) {
        const storageLocationId = row.storageLocationName
          ? await findOrCreateStorageLocation(transaction, row.storageLocationName, storageLocationIds)
          : undefined;

        const item = await transaction.inventoryItem.create({
          data: {
            name: row.name,
            sku: row.sku || undefined,
            category: row.category || undefined,
            defaultUnit: row.defaultUnit,
            minStock: row.minStock,
            storageLocationId
          }
        });

        if (row.currentStock !== 0) {
          await transaction.inventoryMovement.create({
            data: {
              idempotencyKey: `inventory.csv_import.seeded:${item.id}`,
              organizationId: input.actorOrganizationId,
              inventoryItemId: item.id,
              type: row.currentStock > 0 ? "correction_positive" : "correction_negative",
              quantity: Math.abs(row.currentStock),
              unit: row.defaultUnit,
              actorUserId: input.actorUserId,
              storageLocationId,
              note: "CSV import"
            }
          });
          importedMovements += 1;

          if (storageLocationId) {
            await transaction.inventoryStockSnapshot.create({
              data: {
                inventoryItemId: item.id,
                storageLocationId,
                quantity: row.currentStock,
                unit: row.defaultUnit,
                calculatedAt: this.options.now?.() ?? new Date()
              }
            });
          }
        }
      }

      return {
        importedItems: rows.length,
        importedMovements,
        reset: input.reset ?? false
      };
    });
  }

  public async reset(): Promise<InventoryResetResult> {
    return this.options.db.$transaction(resetInventoryData);
  }
}

export function serializeInventoryCsv(rows: Array<Record<CsvHeader, string | number>>): string {
  return [csvHeaders.join(","), ...rows.map((row) => csvHeaders.map((header) => csvCell(row[header])).join(","))].join(
    "\n"
  );
}

export function parseInventoryCsv(csv: string): Array<{
  name: string;
  sku?: string;
  category?: string;
  defaultUnit: string;
  minStock?: number;
  storageLocationName?: string;
  currentStock: number;
}> {
  const lines = parseCsvRows(csv).filter((row) => row.some((cell) => cell.trim() !== ""));

  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].map((header) => header.trim());
  const missingHeaders = csvHeaders.filter((header) => !headers.includes(header));

  if (missingHeaders.length > 0) {
    throw new Error(`CSV header missing: ${missingHeaders.join(", ")}`);
  }

  return lines.slice(1).map((cells, rowIndex) => {
    const rawRow = Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ""]));
    const name = requireCsvValue(rawRow.name, "name", rowIndex);
    const defaultUnit = requireCsvValue(rawRow.defaultUnit, "defaultUnit", rowIndex);

    return {
      name,
      sku: rawRow.sku || undefined,
      category: rawRow.category || undefined,
      defaultUnit,
      minStock: optionalNumber(rawRow.minStock, "minStock", rowIndex),
      storageLocationName: rawRow.storageLocationName || undefined,
      currentStock: optionalNumber(rawRow.currentStock, "currentStock", rowIndex) ?? 0
    };
  });
}

async function resetInventoryData(
  transaction: InventoryCsvTransactionClient
): Promise<InventoryResetResult> {
  const deletedWorkflowTasks = await transaction.workflowTask.deleteMany({});
  const deletedWorkflowEvents = await transaction.workflowEvent.deleteMany({});
  const deletedCorrectionRequests = await transaction.inventoryCorrectionRequest.deleteMany({});
  const deletedStockSnapshots = await transaction.inventoryStockSnapshot.deleteMany({});
  const deletedMovements = await transaction.inventoryMovement.deleteMany({});
  const deletedReceiptItems = await transaction.goodsReceiptItem.deleteMany({});
  const deletedReceipts = await transaction.goodsReceipt.deleteMany({});
  const deletedOrderItems = await transaction.purchaseOrderItem.deleteMany({});
  const deletedOrders = await transaction.purchaseOrder.deleteMany({});
  const deletedItems = await transaction.inventoryItem.deleteMany({});
  const deletedSuppliers = await transaction.supplier.deleteMany({});
  const deletedStorageLocations = await transaction.storageLocation.deleteMany({});

  return {
    deletedWorkflowTasks: deletedWorkflowTasks.count,
    deletedWorkflowEvents: deletedWorkflowEvents.count,
    deletedCorrectionRequests: deletedCorrectionRequests.count,
    deletedStockSnapshots: deletedStockSnapshots.count,
    deletedMovements: deletedMovements.count,
    deletedReceiptItems: deletedReceiptItems.count,
    deletedReceipts: deletedReceipts.count,
    deletedOrderItems: deletedOrderItems.count,
    deletedOrders: deletedOrders.count,
    deletedItems: deletedItems.count,
    deletedSuppliers: deletedSuppliers.count,
    deletedStorageLocations: deletedStorageLocations.count
  };
}

async function findOrCreateStorageLocation(
  transaction: InventoryCsvTransactionClient,
  name: string,
  cachedIds: Map<string, string>
): Promise<string> {
  const cached = cachedIds.get(name);

  if (cached) {
    return cached;
  }

  const existing = await transaction.storageLocation.findFirst({
    where: {
      name
    }
  });
  const storageLocation =
    existing ??
    (await transaction.storageLocation.create({
      data: {
        name,
        type: "csv"
      }
    }));

  cachedIds.set(name, storageLocation.id);

  return storageLocation.id;
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const nextChar = csv[index + 1];

    if (char === '"' && quoted && nextChar === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);

  return rows;
}

function csvCell(value: string | number): string {
  const stringValue = String(value);

  if (!/[",\n\r]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replaceAll('"', '""')}"`;
}

function requireCsvValue(value: string | undefined, field: string, rowIndex: number): string {
  if (value) {
    return value;
  }

  throw new Error(`CSV row ${rowIndex + 2}: ${field} is required`);
}

function optionalNumber(value: string | undefined, field: string, rowIndex: number): number | undefined {
  if (!value) {
    return undefined;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    throw new Error(`CSV row ${rowIndex + 2}: ${field} must be a number`);
  }

  return numberValue;
}
