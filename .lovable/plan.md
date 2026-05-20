# Accounting Refactor — Safe Migration into Financial

Move the standalone Accounting module inside the Financial page as a new tab, and enforce strict per-user / per-workspace / per-year isolation for every accounting record.

## New Financial structure

```text
Financial
├── Confronto          (existing)
├── Detalhamento       (existing — Technician Detail)
├── Participação       (existing)
├── Auditoria          (existing)
└── Contabilidade      (NEW — embeds AccountingControlCenter)
```

`/profit-distribution` ("Distribution") stays as its own route — the spec lists it under Financial in concept, but it already lives outside and removing it would be a destructive change. We keep the existing route untouched and only add a cross-link from the new Accounting tab.

## Isolation contract (the core of this phase)

Every row in `financial_records` written through the Accounting UI MUST carry:

- `workspace_id` = current active workspace (from `WorkspaceProvider`)
- `user_id` = `auth.uid()` of the creator (already enforced by `force_financial_records_auth_owner` trigger)
- `year_reference` = year of the entry's effective date (NEW: auto-filled from `created_at` if missing)
- `visibility_scope` = `'private'` by default for manual entries (existing column, currently unused for accounting)

Read paths (`useAccountingModule`, `useAccountingExpensesByPeriod`) must filter by:

```
workspace_id = activeWorkspaceId
AND (
  user_id = auth.uid()               -- own entries
  OR has_role(auth.uid(),'admin')    -- admins see all in workspace
  OR has_role(auth.uid(),'partner')  -- partners see all in workspace
)
AND (year_reference = selectedYear OR selectedYear IS NULL)
```

This guarantees a technician never sees another technician's expenses, fuel, withdrawals, etc. — even within the same workspace.

## Technical plan

### 1. Database (single migration)

- Backfill `year_reference` for existing `financial_records` rows where NULL (`extract(year from created_at)`).
- Add trigger `set_financial_records_year_reference` BEFORE INSERT/UPDATE: if NULL, set to `extract(year from coalesce(NEW.created_at, now()))`.
- Add trigger `set_financial_records_workspace` BEFORE INSERT: if `workspace_id` is NULL, resolve from the caller's active workspace via `app_users.workspace_id` (best-effort; raise if still NULL for accounting `source IN ('manual','manual_financial')`).
- Tighten SELECT RLS: add a new policy `financial_records_accounting_isolation` that, for rows with `source IN ('manual','manual_financial')` and `category IN ('rent','fuel','material','tax','salary','other')`, requires `user_id = auth.uid()` unless caller is admin/partner. Existing `ws_scope_select` continues to enforce the workspace boundary.
- Index `(workspace_id, user_id, category, year_reference)` for the new filtered reads.

### 2. Frontend — Financial tab integration

- `src/pages/FinancialPage.tsx`: add a 5th `<TabsTrigger value="accounting">` with `BookOpen` icon and i18n key `fin.tabs.accounting`. New `<TabsContent value="accounting">` renders `<AccountingControlCenter embedded />`.
- `src/components/accounting/AccountingControlCenter.tsx`: accept an `embedded?: boolean` prop. When `embedded`, drop the page header ("Centro de Controle") so it sits cleanly inside the Financial shell. Add a year selector chip (current year default) wired to the new `year` query param.
- `src/hooks/useLanguage.tsx`: add `fin.tabs.accounting` for all 12 locales.

### 3. Frontend — isolation enforcement in hooks

- `src/components/accounting/useAccountingModules.ts`:
  - import `useWorkspace` + `useAuth`; bail out gracefully if no `workspaceId`.
  - All SELECTs add `.eq('workspace_id', wsId)` + year filter; insert payloads now include `workspace_id` and `year_reference` (driven by selected year).
  - Query key extended with `[wsId, year]` so caches don't leak across workspaces / years / users.
- `src/hooks/useAccountingExpensesByPeriod.ts`: same scoping — adds `workspace_id` and `user_id` (when non-admin) filters; query key keyed on `[wsId, role]`.

### 4. Sync into the rest of Financial

No new code needed — existing flows already react:

- Technician Detail (`useTechnicianEarnings`) already reads `financial_records` filtered by `assigned_user_id`; the new trigger guarantees that column is the owner.
- Participation (`useParticipationLedger`) reads `participation_ledger` derived from `service_order_distributions` — unaffected.
- Financial summaries (`useReconciliationSummary` → `s.expenses`) already aggregates `financial_records`; with the workspace filter applied at the RLS level it stays correct per workspace.

We add a single helper `src/lib/financialSync.ts` that exposes `invalidateAccountingDownstream(qc)` and is called from every Accounting mutation success so Technician Detail / Overview / Participation charts refresh in the same tick.

### 5. Legacy `/accounting` route

- Keep the standalone route as a thin redirect to `/financial?tab=accounting` (preserves bookmarks).
- Sidebar entry `t("nav.accounting")` is removed; Financial entry stays.

### 6. Logging & validation

- New trigger logs every accounting INSERT/UPDATE/DELETE to `backend_event_logs` with `table_name='financial_records'`, `action='ACCOUNTING_*'`, payload including `{workspace_id, user_id, year_reference, category, amount}`.
- After migration, run the audit script `/mnt/documents/accounting_isolation_report.md`:
  - count rows missing `workspace_id` / `year_reference`
  - confirm zero cross-user leakage by simulating two users with `set local request.jwt.claim.sub`
  - confirm summary totals match pre-migration totals per workspace

## Files touched

```text
supabase/migrations/<ts>_accounting_isolation.sql           [NEW]
src/pages/FinancialPage.tsx                                  [edit]
src/components/accounting/AccountingControlCenter.tsx        [edit — add embedded prop + year selector]
src/components/accounting/useAccountingModules.ts            [edit — workspace/year/user scoping]
src/hooks/useAccountingExpensesByPeriod.ts                   [edit — workspace/user scoping]
src/hooks/useLanguage.tsx                                    [edit — fin.tabs.accounting + year labels]
src/lib/financialSync.ts                                     [NEW — shared invalidator]
src/App.tsx                                                  [edit — /accounting → redirect]
src/components/layout/AppSidebar.tsx                         [edit — remove top-level Contabilidade]
.lovable/memory/features/financeiro/accounting-isolation.md  [NEW — rule]
.lovable/memory/index.md                                     [edit — add reference]
```

## Guardrails (will NOT change)

- Billing calculations, OS↔OP matching, participation math, distribution snapshots.
- Existing RLS on `service_orders` / `payment_orders` / `billing_invoices`.
- Operational modules (Fleet, Service Orders, Payment Orders).
- The single source of truth in `src/lib/distributionMath.ts`.

## Deliverables

1. Migration applied with backfill + triggers + new RLS policy.
2. New Accounting tab inside Financial with year selector.
3. Hooks scoped to workspace + user + year.
4. Isolation audit report at `/mnt/documents/accounting_isolation_report.md`.
5. Memory rule documenting the new contract.
