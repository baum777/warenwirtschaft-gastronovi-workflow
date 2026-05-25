# Decisions

## ADR-0001: Bootstrap with Fastify

Status: accepted

Use Fastify for the HTTP layer. The adapter needs a small, explicit API surface and does not need a larger application framework for the Ticket 1 bootstrap.

## ADR-0002: Read-only POS posture in v1

Status: accepted

The adapter must not write back to Gastronovi, HOTAPI-adjacent systems, or accounting systems in v1. External POS data is imported as source material and becomes internal workflow truth only after raw storage, normalization, idempotent event storage, and audit.

## ADR-0003: No live connector in Ticket 1

Status: accepted

Ticket 1 creates the service skeleton, health route, env validation, Prisma schema, and docs. Live Gastronovi access, ingestion, normalization, rules, scheduled jobs, and admin APIs are deferred until real source access, payload samples, and tenant rules are available.

## ADR-0004: Ticket 2 stores raw payloads only

Status: accepted

Ticket 2 persists external payloads as raw JSON with a deterministic SHA-256 hash and sync-run linkage. It does not normalize, dispatch workflow events, apply business rules, expose admin lists, or call live Gastronovi endpoints.

## ADR-0005: Inventory-1 adds schema only

Status: accepted

Inventory-1 introduces inventory, supplier, purchase order, goods receipt, movement, stock snapshot, and correction request tables in Prisma. It does not add inventory APIs, stock calculation logic, review-task generation, POS consumption mapping, or automatic stock changes.
