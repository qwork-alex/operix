---
name: Data visibility flags
description: Per-user visibility flags (user_settings) controlling data isolation across SO/PO/financial_records.
type: feature
---

`public.user_settings` (1 row per user, auto-created via profiles trigger):
- `can_view_other_users` — allow listing other users in the Users page (frontend hint).
- `can_view_workspace_data` — when true, user sees ALL workspace records (overrides default own-records-only).

Resolution: `public.has_global_view(uid)` returns true if admin OR `can_view_workspace_data = true`.

RLS using it (SELECT only, writes still scoped):
- `service_orders.secure_select` / `secure_update`
- `payment_orders.po_select_scoped`
- `financial_records.financial_records_select_tech`

Default: both flags false. Technicians see only `technician_id = get_my_technician_id()`. Clients see records via `can_access_client`. Admins always see all.

UI: toggles inside `UserPermissionsDialog` (above the permissions matrix). Hidden for admins.
