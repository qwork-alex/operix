---
name: RBAC Hardening Phase B3.1
description: Surgical RLS fixes — discrepancies/financial_records sync triggers as SECURITY DEFINER (fixes save error); clients & technicians SELECT scoped (closes data leak).
type: feature
---

# Phase B3.1 — Surgical RLS Fixes

## Why
- Technicians/partners could extract/edit but **not save** SO/PO. Error: `new row violates row-level security policy for table "discrepancies"`. Cause: `sync_discrepancy_for_service_order` and `run_discrepancy_sync_trigger` were not `SECURITY DEFINER` → ran as the calling user, who has no INSERT policy on `discrepancies`.
- `clients_select_authenticated` allowed any authenticated user to see ALL clients (test4 saw test5's data).
- `tech_select_scoped` granted SELECT to anyone with a "view" permission on users/SO/PO/financial/fleet — way too broad.

## Changes
| Object | Change |
|---|---|
| `sync_discrepancy_for_service_order(uuid)` | Now `SECURITY DEFINER`. EXECUTE revoked from PUBLIC/anon, granted to `authenticated`. |
| `run_discrepancy_sync_trigger()` | Now `SECURITY DEFINER`. EXECUTE locked. |
| `sync_financial_records_from_orders()` | Now `SECURITY DEFINER` (same root cause for financial_records inserts). Also propagates `user_id`/`assigned_user_id` from the source order. |
| `clients` SELECT policy | `clients_select_authenticated` → `clients_select_scoped`. Visible only to admin/partner OR `user_id`/`created_by` match OR `can_access_client` (partner_clients/technician_clients link). |
| `clients` INSERT policy | `clients_insert_authenticated` → `clients_insert_scoped`. Requires `is_user_active(auth.uid())`. |
| `technicians` SELECT policy | `tech_select_scoped` rewritten. Visible only to admin/partner OR own row OR partners through technician_clients↔partner_clients link. |

## Reversible
```sql
-- restore previous policies
DROP POLICY clients_select_scoped ON public.clients;
CREATE POLICY clients_select_authenticated ON public.clients FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
-- (analogous for technicians + INSERT)
-- to revert SECURITY DEFINER: recreate functions without it
```

## Validated
Row inserted in `rls_validation_logs` with phase='B3.1'.
Smoke tests in `supabase/tests/b3_1_smoke.sql`.

## Next
B3.2: review `documents`, `profit_*`, `reconciliations` SELECT for scope tightening (currently rely on `row_in_scope` and `has_role`).
