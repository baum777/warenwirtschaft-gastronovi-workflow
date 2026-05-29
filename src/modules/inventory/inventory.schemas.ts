import { z } from "zod";

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1).optional(),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        inventoryItemId: z.string().min(1),
        orderedQty: z.number().positive(),
        unit: z.string().min(1),
        note: z.string().optional()
      })
    )
    .min(1)
});

export const createGoodsReceiptSchema = z.object({
  purchaseOrderId: z.string().min(1).optional(),
  receivedAt: z.string().datetime().optional(),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        inventoryItemId: z.string().min(1),
        quantity: z.number().positive(),
        unit: z.string().min(1),
        storageLocationId: z.string().min(1).optional(),
        note: z.string().optional()
      })
    )
    .min(1)
});

export const createWithdrawalSchema = z.object({
  inventoryItemId: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  storageLocationId: z.string().min(1).optional(),
  note: z.string().optional()
});

export const createCorrectionRequestSchema = z.object({
  inventoryItemId: z.string().min(1),
  expectedDelta: z.number().refine((value) => value !== 0, {
    message: "expectedDelta must not be zero"
  }),
  unit: z.string().min(1),
  reason: z.string().min(1)
});

export const createInventoryItemSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  defaultUnit: z.string().min(1),
  minStock: z.number().nonnegative().optional(),
  storageLocationId: z.string().min(1).optional()
});

export const updateInventoryItemSchema = createInventoryItemSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  {
    message: "at least one field is required"
  }
);

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type CreateGoodsReceiptInput = z.infer<typeof createGoodsReceiptSchema>;
export type CreateWithdrawalInput = z.infer<typeof createWithdrawalSchema>;
export type CreateCorrectionRequestInput = z.infer<typeof createCorrectionRequestSchema>;
export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;

export type PurchaseOrderDto = {
  purchaseOrderId: string;
  status: "draft" | "ordered" | "partially_received" | "received" | "cancelled";
};

export type PurchaseOrderReadDto = PurchaseOrderDto & {
  supplierId?: string;
  supplierName?: string;
  createdById: string;
  orderedAt?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  items: PurchaseOrderItemReadDto[];
};

export type PurchaseOrderItemReadDto = {
  purchaseOrderItemId: string;
  inventoryItemId: string;
  inventoryItemName?: string;
  orderedQty: number;
  receivedQty: number;
  pendingQty: number;
  unit: string;
  note?: string;
};

export type GoodsReceiptDto = {
  goodsReceiptId: string;
  movementIds: string[];
};

export type WithdrawalDto = {
  movementId: string;
  stockAfter: number;
  reviewTaskIds: string[];
};

export type CorrectionRequestDto = {
  correctionRequestId: string;
  status: "open" | "approved" | "rejected";
  reviewTaskId?: string;
};

export type CorrectionApprovalDto = {
  correctionRequestId: string;
  status: "approved";
  movementId: string;
  stockAfter: number;
};

export type CorrectionRejectionDto = {
  correctionRequestId: string;
  status: "rejected";
};

export type ReviewTaskActionDto = {
  id: string;
  status: "in_review" | "resolved" | "dismissed";
  resolvedAt?: string;
};

export type InventoryItemReadDto = {
  inventoryItemId: string;
  name: string;
  sku?: string;
  category?: string;
  defaultUnit: string;
  minStock?: number;
  storageLocationId?: string;
  storageLocationName?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GoodsReceiptReadDto = {
  goodsReceiptId: string;
  purchaseOrderId?: string;
  receivedById: string;
  receivedAt: string;
  note?: string;
  createdAt: string;
  items: GoodsReceiptItemReadDto[];
};

export type GoodsReceiptItemReadDto = {
  goodsReceiptItemId: string;
  inventoryItemId: string;
  inventoryItemName?: string;
  quantity: number;
  unit: string;
  storageLocationId?: string;
  storageLocationName?: string;
  note?: string;
};

export type AdminStockRow = {
  inventoryItemId: string;
  name: string;
  category?: string;
  storageLocationName?: string;
  currentStock: number;
  unit: string;
  minStock?: number;
  status: "ok" | "low" | "negative" | "unknown";
  lastMovementAt?: string;
};

export type InventoryMovementRow = {
  id: string;
  inventoryItemId: string;
  inventoryItemName?: string;
  type: string;
  quantity: number;
  unit: string;
  actorUserId: string;
  storageLocationName?: string;
  purchaseOrderId?: string;
  goodsReceiptId?: string;
  relatedMovementId?: string;
  idempotencyKey?: string;
  correlationId?: string;
  sourceType?: string;
  sourceId?: string;
  note?: string;
  createdAt: string;
};

export type ReviewTaskRow = {
  id: string;
  type: string;
  status: string;
  severity: string;
  title: string;
  description?: string;
  correctionRequestId?: string;
  createdAt: string;
};
