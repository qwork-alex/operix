---
name: Phase 5 — Multi-Tenant Security Layer
description: Additive tenant/security layer atop Phase 2.5 isolation. Adds security_events append-only log, log_security_event RPC, compute_security_metrics, TenantProvider/useTenant, RoleGuard, PermissionGate and a Security tab in PlatformOwner.
type: feature
---

## DB (migration 20260521-124617)
- `security_events` table: workspace_id, user_id, app_user_id, event_type, severity (info|warn|critical), ip, user_agent, resource, metadata, risk_score, created_at.
- RLS: owner sees all; user sees own; workspace admin sees own ws. Append-only (no UPDATE; DELETE only by `is_platform_owner`).
- RPC `log_security_event(_event_type, _severity, _resource, _resource_id, _metadata, _workspace_id, _ip, _user_agent, _risk_score)` SECURITY DEFINER — fills user_id/app_user_id from auth.uid().
- RPC `assert_workspace_member(_workspace_id)` — owner OR `is_workspace_member`.
- RPC `compute_security_metrics()` — owner-only KPI snapshot (logins_24h, failed_24h, critical_7d, suspicious_7d, active_sessions, distinct_ips_24h).

## Frontend
- `src/lib/securityLog.ts` — `logSecurityEvent({type, severity, resource, resourceId, metadata, workspaceId, riskScore})`. Resolves IP via ipify (cache:'force-cache'), best-effort, swallows errors.
- `src/contexts/TenantContext.tsx` — `TenantProvider` composes useAuth+useWorkspace+useRole+useIsPlatformOwner. Exposes `useTenant()` with `tenantId`, `role`, `isPlatformOwner`, `isWorkspaceAdmin`, `assertSameTenant(id)` (throws on mismatch, owner bypass), `isSameTenant(id)`.
- `src/components/auth/RoleGuard.tsx` — allow=RoleKey|RoleKey[] (platform_owner|workspace_owner|admin|manager|technician|financial|client|readonly), maps to DisplayRole.
- `src/components/auth/PermissionGate.tsx` — `permission: "module.action"|string[]`, mode="all"|"any". Uses single source `useCan/usePermissions`.
- `src/components/platform/SecurityDashboard.tsx` — KPI strip + last-100 events feed (auto-refresh 30s/60s). Used in PlatformOwnerPage "Segurança" tab.
- `useAuth.signIn/signOut` now emit `login/login_failed/logout` security events alongside existing backend_event_logs (non-blocking).

## Provider order in App.tsx
`AuthProvider > ImpersonationProvider > WorkspaceProvider > RoleProvider > TenantProvider > AppLayout`.

## Intentionally NOT changed
- Existing RLS policies, permissions schema, useRole/useWorkspace, PermissionGuard, sidebar visibility, business logic, calculations, visual layout/branding.
- ws_scope_* policies from Phase 2.5 remain authoritative for cross-table isolation.
