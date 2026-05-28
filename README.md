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

<!-- workspace-root-sync:readme:start -->
## Workspace Integration

This repository lives under `/home/baum/Schreibtisch/workspace/main_projects`. Its local `README.md`, `AGENTS.md`, `docs/`, manifests, contracts, validators, tests, and workflow files remain the authority for repo-specific product, runtime, archive, and implementation truth.

The workspace root is a routing and orientation layer. It points agents and humans to the correct authority surface; it must not be treated as a replacement for this repository's local truth.

### Workspace Work Path

```text
frontdoor -> authority check -> scope check -> reusable-surface check -> smallest safe work -> verification -> evidence / next gate
```

When work enters from the workspace root:

1. Read root `README.md` and root `AGENTS.md`.
2. Read this repository's `README.md`, `AGENTS.md`, and relevant local docs or contracts.
3. Identify the owning authority, scope, next gate, expected write targets, and validation path.
4. Check whether existing repo-local or shared-core assets already cover the task.
5. Make the smallest safe change and verify it locally.
6. Close with evidence, unresolved gaps, and the next re-entry pointer.

### Cross-Repo And Reusable Work

- Use portfolio surfaces for workspace inventory, cross-repo coordination, intake, disposition, daily notes, commit evidence, and re-entry tracking.
- Use `model-agnostic-workflow-system/` for reusable skills, contracts, templates, validators, provider exports, and workflow routing patterns.
- Do not duplicate root, portfolio, shared-core, or chat-room governance here unless this repository deliberately adopts a local copy.
- If this repository is `model-agnostic-workflow-system`, its own `AGENTS.md` and `WORKFLOW.md` are the local shared-core authority before reusable behavior is exported elsewhere.

### Evidence And Closure

Close meaningful work with:

- `Observed` facts from exact paths or commands;
- `Inferred` conclusions clearly labelled;
- `Applied` changes with exact paths;
- `Verified` checks or read-backs;
- `BLOCKED` items where authority, source, scope, validation, or permissions are insufficient;
- the next gate or re-entry pointer.

Do not treat summaries, imports, chat notes, MSPR packets, loose docs, archives, or derived knowledge as canonical truth until the owning surface has reviewed and promoted them.
<!-- workspace-root-sync:readme:end -->
