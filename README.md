# gastronovi-workflow-adapter

`gastronovi-workflow-adapter` is an independent backend service for moving Gastronovi-adjacent POS data into internal workflow logic.

External POS data is not treated as operational truth directly. Payloads are imported, normalized, versioned, and only then processed as internal workflow events.

## Goals

The repository separates three responsibilities:

1. Ingestion: receive or fetch external data.
2. Normalization: translate external payloads into internal event contracts.
3. Workflow dispatch: validate, store, and trigger follow-up actions from events.

This keeps workflow apps, admin dashboards, and orchestrators from depending on Gastronovi-specific APIs or payload shapes.

## Non-Goals in v1

- No full POS dashboard.
- No replacement for Gastronovi Office.
- No direct accounting logic.
- No automatic decision without audit trail.
- No assumption that all required Gastronovi endpoints are publicly available.
- No writeback to Gastronovi or HOTAPI-adjacent systems.

## Architecture

```txt
Gastronovi / HOTAPI / Export / Webhook
        |
Source Connector
        |
Raw Payload Store
        |
Normalizer
        |
Workflow Event Store
        |
Rules Engine
        |
Tasks / Alerts / Approvals / Reports
```

## Technical Defaults

```txt
Runtime:        Node.js + TypeScript
HTTP Layer:     Fastify
Validation:     Zod
Database:       PostgreSQL
ORM:            Prisma
Queue:          BullMQ + Redis later
Testing:        Vitest
Docs:           Markdown
```

## Current v1 Scope

This starter contains the Ticket 1 baseline plus the Ticket 2 raw-ingestion core:

- Fastify service bootstrap.
- `GET /health`.
- Zod environment validation.
- Prisma schema draft.
- Architecture and event contract docs.
- Deterministic raw payload hashing.
- Raw payload repository boundary.
- Sync run repository boundary.
- Ingestion service that stores raw payloads and detects duplicate hashes.
- Phase 0 inventory governance contracts for roles, workspace access, append-only movement attempts, sync status, and conflict handling.
- A dependency-free static `web/` MVP surface for role-based inventory workflows.

Live Gastronovi access, HTTP ingestion routes, normalization, rules, queues, scheduled jobs, and admin APIs are intentionally out of scope for the current slice.

The current inventory routes use an in-memory local/demo repository. They prove API shape and governance behavior, but require a DB-backed repository before production use.

## Local Commands

```bash
npm install
npm run dev
npm run typecheck
npm test -- --run
npm run build
npx prisma validate
node --check web/app.js
```

## Environment

Copy `.env.example` to `.env` for local development. `DATABASE_URL` and `REDIS_URL` may use local defaults in development, but production requires explicit values.

Secrets must stay backend-owned. API keys, tenant identifiers, tokens, and raw secret-bearing payloads must not be logged or exposed in API responses.
