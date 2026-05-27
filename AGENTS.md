# AGENTS.md

Repository-wide instructions for AI coding agents working on `warenwirtschaft-gastronovi-workflow`.

## Database / Persistence

- Canonical database: Supabase Postgres.
- Local Postgres is only an optional development fallback when explicitly approved and configured.
- Do not assume a local Postgres role/database exists.
- Do not create local DB users, roles, or databases without explicit approval.
- Runtime validation must use a valid Supabase-backed `DATABASE_URL`.
- Secrets must stay out of git. Only `.env.example` may contain placeholders.

## Environment

Required local env vars:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
```

- `DATABASE_URL` is used by the app/runtime.
- `DIRECT_URL` is used for Prisma CLI/migrations when a direct connection is required.
- Use Supabase dashboard-provided connection strings; do not invent credentials.

## Prisma / Supabase Rules

- Keep Prisma provider as `postgresql`.
- Use Supabase Postgres as the source of truth for schema validation.
- Prefer Supabase connection pooling for runtime connections.
- Use a direct DB URL for migration workflows where Prisma requires a direct connection.
- Before browser/runtime validation, confirm `.env` exists and contains valid Supabase values.

## Validation Gate

A DB-backed browser flow is only runnable when:

1. `.env` exists.
2. `DATABASE_URL` points to Supabase.
3. `DIRECT_URL` points to Supabase.
4. Prisma can connect successfully.
5. The app can create/read/list DB-backed records.

If these are missing, report `blocked` and request valid Supabase credentials instead of attempting local Postgres setup.

## Local DB Test Runs

Supabase is the canonical target database.

For local test/runtime validation, agents may set up a local PostgreSQL database when explicitly approved.

Approved local test defaults:

```env
DATABASE_URL="postgresql://gastronovi_dev:gastronovi_dev@127.0.0.1:5432/gastronovi_workflow_adapter"
DIRECT_URL="postgresql://gastronovi_dev:gastronovi_dev@127.0.0.1:5432/gastronovi_workflow_adapter"
```

Rules:

- Local DB credentials may be written to local `.env`.
- Never commit `.env`.
- `.env.example` must only contain placeholders.
- Local DB is for test runs only.
- Supabase remains the production/source-of-truth DB target.
