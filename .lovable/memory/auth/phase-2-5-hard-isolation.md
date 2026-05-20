---
name: Phase 2.5 — Hard Isolation Layer
description: Additive RLS policies (ws_scope_*) and frontend scopeQuery on critical hooks so reads/writes are workspace-scoped without breaking RBAC, sync triggers, or single-workspace UX.
type: feature
---

# Phase 2.5 — Hard Isolation Layer

Additive layer that closes cross-workspace leaks **without removing** any
existing policy, trigger, or calculation.

## DB (migration 20260520-115706)

Helpers (SECURITY DEFINER, granted to `authenticated`):
- `user_workspace_ids(uid)` → SETOF uuid of active memberships.
- `is_workspace_member(uid, ws)` → bool.
- `has_role_in_workspace(uid, role, ws)` → bool.

For each of: `service_orders`, `payment_orders`, `billing_invoices`,
`billing_attachments`, `billing_payments`, `billing_reconciliations`,
`financial_records`, `documents`, `fleet_trips`, `fleet_fuel_logs`:

- `ws_scope_select` — SELECT permitted when `workspace_id` is set and the
  user is a member of it.
- `ws_scope_insert` — INSERT WITH CHECK: if `workspace_id` is provided, it
  must belong to the user. NULL passes (trigger fills it).
- `ws_scope_update` — UPDATE USING + WITH CHECK, same rule.
- `ws_scope_delete` — DELETE USING, same rule.

These are **additive**: Postgres OR-combines permissive policies, so the
legacy `created_by`/`has_role` policies continue to grant access for
legacy rows where `workspace_id IS NULL`. Admin-global bypass via legacy
policies is still possible at the DB layer — that's removed in Phase 3 by
swapping `has_role(uid,'admin')` for `has_role_in_workspace(...)`.

## Frontend

`scopeQuery(q, table, workspaceId)` from `src/lib/workspaceScope.ts`
applied to list reads in:
- `useServiceOrders.ts` — query + queryKey includes `workspaceId` +
  realtime channel name includes workspaceId.
- `usePaymentOrders.ts` — query, queryKey, and `useFinancialSummary`.
- `useDashboardData.ts` — soQ/poQ/frQ/clientQ all scoped + queryKey.

Cache isolation: every protected query embeds `workspaceId` in its
`queryKey`, so switching workspaces yields a clean cache.

Realtime: `so-po-sync` channel renamed to `so-po-sync:${workspaceId}` to
prevent cross-workspace fan-out.

## What is intentionally NOT changed
- Triggers (`sync_so_status_from_po`, `sync_financial_records_from_orders`,
  `billing_invoices_propagate_status`) — untouched.
- Matching engine, distribution math, reconciliation logic.
- RBAC tables (`user_roles`, `permissions`, `role_permissions`).
- UI, menus, calculations, aggregations.

## Residual risk
- DB-level: admin-global still bypasses via legacy policies. Mitigated
  by frontend `scopeQuery`. Removed in Phase 3.
- Frontend: hooks not yet scoped (billing/fleet/profit/dashboard widgets)
  rely solely on the additive ws_scope_select policies + RBAC. Safe for
  single-workspace users; multi-workspace users may still see merged
  data in those screens until they're patched.
