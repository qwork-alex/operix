---
name: RBAC Hardening Phase B2
description: Consolidated owner triggers on service_orders, payment_orders, financial_records. Fixed assignment-loss bug (assigned_user_id now independent of user_id).
type: feature
---

# Phase B2 — Owner Trigger Consolidation

## Status
Applied. Reversible by re-creating dropped triggers from prior migrations.

## What changed

### Bug fixed: "assignments disappear"
`apply_order_owner` and `normalize_order_owner` previously did `assigned_user_id := user_id` on every UPDATE, collapsing the two columns. Result: when an admin edited an SO/PO without resending `assigned_user_id`, the technician assignment was overwritten to the admin's `user_id`.

**New rule:** `user_id` and `assigned_user_id` are resolved **independently**:
- INSERT (admin/partner): each col defaults from caller payload, falls back to the other, then to `auth.uid()`.
- INSERT (normal): both forced to `auth.uid()`.
- UPDATE (admin/partner): each col preserves OLD when NEW is NULL.
- UPDATE (normal): ownership locked to OLD; non-admins cannot reassign.

### Triggers consolidated (per table)
| Table | Removed | Now using |
|---|---|---|
| `service_orders` | `force_service_orders_auth_owner_trigger`, `trg_set_created_by_service_orders` | `trg_apply_owner_service_orders` → `trg_apply_order_owner_so_po()` |
| `payment_orders` | `force_payment_orders_auth_owner_trigger`, `trg_set_created_by_payment_orders` | `trg_apply_owner_payment_orders` → `trg_apply_order_owner_so_po()` |
| `financial_records` | `force_financial_records_auth_owner_trigger`, `set_user_id_financial_records`, `trg_set_created_by_financial_records` | `trg_apply_owner_financial_records` → `trg_apply_owner_financial_records()` |

All other triggers (audit, sync_so_status_from_po, sync_financial_records_from_orders, link_payment_to_service, notifications) **untouched**.

## Out of scope (deferred)
- `clients`, `company_settings`: still use legacy `force_*` + `set_*_user_from_auth` pair. To be consolidated in B2.1 if needed.
- RLS policy changes → Phase B3.
- FE `applyScope` removal → Phase B4.

## Validation
Linter: 79 → 81 (no new criticals; 2 SECURITY DEFINER warns expected — `EXECUTE` revoked from `anon`/`PUBLIC`).
Log row inserted in `rls_validation_logs` with phase='B2'.

## Smoke tests to run manually
1. Admin edits an SO that belongs to technician X without changing `assigned_user_id` → assignment to X must persist.
2. Technician inserts an SO → both `user_id` and `assigned_user_id` = self uid.
3. Admin reassigns an SO to technician Y by setting `assigned_user_id=Y` → only `assigned_user_id` changes; `user_id` preserved.
4. Technician update → cannot change `user_id`/`assigned_user_id` (locked to OLD).
