---
name: RBAC Hardening Phase B3.2 — SELECT Isolation
description: Re-enabled RLS on service_orders/payment_orders/profiles/app_users which had been silently disabled, causing cross-user data leakage despite correct policies.
type: feature
---

## Root Cause
`pg_class.relrowsecurity = false` on:
- `service_orders`
- `payment_orders`
- `profiles`
- `app_users`

All four had correctly scoped SELECT policies (`*_select_rbac`, `prof_select_role_user_id`, `app_users_select_rbac`) but RLS was **disabled**, so PostgREST returned every row to every authenticated user. This explained the test4↔test5 cross-visibility.

## Fix
```sql
ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
ALTER TABLE ... FORCE  ROW LEVEL SECURITY;
```
FORCE was added defensively so the table owner role cannot bypass either.

## Validation Query
```sql
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind='r';
```
All four must show `t / t`.

## Smoke Tests
- Tech A logs in → only sees own SO/PO/profile rows.
- Tech B logs in → no overlap with A.
- Admin (qwork@qworkgroup.com) → still sees everything.
- Save flow (extract → validate → save SO) → still works (INSERT policies intact from B3.1).

## Note
If a future migration ever uses `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` on a public.* table holding user data, treat as a P0 regression.
