# Architecture

## Principle

The adapter is an anti-corruption layer between external POS systems and internal workflow logic.

Gastronovi-adjacent data can change in structure, availability, permissions, tenant logic, or detail level. Internal workflow logic must not depend on those external shapes. Every external payload is stored first as raw data and translated later into an internal, versioned event.

## Layers

### 1. Source Connector

The source connector owns external authentication, endpoint structure, export formats, pagination, rate limits, and technical error classification.

It does not make business decisions.

### 2. Raw Payload Store

Every incoming payload is stored before business processing.

Reasons:

- Debugging.
- Audit.
- Reprocessing.
- Traceability.
- Protection from silent data changes.

### 3. Normalizer

The normalizer translates external data into internal events.

It decides whether an external record creates an internal event, is discarded, or must be escalated as a failed import case.

### 4. Workflow Event Store

The event store contains only normalized events. These events are the basis for rules, tasks, reports, and later automation.

Events are immutable. Corrections are represented by new events.

### 5. Rules Engine

The rules engine evaluates events against defined rules.

Examples:

- Missing daily closing creates an admin task.
- Cancellation above a threshold requires review.
- Strong item sales trigger inventory checks.
- Sync failures prepare retry and alert workflows.

### 6. Task / Alert / Approval Layer

This layer creates visible work items. It does not decide business truth.

## Data Flow

```txt
1. Sync starts
2. Connector fetches external data
3. Raw payload is stored
4. Normalizer validates payload
5. Workflow event is created
6. Event is stored idempotently
7. Rules engine evaluates the event
8. Task, alert, or approval is created
9. Audit log records the process
```

## Idempotency

Every external payload needs a stable key:

```txt
source + externalEntityType + externalId + businessDate + eventType
```

If an event already exists, it must not be processed twice. Changed data creates either a new version or a `source.payload.changed` event.

## Error Policy

| Error type | Example | Reaction |
| --- | --- | --- |
| Technical | API unavailable | Retry and `pos.sync.failed` |
| Structural | Required field missing | Block payload and request review |
| Business | Cancellation without reason | Store event and create review task |
| Governance | Unclear source authority | Fail closed |

## Security Boundary

API keys and tenant information must never appear in logs, events, tasks, UI responses, or reports.

Raw payloads may contain sensitive operational data. They must be redacted before they are exposed outside backend-owned storage.

## Open Decisions

| Decision | Options | Default v1 |
| --- | --- | --- |
| Ingestion mode | Polling, webhook, file import | Polling plus manual reprocess later |
| Workflow orchestration | Internal, n8n, hybrid | Hybrid later |
| Event store | Relational, Kafka, EventStoreDB | PostgreSQL relational |
| Audit write failure | Fail request, outbox | Fail closed for critical events |
| Dashboard | Own UI, API-only | API-only v1 |
