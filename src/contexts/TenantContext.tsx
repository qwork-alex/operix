/**
 * Phase 5 — Tenant Security Layer
 *
 * `TenantProvider` is a thin orchestrator that composes existing primitives
 * (auth, workspace, role, permissions) into a single tenant-scoped surface.
 *
 * It does NOT replace any existing hook — `useAuth`, `useWorkspace`,
 * `useRole`, `usePermission`, `useCan` keep working untouched. New code can
 * adopt `useTenant()` to get a single, guard-aware view of the current
 * tenant context plus a hardened `assertSameTenant` helper for write paths.
 */
import { createContext, ReactNode, useCallback, useContext, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useRole, type DisplayRole } from "@/hooks/useRole";
import { useIsPlatformOwner } from "@/hooks/useSubscription";

export interface TenantContextValue {
  tenantId: string | null;           // workspace_id of active tenant
  tenantName: string | null;
  userId: string | null;             // auth.uid
  role: DisplayRole | null;          // membership role in active tenant
  isPlatformOwner: boolean;
  isWorkspaceAdmin: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;

  /** Throws if a record's workspace_id doesn't match the active tenant
   *  (platform owner bypasses). Use in write paths defensively. */
  assertSameTenant: (workspaceId: string | null | undefined) => void;
  /** Non-throwing variant — returns true when the tenant matches. */
  isSameTenant: (workspaceId: string | null | undefined) => boolean;
}

const TenantCtx = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { workspaceId, workspaceName, isAdmin: isWsAdmin, isLoading: wsLoading } = useWorkspace();
  const { role, isLoading: roleLoading } = useRole();
  const { data: isOwner, isLoading: ownerLoading } = useIsPlatformOwner();
  const isSameTenant = useCallback(
    (id: string | null | undefined) => {
      if (isOwner) return true;
      if (!workspaceId) return false;
      if (!id) return true; // null id (legacy row) — let RLS decide
      return id === workspaceId;
    },
    [isOwner, workspaceId],
  );

  const assertSameTenant = useCallback(
    (id: string | null | undefined) => {
      if (isSameTenant(id)) return;
      throw new Error(
        `[Tenant] Cross-tenant access blocked (active=${workspaceId ?? "-"}, target=${id ?? "-"}).`,
      );
    },
    [isSameTenant, workspaceId],
  );

  const value = useMemo<TenantContextValue>(
    () => ({
      tenantId: workspaceId,
      tenantName: workspaceName,
      userId: user?.id ?? null,
      role,
      isPlatformOwner: !!isOwner,
      isWorkspaceAdmin: !!isWsAdmin,
      isAuthenticated: !!user,
      isLoading: authLoading || wsLoading || roleLoading || ownerLoading,
      assertSameTenant,
      isSameTenant,
    }),
    [workspaceId, workspaceName, user, role, isOwner, isWsAdmin,
      authLoading, wsLoading, roleLoading, ownerLoading,
      assertSameTenant, isSameTenant],
  );

  return <TenantCtx.Provider value={value}>{children}</TenantCtx.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantCtx);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx;
}
