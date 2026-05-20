---
name: Accounting Isolation
description: Every accounting record is scoped to workspace + user + year, never leaks between users
type: feature
---

# Accounting Isolation Contract

Accounting (Aluguéis, Despesas, Combustível, Compras, Governo, Retiradas) lives
inside the Financial page as a tab (`/financial?tab=accounting`).

Every row written to `financial_records` from the Accounting UI MUST carry:

- `workspace_id` — current active workspace (auto-filled by trigger
  `set_financial_records_workspace` from `app_users.workspace_id`)
- `user_id` — `auth.uid()` of the creator (enforced by
  `force_financial_records_auth_owner`)
- `year_reference` — auto-filled by trigger
  `set_financial_records_year_reference` from `created_at`
- `source = 'manual'` and `category IN ('rent','fuel','material','tax','salary','other')`

Reads use:
- `useAccountingModule(moduleKey, year)` — keyed on
  `[workspaceId, userId, year]`, filtered by `workspace_id` + optional
  `year_reference`.
- `useAccountingExpensesByPeriod(year)` — keyed on `[workspaceId, year]`,
  filtered by `workspace_id` + optional year window.

RLS policy `financial_records_accounting_isolation` blocks SELECT on manual
accounting rows unless caller is admin, partner, or one of
`user_id` / `assigned_user_id` / `created_by`. `ws_scope_select` still enforces
the workspace boundary.

Every accounting INSERT / UPDATE / DELETE is logged to `backend_event_logs`
with action `ACCOUNTING_<OP>` and payload `{workspace_id, user_id,
year_reference, category, amount}`.

Fuel is read-only and mirrors `fleet_fuel_logs` (single source of truth).
Edits to `useAccountingModule` must invalidate downstream caches via
`invalidateAccountingDownstream(qc)` in `src/lib/financialSync.ts` so
Technician Detail, Participation, and the reconciliation summary refresh in
the same tick.

The legacy `/accounting` route now redirects to `/financial?tab=accounting`.
