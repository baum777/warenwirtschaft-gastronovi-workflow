import type {
  AdminStockRow,
  InventoryMovementRow,
  ReviewTaskRow
} from "./inventory.schemas.js";
import type { InventoryMovementType } from "./inventory-movement.types.js";
import { signedQuantity } from "./inventory-stock.service.js";

type InventoryItemWithReadRelations = {
  id: string;
  name: string;
  category: string | null;
  defaultUnit: string;
  minStock: number | null;
  storageLocation?: {
    name: string;
  } | null;
  movements: Array<{
    type: InventoryMovementType;
    quantity: number;
    unit: string;
    createdAt: Date;
    storageLocation?: {
      name: string;
    } | null;
  }>;
};

type MovementReadRecord = {
  id: string;
  inventoryItemId: string;
  inventoryItem?: {
    name: string;
  } | null;
  type: string;
  quantity: number;
  unit: string;
  actorUserId: string;
  storageLocation?: {
    name: string;
  } | null;
  purchaseOrderId: string | null;
  goodsReceiptId: string | null;
  relatedMovementId: string | null;
  note: string | null;
  createdAt: Date;
};

type ReviewTaskRecord = {
  id: string;
  type: string;
  status: string;
  severity: string;
  title: string;
  description: string | null;
  workflowEvent?: {
    metadataJson: unknown;
  } | null;
  createdAt: Date;
};

export type InventoryReadDatabaseClient = {
  inventoryItem: {
    findMany(args: unknown): Promise<InventoryItemWithReadRelations[]>;
  };
  inventoryMovement: {
    findMany(args: unknown): Promise<MovementReadRecord[]>;
  };
  workflowTask: {
    findMany(args: unknown): Promise<ReviewTaskRecord[]>;
  };
};

export type InventoryReadServicePort = {
  listStock(): Promise<AdminStockRow[]>;
  listMovements(): Promise<InventoryMovementRow[]>;
  listOpenReviewTasks(): Promise<ReviewTaskRow[]>;
};

export class InventoryReadService implements InventoryReadServicePort {
  public constructor(private readonly db: InventoryReadDatabaseClient) {}

  public async listStock(): Promise<AdminStockRow[]> {
    const items = await this.db.inventoryItem.findMany({
      where: {
        isActive: true
      },
      include: {
        storageLocation: {
          select: {
            name: true
          }
        },
        movements: {
          select: {
            type: true,
            quantity: true,
            unit: true,
            createdAt: true,
            storageLocation: {
              select: {
                name: true
              }
            }
          },
          orderBy: {
            createdAt: "desc"
          }
        }
      },
      orderBy: {
        name: "asc"
      }
    });

    return items.map((item) => {
      const currentStock = item.movements.reduce(
        (total, movement) => total + signedQuantity(movement),
        0
      );
      const lastMovement = item.movements[0];

      return {
        inventoryItemId: item.id,
        name: item.name,
        category: item.category ?? undefined,
        storageLocationName: item.storageLocation?.name,
        currentStock,
        unit: lastMovement?.unit ?? item.defaultUnit,
        minStock: item.minStock ?? undefined,
        status: calculateStockStatus(currentStock, item.minStock, item.movements.length),
        lastMovementAt: lastMovement?.createdAt.toISOString()
      };
    });
  }

  public async listMovements(): Promise<InventoryMovementRow[]> {
    const movements = await this.db.inventoryMovement.findMany({
      include: {
        inventoryItem: {
          select: {
            name: true
          }
        },
        storageLocation: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return movements.map((movement) => ({
      id: movement.id,
      inventoryItemId: movement.inventoryItemId,
      inventoryItemName: movement.inventoryItem?.name ?? undefined,
      type: movement.type,
      quantity: movement.quantity,
      unit: movement.unit,
      actorUserId: movement.actorUserId,
      storageLocationName: movement.storageLocation?.name ?? undefined,
      purchaseOrderId: movement.purchaseOrderId ?? undefined,
      goodsReceiptId: movement.goodsReceiptId ?? undefined,
      relatedMovementId: movement.relatedMovementId ?? undefined,
      idempotencyKey: deriveMovementIdempotencyKey(movement),
      correlationId: deriveMovementCorrelationId(movement),
      sourceType: deriveMovementSourceType(movement),
      sourceId: deriveMovementSourceId(movement),
      note: movement.note ?? undefined,
      createdAt: movement.createdAt.toISOString()
    }));
  }

  public async listOpenReviewTasks(): Promise<ReviewTaskRow[]> {
    const tasks = await this.db.workflowTask.findMany({
      where: {
        status: {
          in: ["open", "in_review"]
        },
        type: {
          startsWith: "inventory."
        }
      },
      include: {
        workflowEvent: {
          select: {
            metadataJson: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return tasks.map((task) => ({
      id: task.id,
      type: task.type,
      status: task.status,
      severity: task.severity,
      title: task.title,
      description: task.description ?? undefined,
      correctionRequestId: extractCorrectionRequestId(task),
      createdAt: task.createdAt.toISOString()
    }));
  }
}

function extractCorrectionRequestId(task: ReviewTaskRecord): string | undefined {
  if (task.type !== "inventory.correction_request") {
    return undefined;
  }

  const metadata = task.workflowEvent?.metadataJson;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const candidate = (metadata as Record<string, unknown>).correctionRequestId;
  return typeof candidate === "string" && candidate.trim() ? candidate : undefined;
}

function deriveMovementIdempotencyKey(movement: MovementReadRecord): string | undefined {
  if (movement.goodsReceiptId) {
    return `inventory.goods_receipt.recorded:${movement.goodsReceiptId}`;
  }

  return undefined;
}

function deriveMovementCorrelationId(movement: MovementReadRecord): string | undefined {
  if (movement.relatedMovementId) {
    return movement.relatedMovementId;
  }
  if (movement.goodsReceiptId) {
    return movement.goodsReceiptId;
  }
  if (movement.purchaseOrderId) {
    return movement.purchaseOrderId;
  }

  return undefined;
}

function deriveMovementSourceType(movement: MovementReadRecord): string {
  if (movement.goodsReceiptId) {
    return "goods_receipt";
  }
  if (movement.purchaseOrderId) {
    return "purchase_order";
  }
  if (movement.type === "correction_positive" || movement.type === "correction_negative") {
    return "correction_movement";
  }
  if (movement.type === "item_removed") {
    return "withdrawal";
  }

  return "inventory_movement";
}

function deriveMovementSourceId(movement: MovementReadRecord): string {
  return movement.goodsReceiptId || movement.purchaseOrderId || movement.id;
}

function calculateStockStatus(
  currentStock: number,
  minStock: number | null,
  movementCount: number
): AdminStockRow["status"] {
  if (movementCount === 0) {
    return "unknown";
  }

  if (currentStock < 0) {
    return "negative";
  }

  if (minStock !== null && currentStock <= minStock) {
    return "low";
  }

  return "ok";
}
