export type InventoryMovementType =
  | "goods_received"
  | "item_removed"
  | "correction_positive"
  | "correction_negative";

export type InventoryMovementRecord = {
  type: InventoryMovementType;
  quantity: number;
  createdAt?: Date;
};
