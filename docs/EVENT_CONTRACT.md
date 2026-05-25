# Event Contract

## Purpose

The event contract defines the internal language of the system. External payloads may change, but internal events must stay stable, versioned, and testable.

## Base Event

```ts
export type WorkflowEventBase = {
  id: string;
  type: string;
  version: number;
  source: "gastronovi" | "manual_import" | "system";
  externalId?: string;
  idempotencyKey: string;
  businessDate?: string;
  occurredAt: string;
  importedAt: string;
  payloadRef?: string;
  metadata?: Record<string, unknown>;
};
```

## `pos.daily_closing.imported`

```ts
export type PosDailyClosingImportedEvent = WorkflowEventBase & {
  type: "pos.daily_closing.imported";
  version: 1;
  businessDate: string;
  data: {
    revenueGross?: number;
    revenueNet?: number;
    taxTotal?: number;
    receiptCount?: number;
    cancellationCount?: number;
    paymentMethods?: Array<{
      method: string;
      amount: number;
    }>;
  };
};
```

Workflow reactions:

- Generate daily revenue report.
- Check revenue variance.
- Mark missing payment methods.
- Request admin review for unusual values.

## `pos.item.sold`

```ts
export type PosItemSoldEvent = WorkflowEventBase & {
  type: "pos.item.sold";
  version: 1;
  data: {
    itemId: string;
    itemName: string;
    quantity: number;
    unit?: string;
    revenueGross?: number;
    revenueNet?: number;
    category?: string;
  };
};
```

Workflow reactions:

- Trigger inventory check.
- Prepare reorder suggestion.
- Update bestseller reporting.
- Mark unusual sales quantity.

## `pos.receipt.cancelled`

```ts
export type PosReceiptCancelledEvent = WorkflowEventBase & {
  type: "pos.receipt.cancelled";
  version: 1;
  data: {
    receiptId: string;
    amount: number;
    reason?: string;
    cancelledByExternalUserId?: string;
    cancellationType?: "full" | "partial" | "unknown";
  };
};
```

Workflow reactions:

- Create review task above threshold.
- Generate daily cancellation list.
- Mark missing reason.
- Persist audit entry.

## `pos.payment.difference.detected`

```ts
export type PosPaymentDifferenceDetectedEvent = WorkflowEventBase & {
  type: "pos.payment.difference.detected";
  version: 1;
  data: {
    expectedAmount: number;
    actualAmount: number;
    difference: number;
    paymentMethod?: string;
    severity: "info" | "warning" | "critical";
  };
};
```

Workflow reactions:

- Create admin review.
- Escalate critical difference.
- Request comment or receipt evidence.

## `pos.sync.failed`

```ts
export type PosSyncFailedEvent = WorkflowEventBase & {
  type: "pos.sync.failed";
  version: 1;
  data: {
    syncRunId: string;
    errorCode?: string;
    message: string;
    retryable: boolean;
    failedStage: "auth" | "fetch" | "store_raw" | "normalize" | "store_event" | "dispatch";
  };
};
```

Workflow reactions:

- Plan retry when `retryable` is `true`.
- Create admin alert.
- Mark import run as failed.
- Prevent silent failure.

## Versioning

Allowed in v1:

- Add optional fields.
- Add new event types.
- Extend metadata.

Not allowed without a new version:

- Remove required fields.
- Change field meaning.
- Change field type.
- Overwrite old events.
