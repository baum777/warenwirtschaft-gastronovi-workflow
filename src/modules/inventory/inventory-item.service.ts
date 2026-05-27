import type {
  CreateInventoryItemInput,
  InventoryItemReadDto,
  UpdateInventoryItemInput
} from "./inventory.schemas.js";
import { InventoryNotFoundError } from "./errors.js";

type InventoryItemRecord = {
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

export type InventoryItemDatabaseClient = {
  inventoryItem: {
    create(args: {
      data: {
        name: string;
        sku?: string;
        category?: string;
        defaultUnit: string;
        minStock?: number;
        storageLocationId?: string;
      };
      include: typeof inventoryItemReadInclude;
    }): Promise<InventoryItemRecord>;
    findMany(args: {
      include: typeof inventoryItemReadInclude;
      orderBy: {
        name: "asc";
      };
    }): Promise<InventoryItemRecord[]>;
    findUnique(args: {
      where: {
        id: string;
      };
      include: typeof inventoryItemReadInclude;
    }): Promise<InventoryItemRecord | null>;
    update(args: {
      where: {
        id: string;
      };
      data: Partial<{
        name: string;
        sku: string;
        category: string;
        defaultUnit: string;
        minStock: number;
        storageLocationId: string;
        isActive: boolean;
      }>;
      include: typeof inventoryItemReadInclude;
    }): Promise<InventoryItemRecord>;
  };
};

export type InventoryItemServicePort = {
  create(input: CreateInventoryItemInput): Promise<InventoryItemReadDto>;
  list(): Promise<InventoryItemReadDto[]>;
  get(id: string): Promise<InventoryItemReadDto>;
  update(id: string, input: UpdateInventoryItemInput): Promise<InventoryItemReadDto>;
  deactivate(id: string): Promise<InventoryItemReadDto>;
};

export class InventoryItemService implements InventoryItemServicePort {
  public constructor(private readonly options: { db: InventoryItemDatabaseClient }) {}

  public async create(input: CreateInventoryItemInput): Promise<InventoryItemReadDto> {
    const item = await this.options.db.inventoryItem.create({
      data: {
        name: input.name,
        sku: input.sku,
        category: input.category,
        defaultUnit: input.defaultUnit,
        minStock: input.minStock,
        storageLocationId: input.storageLocationId
      },
      include: inventoryItemReadInclude
    });

    return mapInventoryItem(item);
  }

  public async list(): Promise<InventoryItemReadDto[]> {
    const items = await this.options.db.inventoryItem.findMany({
      include: inventoryItemReadInclude,
      orderBy: {
        name: "asc"
      }
    });

    return items.map(mapInventoryItem);
  }

  public async get(id: string): Promise<InventoryItemReadDto> {
    const item = await this.options.db.inventoryItem.findUnique({
      where: {
        id
      },
      include: inventoryItemReadInclude
    });

    if (!item) {
      throw new InventoryNotFoundError("inventory item not found");
    }

    return mapInventoryItem(item);
  }

  public async update(
    id: string,
    input: UpdateInventoryItemInput
  ): Promise<InventoryItemReadDto> {
    const item = await this.options.db.inventoryItem.update({
      where: {
        id
      },
      data: input,
      include: inventoryItemReadInclude
    });

    return mapInventoryItem(item);
  }

  public async deactivate(id: string): Promise<InventoryItemReadDto> {
    const item = await this.options.db.inventoryItem.update({
      where: {
        id
      },
      data: {
        isActive: false
      },
      include: inventoryItemReadInclude
    });

    return mapInventoryItem(item);
  }
}

const inventoryItemReadInclude = {
  storageLocation: {
    select: {
      name: true
    }
  }
};

function mapInventoryItem(record: InventoryItemRecord): InventoryItemReadDto {
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
