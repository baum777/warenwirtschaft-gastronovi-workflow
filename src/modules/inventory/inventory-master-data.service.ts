import type {
  AdminStockRow,
  InventoryItemReadDto,
  PurchaseOrderReadDto
} from "./inventory.schemas.js";
import {
  mapInventoryItemRead,
  type InventoryItemReadRecord
} from "./inventory-item.read-model.js";
import type { InventoryReadServicePort } from "./inventory-read.service.js";

export type SupplierReadDto = {
  supplierId: string;
  name: string;
  email?: string;
  phone?: string;
  isActive: boolean;
};

export type StorageLocationReadDto = {
  storageLocationId: string;
  name: string;
  type?: string;
  isActive: boolean;
};

export type InventoryMasterDataDto = {
  suppliers: SupplierReadDto[];
  storageLocations: StorageLocationReadDto[];
  items: InventoryItemReadDto[];
  stock: AdminStockRow[];
  openPurchaseOrders: PurchaseOrderReadDto[];
};

type SupplierRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
};

type StorageLocationRecord = {
  id: string;
  name: string;
  type: string | null;
  isActive: boolean;
};

type PurchaseOrderRecord = {
  id: string;
  status: PurchaseOrderReadDto["status"];
  supplierId: string | null;
  supplier?: {
    name: string;
  } | null;
  createdById: string;
  orderedAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    inventoryItemId: string;
    inventoryItem?: {
      name: string;
    } | null;
    orderedQty: number;
    receivedQty: number;
    unit: string;
    note: string | null;
  }>;
};

export type InventoryMasterDataDatabaseClient = {
  supplier: {
    findMany(args: unknown): Promise<SupplierRecord[]>;
  };
  storageLocation: {
    findMany(args: unknown): Promise<StorageLocationRecord[]>;
  };
  inventoryItem: {
    findMany(args: unknown): Promise<InventoryItemReadRecord[]>;
  };
  purchaseOrder: {
    findMany(args: unknown): Promise<PurchaseOrderRecord[]>;
  };
};

export type InventoryMasterDataServicePort = {
  list(): Promise<InventoryMasterDataDto>;
};

export class InventoryMasterDataService implements InventoryMasterDataServicePort {
  public constructor(
    private readonly options: {
      db: InventoryMasterDataDatabaseClient;
      inventoryReadService: InventoryReadServicePort;
    }
  ) {}

  public async list(): Promise<InventoryMasterDataDto> {
    const [suppliers, storageLocations, items, openPurchaseOrders, stock] = await Promise.all([
      this.options.db.supplier.findMany({
        where: {
          isActive: true
        },
        orderBy: {
          name: "asc"
        }
      }),
      this.options.db.storageLocation.findMany({
        where: {
          isActive: true
        },
        orderBy: {
          name: "asc"
        }
      }),
      this.options.db.inventoryItem.findMany({
        where: {
          isActive: true
        },
        include: {
          storageLocation: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          name: "asc"
        }
      }),
      this.options.db.purchaseOrder.findMany({
        where: {
          status: {
            in: ["draft", "ordered", "partially_received"]
          }
        },
        include: {
          supplier: {
            select: {
              name: true
            }
          },
          items: {
            include: {
              inventoryItem: {
                select: {
                  name: true
                }
              }
            },
            orderBy: {
              id: "asc"
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      }),
      this.options.inventoryReadService.listStock()
    ]);

    return {
      suppliers: suppliers.map(mapSupplier),
      storageLocations: storageLocations.map(mapStorageLocation),
      items: items.map(mapInventoryItemRead),
      stock,
      openPurchaseOrders: openPurchaseOrders.map(mapPurchaseOrder)
    };
  }
}

function mapSupplier(record: SupplierRecord): SupplierReadDto {
  return {
    supplierId: record.id,
    name: record.name,
    email: record.email ?? undefined,
    phone: record.phone ?? undefined,
    isActive: record.isActive
  };
}

function mapStorageLocation(record: StorageLocationRecord): StorageLocationReadDto {
  return {
    storageLocationId: record.id,
    name: record.name,
    type: record.type ?? undefined,
    isActive: record.isActive
  };
}

function mapPurchaseOrder(record: PurchaseOrderRecord): PurchaseOrderReadDto {
  return {
    purchaseOrderId: record.id,
    status: record.status,
    supplierId: record.supplierId ?? undefined,
    supplierName: record.supplier?.name,
    createdById: record.createdById,
    orderedAt: record.orderedAt?.toISOString(),
    note: record.note ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    items: record.items.map((item) => ({
      purchaseOrderItemId: item.id,
      inventoryItemId: item.inventoryItemId,
      inventoryItemName: item.inventoryItem?.name,
      orderedQty: item.orderedQty,
      receivedQty: item.receivedQty,
      pendingQty: Math.max(item.orderedQty - item.receivedQty, 0),
      unit: item.unit,
      note: item.note ?? undefined
    }))
  };
}
