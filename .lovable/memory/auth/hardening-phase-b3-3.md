---
name: B3.3 — DELETE ACL alignment + silent-failure fix
description: Replaces admin-only DELETE policies with permission+scope-driven rules and forces frontend to validate rows affected.
type: feature
---

# Phase B3.3 — DELETE alignment

## Backend
- `service_orders.so_delete_admin` → `so_delete_rbac`
- `payment_orders.po_delete_admin` → `po_delete_rbac`
- `financial_records.financial_records_delete_admin_only` → `financial_records_delete_rbac`

Rule (all three):
```
admin
OR row_in_scope(uid, '<module>', 'delete', created_by, group_id)
OR (owner AND can_do(uid, '<module>', 'delete'))
```
Admin path is preserved; ACL grants given via the Permissions UI now actually work.

## Frontend
New helper `src/lib/assertDelete.ts` runs `.delete().select("id")` and throws
`permission_denied_or_not_found` when zero rows return (or when the count
mismatches `expected`). Wired into:
- `ServiceOrdersTable` (single + bulk)
- `PaymentOrdersTable` (single + bulk)
- `useServiceOrders.deleteMutation`
- `usePaymentOrders.deleteMutation`

Result: technicians/partners no longer see "Excluído com sucesso" when RLS
silently drops the delete.

## Not done in this phase
- Documents/discrepancies/reconciliations DELETE alignment (still admin-scoped or row-scoped).
- ACL UI doesn't expose `delete` granularity for SO/PO yet — already supported by `permissions` table though.
