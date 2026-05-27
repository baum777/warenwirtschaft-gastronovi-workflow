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

Live Gastronovi access, HTTP ingestion routes, normalization, rules, queues, scheduled jobs, and admin APIs are intentionally out of scope for the current slice.

## Local Commands

```bash
npm install
npm run dev
npm run typecheck
npm test -- --run
npm run build
npx prisma validate
```

## Environment

Copy `.env.example` to `.env` for local development and replace every placeholder with values from the Supabase dashboard.

Supabase Postgres is the canonical database for this repo. Do not assume a local Postgres role or database exists, and do not create local DB users, roles, or databases without explicit approval.

Required database variables:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
```

- `DATABASE_URL` is used by the app/runtime. Prefer the Supabase/Supavisor pooled connection string for runtime connections.
- `DIRECT_URL` is used by Prisma CLI and migration workflows when a direct connection is required.
- Use dashboard-provided Supabase connection strings. Do not invent credentials.
- Keep real values in `.env` only. `.env.example` must contain placeholders only.
- Production Redis must be configured with either `REDIS_URL` or both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

DB-backed browser/runtime validation is runnable only when `.env` exists, both database URLs point to Supabase, Prisma can connect successfully, and the app can create/read/list DB-backed records. If those inputs are missing, the correct result is `blocked` pending valid Supabase credentials, not local Postgres admin setup.

Secrets must stay backend-owned. API keys, tenant identifiers, tokens, and raw secret-bearing payloads must not be logged or exposed in API responses.
