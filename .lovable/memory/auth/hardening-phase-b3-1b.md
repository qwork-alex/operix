---
name: RBAC Hardening Phase B3.1b
description: Safe user deletion — canonical ownership map RPC + edge function gates by NOT-NULL "blocking" refs only; nulls all 3 financial_records owner columns to clear orphan auto-synced revenue.
type: feature
---

# Phase B3.1b — Ownership Cleanup + Safe Deletion

## Problem
After deleting all SO/PO of test4/test5, deletion still failed:
- 6 orphan `financial_records` (auto-synced revenue, `service_order_id`/`payment_order_id` already NULL)
- 12 `user_permissions`, 6 `notifications`, 2 `technicians`, identity rows
- Edge function `delete_user` blocked on ANY `has_dependencies` even though all remaining refs were nullable.
- Cleanup nulled only `financial_records.created_by`, leaving `user_id`/`assigned_user_id` set → final dep check still saw rows → block.

## Changes
### DB
| Object | Change |
|---|---|
| `public.get_user_ownership_map(uuid) → jsonb` | New canonical map. Splits refs into **blocking** (NOT-NULL ownership in SO/PO), **detachable** (nullable owner cols across financial_records, clients, documents, fleet_*, profit_*, partner_clients), **identity** (notifications, user_permissions, user_roles, technicians, profiles, user_settings, user_usage, memberships, app_users). `STABLE SECURITY DEFINER`, EXECUTE granted to `authenticated` only. |

### Edge function `admin-create-user`
| Action | Change |
|---|---|
| `collectDependencies` | Now calls `get_user_ownership_map` instead of N round-trips. Returns `blocking`, `detachable`, `identity`, plus full `map` for UI. |
| `delete_user` (block mode) | Refuses ONLY when `blocking > 0` (was: any `has_dependencies`). Detachable refs cleaned automatically. |
| `delete_user` (detach mode) | Always allowed when `blocking == 0` (was: refused when `has_dependencies`). |
| `delete_user` cleanup | Nulls ALL 3 financial_records owner columns (`created_by`, `user_id`, `assigned_user_id`). Also nulls clients, profit_rules, profit_distributions, drivers, fleet_fuel_logs. |

## Safe deletion contract
1. Admin calls `check_user_dependencies` → gets the map.
2. If `blocking > 0` (SO/PO with NOT-NULL `user_id`/`assigned_user_id` referencing the user) → must `reassign` to another user.
3. Otherwise `block` (default) or `detach` succeeds:
   - all detachable owner columns are nulled (history preserved, rows kept)
   - identity rows hard-deleted (memberships, app_users, profile, role, permissions, notifications, technicians, user_settings, user_usage)
   - auth user deleted
4. System owner (`qwork@qworkgroup.com`) is always protected.

## Reversible
```sql
DROP FUNCTION public.get_user_ownership_map(uuid);
-- restore old `delete_user` block by reverting edge function file
```

## Validated
Logged in `rls_validation_logs` with phase='B3.1b'. Manual test: admin can now remove test4/test5 via UI without "registros financeiros associados" popup.

## Next
B3.2: tighten SELECT on `documents`, `profit_*`, `reconciliations` (currently rely on `row_in_scope` and `has_role`).
