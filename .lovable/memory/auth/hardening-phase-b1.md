---
name: RBAC Hardening Phase B1
description: Canonical RBAC helper functions (is_order_visible, is_order_writable, owner_filter_uids, assert_active). Zero policy changes — foundation for B2/B3.
type: feature
---

# Phase B1 — Canonical RBAC Helpers

## Status
Applied. No RLS policy changed. No trigger changed. No FE changed.
Reversible: `DROP FUNCTION public.is_order_visible(uuid,uuid,uuid,uuid), public.is_order_writable(uuid,uuid), public.owner_filter_uids(uuid), public.assert_active(uuid);`

## Functions added (all `STABLE SECURITY DEFINER`, granted to `authenticated` only)

| Function | Returns | Purpose |
|---|---|---|
| `is_order_visible(uid, user_id, assigned, created_by)` | bool | Single rule for SO/PO/financial visibility. Active + (admin/partner OR uid match in any of the 3 owner cols). |
| `is_order_writable(uid, user_id)` | bool | Active + (admin/partner OR `user_id=uid`). |
| `owner_filter_uids(uid)` | uuid[] | `[uid]` for normal users; `NULL` for admin/partner (= no filter). Future: expand to teams. |
| `assert_active(uid)` | void | RAISE if banned/null. For triggers. |

## Usage roadmap
- **B2 (next)**: trigger consolidation (`set_*_user_from_auth` + `force_*_auth_owner` + `normalize_order_owner` → 1 trigger/table).
- **B3**: tighten SELECT on `clients`, `financial_records`, `technicians`, profit/reconciliation tables — use `is_order_visible` + `is_user_active`.
- **B4**: FE migrates to `useUserContext`; `applyScope` removed; SO/PO queries stop double-filtering.

## Validation
Linter: 83 → 79 issues. The 4 new helpers add zero warnings (PUBLIC/anon EXECUTE revoked).
Log row inserted in `rls_validation_logs` with phase='B1'.
