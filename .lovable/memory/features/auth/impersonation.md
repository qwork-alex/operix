---
name: Admin impersonation (view as user)
description: Admin "view as another user" mode using frontend filter strategy — banner, audit log, scope
type: feature
---
Admin-only "Visualizar como utilizador" implemented via `useImpersonation` (sessionStorage-persisted React context).

Strategy: **frontend filter, not server impersonation**. Real auth session is never swapped. RLS still runs as the admin (admin sees all in DB). The hooks `useRole` and `usePermission` consume `effectiveUserId` from `useImpersonation`, so role + permission checks (and therefore sidebar nav, `<Can>` guards, `<PermissionGuard>`) reflect what the target user would see.

Key pieces:
- `src/hooks/useImpersonation.tsx` — provider + `effectiveUserId`, `startImpersonation`, `stopImpersonation`. Logs `IMPERSONATION_START` / `IMPERSONATION_STOP` to `backend_event_logs`.
- Mounted in `App.tsx` between `AuthProvider` and `RoleProvider` (RoleProvider depends on it).
- `src/components/layout/ImpersonationBanner.tsx` — sticky amber banner above TopBar with "Sair da visualização" button; clicking exit invalidates all React Query caches.
- Eye button in `UsersPage` (admin only, hidden for owner + self). On click invalidates all queries and shows toast.

Limits to remember:
- Data hooks that filter by `auth.uid()` directly in SQL (not via the role/permission layer) will still show admin's data. If true server-side impersonation is ever needed, rewrite RLS helpers (`has_role`, `get_my_technician_id`, `check_permission`) to read a session GUC set by an RPC.
- Self-impersonation blocked. Owner (`qwork@qworkgroup.com`) cannot be impersonated (no eye button on owner row because `!u.isOwner` already gates it).
