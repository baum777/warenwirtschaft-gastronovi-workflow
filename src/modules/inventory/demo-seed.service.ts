type UpsertArgs = {
  where: unknown;
  update: Record<string, unknown>;
  create: Record<string, unknown>;
};

type UpsertDelegate = {
  upsert(args: UpsertArgs): Promise<unknown>;
};

export type DemoSeedDatabaseClient = {
  supplier: UpsertDelegate;
  storageLocation: UpsertDelegate;
  inventoryItem: UpsertDelegate;
  workflowEvent: UpsertDelegate;
  purchaseOrder: UpsertDelegate;
  purchaseOrderItem: UpsertDelegate;
  goodsReceipt: UpsertDelegate;
  goodsReceiptItem: UpsertDelegate;
  inventoryMovement: UpsertDelegate;
  inventoryStockSnapshot: UpsertDelegate;
  inventoryCorrectionRequest: UpsertDelegate;
  workflowTask: UpsertDelegate;
};

export type DemoSeedServicePort = {
  ensure(): Promise<void>;
};

export class DemoSeedService implements DemoSeedServicePort {
  public constructor(
    private readonly options: {
      db: DemoSeedDatabaseClient;
      now?: () => Date;
    }
  ) {}

  public async ensure(): Promise<void> {
    await ensureDemoData(this.options.db, this.options.now?.() ?? new Date());
  }
}

const suppliers = [
  { id: "demo-supplier-frischemarkt-sued", name: "Frischemarkt Süd" },
  { id: "demo-supplier-gastro-mueller", name: "Gastro Großhandel Müller" },
  { id: "demo-supplier-getraenke-berlin", name: "Getränkelogistik Berlin" }
];

const storageLocations = [
  { id: "demo-location-hauptlager", name: "Hauptlager", type: "warehouse" },
  { id: "demo-location-kuehlhaus", name: "Kühlhaus", type: "cold_storage" },
  { id: "demo-location-bar", name: "Bar", type: "bar" },
  { id: "demo-location-kueche", name: "Küche", type: "kitchen" }
];

const items = [
  {
    id: "demo-item-tomaten",
    name: "Tomaten",
    sku: "DEMO-TOM",
    category: "Frische",
    defaultUnit: "kg",
    minStock: 5,
    storageLocationId: "demo-location-kuehlhaus"
  },
  {
    id: "demo-item-mozzarella",
    name: "Mozzarella",
    sku: "DEMO-MOZ",
    category: "Molkerei",
    defaultUnit: "kg",
    minStock: 4,
    storageLocationId: "demo-location-kuehlhaus"
  },
  {
    id: "demo-item-rinderhack",
    name: "Rinderhack",
    sku: "DEMO-RIN",
    category: "Fleisch",
    defaultUnit: "kg",
    minStock: 6,
    storageLocationId: "demo-location-kuehlhaus"
  },
  {
    id: "demo-item-pasta",
    name: "Pasta",
    sku: "DEMO-PAS",
    category: "Trockenware",
    defaultUnit: "kg",
    minStock: 12,
    storageLocationId: "demo-location-hauptlager"
  },
  {
    id: "demo-item-olivenoel",
    name: "Olivenöl",
    sku: "DEMO-OEL",
    category: "Trockenware",
    defaultUnit: "l",
    minStock: 8,
    storageLocationId: "demo-location-hauptlager"
  },
  {
    id: "demo-item-kaffeebohnen",
    name: "Kaffeebohnen",
    sku: "DEMO-KAF",
    category: "Getränke",
    defaultUnit: "kg",
    minStock: 5,
    storageLocationId: "demo-location-bar"
  },
  {
    id: "demo-item-milch",
    name: "Milch",
    sku: "DEMO-MIL",
    category: "Molkerei",
    defaultUnit: "l",
    minStock: 10,
    storageLocationId: "demo-location-kuehlhaus"
  },
  {
    id: "demo-item-servietten",
    name: "Servietten",
    sku: "DEMO-SER",
    category: "Verbrauchsmaterial",
    defaultUnit: "Packung",
    minStock: 6,
    storageLocationId: "demo-location-hauptlager"
  },
  {
    id: "demo-item-reinigungsmittel",
    name: "Reinigungsmittel",
    sku: "DEMO-REI",
    category: "Hygiene",
    defaultUnit: "Flasche",
    minStock: 4,
    storageLocationId: "demo-location-hauptlager"
  }
];

export async function ensureDemoData(db: DemoSeedDatabaseClient, now: Date): Promise<void> {
  for (const supplier of suppliers) {
    await db.supplier.upsert({
      where: { id: supplier.id },
      update: {
        name: supplier.name,
        isActive: true
      },
      create: {
        id: supplier.id,
        name: supplier.name,
        isActive: true
      }
    });
  }

  for (const location of storageLocations) {
    await db.storageLocation.upsert({
      where: { id: location.id },
      update: {
        name: location.name,
        type: location.type,
        isActive: true
      },
      create: {
        id: location.id,
        name: location.name,
        type: location.type,
        isActive: true
      }
    });
  }

  for (const item of items) {
    await db.inventoryItem.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        sku: item.sku,
        category: item.category,
        defaultUnit: item.defaultUnit,
        minStock: item.minStock,
        storageLocationId: item.storageLocationId,
        isActive: true
      },
      create: {
        ...item,
        isActive: true
      }
    });
  }

  await upsertPurchaseOrder(db, {
    id: "demo-po-open-frischemarkt",
    supplierId: "demo-supplier-frischemarkt-sued",
    status: "ordered",
    createdById: "demo-shift-lead",
    orderedAt: now,
    note: "DEMO_MODE offene Wochenbestellung",
    items: [
      { id: "demo-poi-open-pasta", inventoryItemId: "demo-item-pasta", orderedQty: 20, receivedQty: 0, unit: "kg" },
      { id: "demo-poi-open-rinderhack", inventoryItemId: "demo-item-rinderhack", orderedQty: 12, receivedQty: 0, unit: "kg" }
    ]
  });

  await upsertPurchaseOrder(db, {
    id: "demo-po-receipt-frischemarkt",
    supplierId: "demo-supplier-frischemarkt-sued",
    status: "partially_received",
    createdById: "demo-admin",
    orderedAt: now,
    note: "DEMO_MODE Wareneingang bereits gebucht",
    items: [
      { id: "demo-poi-receipt-tomaten", inventoryItemId: "demo-item-tomaten", orderedQty: 15, receivedQty: 10, unit: "kg" },
      { id: "demo-poi-receipt-mozzarella", inventoryItemId: "demo-item-mozzarella", orderedQty: 8, receivedQty: 5, unit: "kg" }
    ]
  });

  await db.goodsReceipt.upsert({
    where: { id: "demo-goods-receipt-1" },
    update: {
      purchaseOrderId: "demo-po-receipt-frischemarkt",
      receivedById: "demo-shift-lead",
      receivedAt: now,
      note: "DEMO_MODE gebuchter Wareneingang"
    },
    create: {
      id: "demo-goods-receipt-1",
      purchaseOrderId: "demo-po-receipt-frischemarkt",
      receivedById: "demo-shift-lead",
      receivedAt: now,
      note: "DEMO_MODE gebuchter Wareneingang"
    }
  });

  await upsertReceiptItemAndMovement(db, {
    receiptItemId: "demo-gri-tomaten",
    movementId: "demo-movement-receipt-tomaten",
    inventoryItemId: "demo-item-tomaten",
    quantity: 10,
    unit: "kg",
    storageLocationId: "demo-location-kuehlhaus",
    note: "DEMO_MODE Wareneingang Tomaten"
  });
  await upsertReceiptItemAndMovement(db, {
    receiptItemId: "demo-gri-mozzarella",
    movementId: "demo-movement-receipt-mozzarella",
    inventoryItemId: "demo-item-mozzarella",
    quantity: 5,
    unit: "kg",
    storageLocationId: "demo-location-kuehlhaus",
    note: "DEMO_MODE Wareneingang Mozzarella"
  });

  await db.inventoryMovement.upsert({
    where: { id: "demo-movement-withdrawal-1" },
    update: {
      idempotencyKey: "inventory.withdrawal.created:demo-movement-withdrawal-1",
      organizationId: "demo-organization-main",
      inventoryItemId: "demo-item-tomaten",
      type: "item_removed",
      quantity: 3,
      unit: "kg",
      actorUserId: "demo-staff",
      storageLocationId: "demo-location-kuehlhaus",
      note: "DEMO_MODE Verbrauch Küche"
    },
    create: {
      id: "demo-movement-withdrawal-1",
      idempotencyKey: "inventory.withdrawal.created:demo-movement-withdrawal-1",
      organizationId: "demo-organization-main",
      inventoryItemId: "demo-item-tomaten",
      type: "item_removed",
      quantity: 3,
      unit: "kg",
      actorUserId: "demo-staff",
      storageLocationId: "demo-location-kuehlhaus",
      note: "DEMO_MODE Verbrauch Küche",
      createdAt: now
    }
  });

  await upsertSnapshot(db, "demo-item-tomaten", "demo-location-kuehlhaus", 7, "kg", now);
  await upsertSnapshot(db, "demo-item-mozzarella", "demo-location-kuehlhaus", 5, "kg", now);

  await db.inventoryCorrectionRequest.upsert({
    where: { id: "demo-correction-request-1" },
    update: {
      inventoryItemId: "demo-item-tomaten",
      requestedById: "demo-staff",
      status: "open",
      expectedDelta: -1,
      unit: "kg",
      reason: "Inventurdifferenz Demo",
      relatedMovementId: null,
      reviewedById: null,
      reviewedAt: null
    },
    create: {
      id: "demo-correction-request-1",
      inventoryItemId: "demo-item-tomaten",
      requestedById: "demo-staff",
      status: "open",
      expectedDelta: -1,
      unit: "kg",
      reason: "Inventurdifferenz Demo"
    }
  });

  await db.workflowEvent.upsert({
    where: { id: "demo-workflow-event-correction-requested-1" },
    update: {
      type: "inventory.correction.requested",
      version: 1,
      source: "system",
      externalId: "demo-correction-request-1",
      idempotencyKey: "inventory.correction.requested:demo-correction-request-1",
      occurredAt: now,
      dataJson: {
        correctionRequestId: "demo-correction-request-1",
        inventoryItemId: "demo-item-tomaten",
        requestedById: "demo-staff",
        expectedDelta: -1,
        unit: "kg"
      },
      metadataJson: {
        correctionRequestId: "demo-correction-request-1"
      }
    },
    create: {
      id: "demo-workflow-event-correction-requested-1",
      type: "inventory.correction.requested",
      version: 1,
      source: "system",
      externalId: "demo-correction-request-1",
      idempotencyKey: "inventory.correction.requested:demo-correction-request-1",
      occurredAt: now,
      dataJson: {
        correctionRequestId: "demo-correction-request-1",
        inventoryItemId: "demo-item-tomaten",
        requestedById: "demo-staff",
        expectedDelta: -1,
        unit: "kg"
      },
      metadataJson: {
        correctionRequestId: "demo-correction-request-1"
      }
    }
  });

  await db.workflowTask.upsert({
    where: { id: "demo-review-task-correction-1" },
    update: {
      type: "inventory.correction_request",
      status: "open",
      severity: "warning",
      title: "Bestandskorrektur prüfen",
      description: "DEMO_MODE Tomaten: Korrektur um -1 kg angefordert.",
      workflowEventId: "demo-workflow-event-correction-requested-1",
      assignedRole: "admin",
      resolvedAt: null
    },
    create: {
      id: "demo-review-task-correction-1",
      type: "inventory.correction_request",
      status: "open",
      severity: "warning",
      title: "Bestandskorrektur prüfen",
      description: "DEMO_MODE Tomaten: Korrektur um -1 kg angefordert.",
      workflowEventId: "demo-workflow-event-correction-requested-1",
      assignedRole: "admin",
      createdAt: now
    }
  });
}

async function upsertPurchaseOrder(
  db: DemoSeedDatabaseClient,
  order: {
    id: string;
    supplierId: string;
    status: string;
    createdById: string;
    orderedAt: Date;
    note: string;
    items: Array<{
      id: string;
      inventoryItemId: string;
      orderedQty: number;
      receivedQty: number;
      unit: string;
    }>;
  }
): Promise<void> {
  await db.purchaseOrder.upsert({
    where: { id: order.id },
    update: {
      supplierId: order.supplierId,
      status: order.status,
      orderedAt: order.orderedAt,
      note: order.note
    },
    create: {
      id: order.id,
      supplierId: order.supplierId,
      status: order.status,
      createdById: order.createdById,
      orderedAt: order.orderedAt,
      note: order.note
    }
  });

  for (const item of order.items) {
    await db.purchaseOrderItem.upsert({
      where: { id: item.id },
      update: {
        purchaseOrderId: order.id,
        inventoryItemId: item.inventoryItemId,
        orderedQty: item.orderedQty,
        receivedQty: item.receivedQty,
        unit: item.unit,
        note: "DEMO_MODE"
      },
      create: {
        id: item.id,
        purchaseOrderId: order.id,
        inventoryItemId: item.inventoryItemId,
        orderedQty: item.orderedQty,
        receivedQty: item.receivedQty,
        unit: item.unit,
        note: "DEMO_MODE"
      }
    });
  }
}

async function upsertReceiptItemAndMovement(
  db: DemoSeedDatabaseClient,
  input: {
    receiptItemId: string;
    movementId: string;
    inventoryItemId: string;
    quantity: number;
    unit: string;
    storageLocationId: string;
    note: string;
  }
): Promise<void> {
  await db.goodsReceiptItem.upsert({
    where: { id: input.receiptItemId },
    update: {
      goodsReceiptId: "demo-goods-receipt-1",
      inventoryItemId: input.inventoryItemId,
      quantity: input.quantity,
      unit: input.unit,
      storageLocationId: input.storageLocationId,
      note: input.note
    },
    create: {
      id: input.receiptItemId,
      goodsReceiptId: "demo-goods-receipt-1",
      inventoryItemId: input.inventoryItemId,
      quantity: input.quantity,
      unit: input.unit,
      storageLocationId: input.storageLocationId,
      note: input.note
    }
  });

  await db.inventoryMovement.upsert({
    where: { id: input.movementId },
    update: {
      idempotencyKey: `inventory.goods_receipt.item_recorded:${input.receiptItemId}`,
      organizationId: "demo-organization-main",
      inventoryItemId: input.inventoryItemId,
      type: "goods_received",
      quantity: input.quantity,
      unit: input.unit,
      actorUserId: "demo-shift-lead",
      storageLocationId: input.storageLocationId,
      purchaseOrderId: "demo-po-receipt-frischemarkt",
      goodsReceiptId: "demo-goods-receipt-1",
      note: input.note
    },
    create: {
      id: input.movementId,
      idempotencyKey: `inventory.goods_receipt.item_recorded:${input.receiptItemId}`,
      organizationId: "demo-organization-main",
      inventoryItemId: input.inventoryItemId,
      type: "goods_received",
      quantity: input.quantity,
      unit: input.unit,
      actorUserId: "demo-shift-lead",
      storageLocationId: input.storageLocationId,
      purchaseOrderId: "demo-po-receipt-frischemarkt",
      goodsReceiptId: "demo-goods-receipt-1",
      note: input.note
    }
  });
}

async function upsertSnapshot(
  db: DemoSeedDatabaseClient,
  inventoryItemId: string,
  storageLocationId: string,
  quantity: number,
  unit: string,
  calculatedAt: Date
): Promise<void> {
  await db.inventoryStockSnapshot.upsert({
    where: {
      inventoryItemId_storageLocationId: {
        inventoryItemId,
        storageLocationId
      }
    },
    update: {
      quantity,
      unit,
      calculatedAt
    },
    create: {
      inventoryItemId,
      storageLocationId,
      quantity,
      unit,
      calculatedAt
    }
  });
}
