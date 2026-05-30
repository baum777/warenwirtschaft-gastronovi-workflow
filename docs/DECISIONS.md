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

## ADR-0006: Withdrawals reduce stock through movements

Status: accepted

Internal withdrawal records are represented as `InventoryMovement` rows with type `item_removed`. A withdrawal does not directly overwrite stock snapshots. The write path creates the movement and refreshes the derived `InventoryStockSnapshot` inside the same Prisma transaction. If the resulting stock is negative, the service creates an admin review task.

## ADR-0007: Corrections require review before stock changes

Status: accepted

Inventory corrections start as `InventoryCorrectionRequest` records and create an admin review task. Open requests do not create movements or refresh stock snapshots. Approval creates one `InventoryMovement` with type `correction_positive` or `correction_negative`, refreshes the derived snapshot in the same transaction, and marks the request approved. Rejection marks the request rejected without creating stock movement.

## ADR-0008: Inventory review tasks are admin-owned

Status: accepted

Inventory review tasks can be moved from `open` to `in_review`, `resolved`, or `dismissed` through admin-only actions. Resolving or dismissing a task sets `resolvedAt`. Closed review tasks cannot be reopened by this slice, and non-inventory workflow tasks remain outside the inventory action API.

## ADR-0009: Inventory items use admin-managed soft deactivation

Status: accepted

Inventory items are managed through admin-only APIs. Creating and editing item metadata does not create stock movements or stock snapshots. Items are deactivated by setting `isActive` to `false`; this slice does not hard-delete inventory items, preserving movement history and auditability.

## ADR-0010: Web MVP starts as a static app shell

Status: accepted

The first Warenwirtschaft web surface is a static `web/` app shell using browser-native HTML, CSS, and JavaScript. It avoids adding a frontend build dependency before the backend workflows stabilize. API requests send the explicit `x-actor-id` and `x-actor-role` headers, and the UI remains separated from backend domain services.

## ADR-0011: Supabase Postgres is the canonical database

Status: accepted

Runtime and browser validation use Supabase Postgres as the canonical persistence target. Local Postgres is only an optional fallback when explicitly approved and configured; agents must not create local Postgres roles, users, or databases by default.

The app/runtime reads `DATABASE_URL`, and Prisma direct workflows read `DIRECT_URL`. Both values must come from the Supabase dashboard and stay in `.env` or another secret-owned environment surface, never in git. DB-backed validation is blocked until the Supabase-backed URLs are present and Prisma can connect.

## ADR-0012: Role-based UX extends the DB-backed inventory path

Status: accepted

Role-based workspace UX must build on the current DB-backed inventory services and migrations. Separate in-memory movement routes or replacement static UI shells are not canonical once the database-backed Warenwirtschaft slice exists. Future role and workspace changes require explicit Prisma migrations, route-level authorization updates, and web-shell integration on top of the existing admin workflow.

## ADR-0017: Runtime database role must enforce RLS

Status: accepted

Direct Prisma connections must not rely on the Supabase `authenticated` PostgREST role model. The application uses direct Postgres connections, so production runtime access needs a database role that cannot bypass row-level security.

The `app_runtime` role is the proven RLS execution context for Cockpit-owned application tables. It is constrained with `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEROLE`, and `NOCREATEDB`, and has only the table privileges required by the inventory auth foundation.

The completed proof run verified all required checks:

| Check | Result |
| --- | --- |
| Request without token | `401` |
| Valid token without `OrganizationMember` | `403` |
| Valid token with membership | `200` |
| User A reads rows from Org B under `app_runtime` | `0 rows` |
| User B reads rows from Org A under `app_runtime` | `0 rows` |

`app_runtime` is currently a `NOLOGIN` proof role. Production cutover requires a dedicated `LOGIN` runtime role, such as `app_user`, with `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEROLE`, and `NOCREATEDB`, granted membership in `app_runtime`. The generated password must remain in secret-owned environment configuration and must never be committed.
