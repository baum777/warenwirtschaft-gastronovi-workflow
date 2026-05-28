import type { InventoryItemReadDto } from "./inventory.schemas.js";

export type InventoryItemReadRecord = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  defaultUnit: string;
  minStock: number | null;
  storageLocationId: string | null;
  storageLocation?: {
    name: string;
  } | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const inventoryItemReadInclude = {
  storageLocation: {
    select: {
      name: true
    }
  }
};

export function mapInventoryItemRead(record: InventoryItemReadRecord): InventoryItemReadDto {
  return {
    inventoryItemId: record.id,
    name: record.name,
    sku: record.sku ?? undefined,
    category: record.category ?? undefined,
    defaultUnit: record.defaultUnit,
    minStock: record.minStock ?? undefined,
    storageLocationId: record.storageLocationId ?? undefined,
    storageLocationName: record.storageLocation?.name,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}
