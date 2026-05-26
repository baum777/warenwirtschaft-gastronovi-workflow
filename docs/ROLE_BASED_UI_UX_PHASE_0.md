# Role-Based UI/UX and Phase 0 Governance

## Scope

This repository implements the Phase 0 governance foundation plus a static MVP web surface for role-based Warenwirtschaft workflows.

Implemented surfaces:

- `web/index.html`, `web/app.js`, `web/styles.css`
- `GET /inventory/items`
- `POST /movements`
- `POST /movements/sync`
- Prisma schema fields for role, workspace, movement sync status, conflict reason, and versioned stock rows

## Roles

| Role | Scope |
| --- | --- |
| `ADMIN` | All workspaces, dashboard, conflict and correction overview |
| `AREA_LEAD` | Assigned workspaces, review and correction workflow |
| `STAFF` | Assigned workspaces, mobile-first quick actions |

Staff users must not read or write unassigned workspace inventory. UI filtering is a convenience layer only; backend routes enforce actor and workspace checks.

## Workspace Taxonomy

Canonical workspace codes:

- `SERVICE`
- `HOTEL`
- `KITCHEN`

Inventory items carry `workspace`, `category`, and optional `subcategory` so role and workspace filters can be enforced before UI rendering or booking.

## Movement Semantics

Inventory movement requests use client-facing types:

- `IN`
- `OUT`
- `CORRECTION_POSITIVE`
- `CORRECTION_NEGATIVE`

Stored movement types remain compatible with the existing schema naming:

- `goods_received`
- `item_removed`
- `correction_positive`
- `correction_negative`

Accepted movements update versioned stock rows. Conflicts and rejections are recorded as movement attempts with `syncStatus` and `conflictReason`.

## Conflict Rules

The current Phase 0 service returns:

- `ACCEPTED` when the movement is authorized and stock validation passes
- `CONFLICT` for stale stock versions, unit mismatch, inactive items, or insufficient staff stock
- `REJECTED` for forbidden actor/workspace/action combinations

Negative stock from normal `STAFF` removal is not silently accepted.

## Static Web Surface

The web MVP is intentionally dependency-free:

- Role switcher for `ADMIN`, `AREA_LEAD`, `STAFF`
- Workspace overlay with role-aware options
- Staff quick actions for goods received, item removed, stock check, recent items, and queue status
- Admin and area lead cockpit views with KPIs, action center, critical stock, and review panels
- Governance view marking inventory as Post-MVP

The UI uses local demo data by default. If `ww.apiBase` is set in local storage, the offline queue sync calls `POST /movements/sync` with `x-actor-id` and `x-actor-role`.

## Deferred

- DB-backed movement repository
- Full inventory module and approval workflow
- Real authentication replacing header actor simulation
- Full supplier, purchase order, and inventory count workflows
- Live Gastronovi synchronization
