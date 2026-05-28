/**
 * useWorkspace — OPERATIONAL CONTEXT layer ONLY.
 *
 * Architectural rule (do not break):
 *  • This hook describes the active OPERATIONAL workspace (tenant scope:
 *    OS, OP, billing, teams, dashboards).
 *  • It is NOT the global identity. Owner identity lives in
 *    `useIsPlatformOwner` and is always present for the platform owner —
 *    independent of which workspace is active.
 *  • Owner ≠ Workspace. Both coexist; one never nullifies the other.
 *
 * Switching workspace MUST NOT reload the page, recreate providers,
 * reset auth, or unmount the React tree. It only updates the operational
 * scope by changing `selectedId` and re-running workspace-keyed queries.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface WorkspaceMember {
  auth_user_id: string;
  app_user_id: string;
  name: string | null;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  membership_id: string;
}

export type MembershipRole = "admin" | "tecnico" | "cliente" | "socio";

interface WorkspaceContext {
  workspaceId: string | null;
  workspaceName: string | null;
  ownerAppUserId: string | null;
  members: WorkspaceMember[];
  memberAuthIds: string[];
  myRole: MembershipRole | null;
  isAdmin: boolean;
  isLoading: boolean;
  /** Switch the active operational workspace WITHOUT reloading the page. */
  switchWorkspace: (workspaceId: string) => void;
}

const WorkspaceCtx = createContext<WorkspaceContext | undefined>(undefined);

const SELECTED_KEY = "selected_workspace_id";

function readSelected(): string | null {
  try { return localStorage.getItem(SELECTED_KEY); } catch { return null; }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  // Operational scope state — initialised from storage, mutated by the
  // switcher. Owner and tenant users share the same flow: the workspace
  // is the OPERATIONAL context, never the identity.
  const [selectedId, setSelectedId] = useState<string | null>(() => readSelected());

  useEffect(() => {
    console.log("[MOUNT] WorkspaceProvider");
    return () => console.log("[UNMOUNT] WorkspaceProvider");
  }, []);

  const { data: wsData, isLoading: wsLoading } = useQuery({
    queryKey: ["my-workspace", userId, selectedId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      const { data: appUser, error: auErr } = await supabase
        .from("app_users")
        .select("id")
        .eq("auth_user_id", userId)
        .maybeSingle();
      if (auErr) throw auErr;
      if (!appUser) return null;

      const { data: memberships, error: mErr } = await supabase
        .from("memberships")
        .select("workspace_id, workspaces(id, name, owner_user_id)")
        .eq("user_id", appUser.id)
        .eq("status", "active");
      if (mErr) throw mErr;
      if (!memberships || memberships.length === 0) return null;

      // Resolve: explicit selection → first membership. Never null when
      // memberships exist — operational runtime always has a scope so the
      // owner identity layer stays alongside a live workspace.
      const picked = selectedId
        ? memberships.find((m: any) => m.workspace_id === selectedId)
        : null;
      const membership = picked || memberships[0];
      const ws = (membership as any).workspaces as any;
      if (!ws) return null;
      // Persist whichever id we ended up with so subsequent mounts are
      // deterministic. This does NOT trigger a remount — it just keeps
      // storage in sync with state.
      try {
        if (localStorage.getItem(SELECTED_KEY) !== ws.id) {
          localStorage.setItem(SELECTED_KEY, ws.id);
        }
      } catch { /* best effort */ }
      return {
        workspaceId: ws.id as string,
        workspaceName: ws.name as string,
        appUserId: appUser.id,
        ownerAppUserId: (ws.owner_user_id || null) as string | null,
      };
    },
  });

  // Members of the active operational workspace.
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["workspace-members", wsData?.workspaceId],
    enabled: !!wsData?.workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("id, role, status, user_id, app_users(id, auth_user_id, name, email, phone)")
        .eq("workspace_id", wsData!.workspaceId);
      if (error) throw error;
      return (data || []).map((m: any) => ({
        membership_id: m.id,
        app_user_id: m.user_id,
        auth_user_id: m.app_users?.auth_user_id || "",
        name: m.app_users?.name || null,
        email: m.app_users?.email || "",
        phone: m.app_users?.phone || null,
        role: m.role,
        status: m.status,
      })) as WorkspaceMember[];
    },
  });

  const memberAuthIds = useMemo(
    () => members.filter((m) => m.auth_user_id).map((m) => m.auth_user_id),
    [members],
  );
  const myMember = members.find((m) => m.auth_user_id === user?.id);
  const myRole = (myMember?.role as MembershipRole) ?? null;
  const isAdmin = myRole === "admin";

  // Switch operational scope WITHOUT reload. Just update state + storage
  // and invalidate workspace-keyed queries so derived data refetches.
  const switchWorkspace = useCallback((id: string) => {
    if (!id || id === selectedId) return;
    try { localStorage.setItem(SELECTED_KEY, id); } catch { /* best effort */ }
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("ctx_ws::"))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch { /* best effort */ }
    setSelectedId(id);
    // Re-evaluate everything scoped to a workspace. Providers stay mounted.
    queryClient.invalidateQueries();
  }, [selectedId, queryClient]);

  const value = useMemo<WorkspaceContext>(() => ({
    workspaceId: wsData?.workspaceId ?? null,
    workspaceName: wsData?.workspaceName ?? null,
    ownerAppUserId: wsData?.ownerAppUserId ?? null,
    members,
    memberAuthIds,
    myRole,
    isAdmin,
    isLoading: wsLoading || membersLoading,
    switchWorkspace,
  }), [wsData, members, memberAuthIds, myRole, isAdmin, wsLoading, membersLoading, switchWorkspace]);

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
