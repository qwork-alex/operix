import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "./useAuth";
import { useWorkspace, type MembershipRole } from "./useWorkspace";
import { toast } from "sonner";

export interface WorkspaceInviteRow {
  id: string;
  workspace_id: string;
  target_profile_id: string;
  role: MembershipRole;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  created_by: string;
  created_at: string;
  responded_at: string | null;
  workspace_name?: string | null;
  target_full_name?: string | null;
  target_email?: string | null;
  target_display_code?: string | null;
}

export function useOutgoingInvites() {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: ["workspace-invites-out", workspaceId],
    enabled: !!workspaceId,
    retry: 0,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData ?? [],
    queryFn: async (): Promise<WorkspaceInviteRow[]> => {
      const data = await apiRequest<{ invites: WorkspaceInviteRow[] }>(
        `/workspaces/${workspaceId}/invites`,
        { timeoutMs: 10000 },
      );
      return data.invites ?? [];
    },
  });
}

export function useIncomingInvites() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["workspace-invites-in", user?.id],
    enabled: !!user?.id,
    retry: 0,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData ?? [],
    queryFn: async (): Promise<WorkspaceInviteRow[]> => {
      const data = await apiRequest<{ invites: WorkspaceInviteRow[] }>(
        "/invites/incoming",
        { timeoutMs: 10000 },
      );
      return data.invites ?? [];
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
      return apiRequest(`/workspaces/${workspaceId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_code: args.displayCode, role: args.role }),
        timeoutMs: 10000,
      });
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
      return apiRequest(`/invites/${inviteId}/accept`, {
        method: "PATCH",
        timeoutMs: 10000,
      });
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
      return apiRequest(`/invites/${inviteId}/reject`, {
        method: "PATCH",
        timeoutMs: 10000,
      });
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
      return apiRequest(`/invites/${inviteId}`, {
        method: "DELETE",
        timeoutMs: 10000,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace-invites-out"] });
      toast.success("Convite cancelado");
    },
    onError: (err: any) => toast.error(err.message || "Falha ao cancelar"),
  });
}
