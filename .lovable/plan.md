

## Permission System Audit Report — Generation Plan

You asked for a complete raw export of every permission-related artifact for offline auditing. Because the full content runs into tens of thousands of lines (frontend hooks + guards + 13 RLS-protected tables + SQL functions + every file referencing `role`/`technician`/`isAdmin`), I will package it as a single downloadable Markdown report rather than dumping it into chat (which would be truncated and unsearchable).

### What you will get

A file at `/mnt/documents/permission-audit-report.md` (plus a `.zip` mirror with the raw source files) organized in three sections:

**1. FRONTEND** — full raw contents of:
- `src/hooks/usePermission.tsx` (resolver + realtime subscription)
- `src/hooks/useRole.tsx` (role mapping `partner→socio`, `technician→tecnico`)
- `src/hooks/useAuth.tsx`
- `src/components/PermissionGuard.tsx`
- `src/components/RoleGuard.tsx`
- `src/components/Can.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/components/permissions/PermissionsMatrix.tsx`
- `src/components/permissions/UserPermissionsDialog.tsx`
- `src/components/permissions/RolePermissionsManager.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/App.tsx` (route wiring)
- `src/hooks/useServiceOrders.ts` + `usePaymentOrders.ts` (the `if (!isAdmin && user?.id) q = q.eq("created_by", user.id)` filters)
- `src/pages/ModulePages.tsx` extracts wherever `isAdmin` / `role ===` / `technician` appears

**2. BACKEND (Edge Functions)** — full raw contents of:
- `supabase/functions/admin-create-user/index.ts` (cascade delete logic)
- `supabase/functions/reset-system/index.ts`

**3. DATABASE** — pulled live from your project:
- `has_permission()`, `has_role()`, `get_user_role()`, `get_my_role()`, `get_my_technician_id()`, `can_access_client()` (full SQL bodies)
- Every RLS policy on: `permissions`, `role_permissions`, `user_permissions`, `user_roles`, `service_orders`, `payment_orders`, `financial_records`, `documents`, `clients`, `technicians`, `profiles`, `app_users`
- Live data dumps: permissions catalog (40 rows), `role_permissions` per role, every `user_permissions` override (joined with module/action/email), `user_roles` (joined with email)

**4. AUDIT FINDINGS** — a concise diagnostic at the top flagging the real reasons overrides are being ignored. Preview of what will be there:

```text
FINDING #1 — RoleGuard hard-blocks BEFORE PermissionGuard runs
  src/App.tsx wraps /financial, /profit, /accounting, /fleet, /documents
  in <RoleGuard allowedRoles={[...]}>. A technician with override
  financial.view=true is REDIRECTED at /financial because "tecnico" is
  not in allowedRoles — PermissionGuard never executes.
  → RoleGuard must be removed (or made permission-aware) for overrides
    to actually grant page access.

FINDING #2 — Per-row "created_by" filter ignores RLS-granted access
  src/hooks/useServiceOrders.ts line 67 and usePaymentOrders.ts line 53:
    if (!isAdmin && user?.id) q = q.eq("created_by", user.id);
  Even if RLS allows a technician to read rows owned by others (via
  has_permission + technician_id match), the client query restricts to
  rows they CREATED. Override is silently filtered out client-side.

FINDING #3 — RLS still requires role membership AFTER permission check
  Policies like service_orders_select_scoped require:
    has_permission(...) AND (admin OR partner OR technician_id=mine OR
    NOT technician AND NOT client)
  A technician with override service_orders.view=true who is NOT the
  assigned technician_id of a row still gets ZERO rows. The override
  unlocks the gate, but ownership scoping closes it again.

FINDING #4 — Sidebar uses display role ("tecnico") but DB has "technician"
  AppSidebar.tsx filters items by role list ["admin","tecnico","socio"].
  This is correct via ROLE_MAP, but item.roles still HARD-blocks menu
  visibility before perm check. A partner override for "fleet.view"
  won't show the menu because "socio" is not in fleet's roles list.

FINDING #5 — Dialog query uses `.eq("role", userRole)` with display value
  UserPermissionsDialog passes the raw DB role ("technician"), which is
  correct — but RolePermissionsManager and the dialog never validate
  that the value matches. Worth confirming downstream callers pass the
  DB enum value, not the display ("tecnico").
```

### Generation steps (executes when you approve)

1. Run a Node script that reads each frontend file via `fs.readFileSync` and concatenates them with headers.
2. Run `psql` queries for full function bodies (`pg_get_functiondef`) and full policy definitions (`pg_policies`), embed inline.
3. Append live data dumps already retrieved in this session.
4. Write the assembled Markdown to `/mnt/documents/permission-audit-report.md`.
5. Also produce `/mnt/documents/permission-audit-source.zip` containing the raw `.tsx`/`.ts`/`.sql` files for grep-friendly local inspection.
6. Emit `<lov-artifact>` tags so both files appear as downloads.

No code changes, no DB changes — read-only export plus a downloadable bundle.

