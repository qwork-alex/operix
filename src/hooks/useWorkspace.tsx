import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
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
}

const WorkspaceCtx = createContext<WorkspaceContext | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  useEffect(() => {
    console.log("[MOUNT] WorkspaceProvider");
    return () => console.log("[UNMOUNT] WorkspaceProvider");
  }, []);

  // 1. Get app_user + workspace for current auth user (supports switching)
  const userId = user?.id ?? null;

  const { data: wsData, isLoading: wsLoading } = useQuery({
    queryKey: ["my-workspace", userId],
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

      // Get all active memberships
      const { data: memberships, error: mErr } = await supabase
        .from("memberships")
        .select("workspace_id, workspaces(id, name, owner_user_id)")
        .eq("user_id", appUser.id)
        .eq("status", "active");
      if (mErr) throw mErr;
      if (!memberships || memberships.length === 0) return null;

      // Check if user has a preferred workspace stored
      const savedWsId = localStorage.getItem("selected_workspace_id");
      const selected = savedWsId
        ? memberships.find((m: any) => m.workspace_id === savedWsId)
        : null;

      const membership = selected || memberships[0];
      const ws = (membership as any).workspaces as any;
      return { workspaceId: ws.id as string, workspaceName: ws.name as string, appUserId: appUser.id, ownerAppUserId: (ws.owner_user_id || null) as string | null };
    },
  });

  // 2. Get all members of this workspace
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

  const memberAuthIds = members
    .filter((m) => m.auth_user_id)
    .map((m) => m.auth_user_id);

  // Determine current user's role in this workspace
  const myMember = members.find((m) => m.auth_user_id === user?.id);
  const myRole = (myMember?.role as MembershipRole) ?? null;
  const isAdmin = myRole === "admin";

  return (
    <WorkspaceCtx.Provider
      value={{
        workspaceId: wsData?.workspaceId ?? null,
        workspaceName: wsData?.workspaceName ?? null,
        ownerAppUserId: wsData?.ownerAppUserId ?? null,
        members,
        memberAuthIds,
        myRole,
        isAdmin,
        isLoading: wsLoading || membersLoading,
      }}
    >
      {children}
    </WorkspaceCtx.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
