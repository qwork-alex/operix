import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useWorkspace, type MembershipRole } from "./useWorkspace";
import { toast } from "sonner";
import { withPromiseTimeout } from "@/lib/asyncGuard";

export interface WorkspaceInviteRow {
  id: string;
  workspace_id: string;
  target_profile_id: string;
  role: MembershipRole;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  created_by: string;
  created_at: string;
  responded_at: string | null;
  // joined
  workspace_name?: string | null;
  target_full_name?: string | null;
  target_email?: string | null;
  target_display_code?: string | null;
}

const TABLE = "workspace_invites" as any;

/** Convites enviados pelo workspace atual */
export function useOutgoingInvites() {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: ["workspace-invites-out", workspaceId],
    enabled: !!workspaceId,
    retry: 0,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData ?? [],
    queryFn: async (): Promise<WorkspaceInviteRow[]> => {
      const { data, error } = await withPromiseTimeout<any>((supabase as any)
        .from(TABLE)
        .select("id, workspace_id, target_profile_id, role, status, created_by, created_at, responded_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false }), 10000, "workspace_invites_out");
      if (error) throw error;
      const rows = (data || []) as WorkspaceInviteRow[];
      if (!rows.length) return rows;
      const ids = Array.from(new Set(rows.map((r) => r.target_profile_id)));
      const { data: profs } = await withPromiseTimeout<any>(supabase
        .from("profiles")
        .select("id, full_name, email, display_code")
        .in("id", ids), 10000, "workspace_invites_out_profiles");
      const pmap = new Map<string, any>((profs || []).map((p: any) => [p.id, p]));
      return rows.map((r) => ({
        ...r,
        target_full_name: pmap.get(r.target_profile_id)?.full_name ?? null,
        target_email: pmap.get(r.target_profile_id)?.email ?? null,
        target_display_code: pmap.get(r.target_profile_id)?.display_code ?? null,
      }));
    },
  });
}

/** Convites recebidos pelo usuário atual */
export function useIncomingInvites() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["workspace-invites-in", user?.id],
    enabled: !!user?.id,
    retry: 0,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData ?? [],
    queryFn: async (): Promise<WorkspaceInviteRow[]> => {
      const { data, error } = await withPromiseTimeout<any>((supabase as any)
        .from(TABLE)
        .select("id, workspace_id, target_profile_id, role, status, created_by, created_at, responded_at")
        .eq("target_profile_id", user!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }), 10000, "workspace_invites_in");
      if (error) throw error;
      const rows = (data || []) as WorkspaceInviteRow[];
      if (!rows.length) return rows;
      const wsIds = Array.from(new Set(rows.map((r) => r.workspace_id)));
      const { data: wss } = await withPromiseTimeout<any>(supabase
        .from("workspaces")
        .select("id, name")
        .in("id", wsIds), 10000, "workspace_invites_in_workspaces");
      const wmap = new Map<string, string>((wss || []).map((w: any) => [w.id, w.name]));
      return rows.map((r) => ({ ...r, workspace_name: wmap.get(r.workspace_id) ?? null }));
    },
    refetchInterval: 60_000,
  });
}

export function useCreateInviteByCode() {
  const qc = useQueryClient();
  const { workspaceId } = useWorkspace();
  return useMutation({
    mutationFn: async (args: { displayCode: string; role: MembershipRole }) => {
      if (!workspaceId) throw new Error("Workspace não selecionado");
      const { data, error } = await (supabase.rpc as any)("create_workspace_invite_by_code", {
        _workspace_id: workspaceId,
        _display_code: args.displayCode,
        _role: args.role,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-invites-out"] });
      toast.success("Convite enviado");
    },
    onError: (err: any) => toast.error(err.message || "Falha ao enviar convite"),
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { data, error } = await (supabase.rpc as any)("accept_workspace_invite", { _invite_id: inviteId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-invites-in"] });
      qc.invalidateQueries({ queryKey: ["my-workspace"] });
      qc.invalidateQueries({ queryKey: ["workspace-members"] });
      toast.success("Convite aceito — você agora faz parte deste workspace");
    },
    onError: (err: any) => toast.error(err.message || "Falha ao aceitar"),
  });
}

export function useRejectInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { data, error } = await (supabase.rpc as any)("reject_workspace_invite", { _invite_id: inviteId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-invites-in"] });
      toast.success("Convite recusado");
    },
    onError: (err: any) => toast.error(err.message || "Falha ao recusar"),
  });
}

export function useCancelInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { data, error } = await (supabase.rpc as any)("cancel_workspace_invite", { _invite_id: inviteId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-invites-out"] });
      toast.success("Convite cancelado");
    },
    onError: (err: any) => toast.error(err.message || "Falha ao cancelar"),
  });
}
