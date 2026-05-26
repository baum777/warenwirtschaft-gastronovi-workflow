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

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type CreateGoodsReceiptInput = z.infer<typeof createGoodsReceiptSchema>;
export type CreateWithdrawalInput = z.infer<typeof createWithdrawalSchema>;

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
  createdAt: string;
};
