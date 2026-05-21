/**
 * Phase 5.5 — Compliance, GDPR, devices, fraud signals.
 * Thin TanStack Query wrappers over the new RPCs and tables.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function useComplianceOverview() {
  return useQuery({
    queryKey: ["compliance-overview"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compute_compliance_overview" as any);
      if (error) throw error;
      return data as Record<string, any>;
    },
  });
}

export function useFraudSignals(limit = 50) {
  return useQuery({
    queryKey: ["fraud-signals", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fraud_signals" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export function useImmutableAuditLogs(limit = 100) {
  return useQuery({
    queryKey: ["immutable-audit-logs", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("immutable_audit_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export function useUserDevices() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user-devices", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_devices" as any)
        .select("*")
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export function usePrivacySettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["privacy-settings", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_privacy_settings" as any)
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
}

export function useUpdatePrivacySettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      if (!user?.id) throw new Error("not authenticated");
      const payload = { user_id: user.id, ...patch, updated_at: new Date().toISOString() };
      const { error } = await supabase.from("user_privacy_settings" as any).upsert(payload as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["privacy-settings"] });
      toast.success("Preferências de privacidade atualizadas");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar privacidade"),
  });
}

export function useRevokeDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deviceId: string) => {
      const { error } = await supabase.rpc("revoke_device" as any, { _device_id: deviceId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-devices"] });
      toast.success("Dispositivo revogado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao revogar dispositivo"),
  });
}

export function useRevokeAllDevices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("revoke_all_devices" as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-devices"] });
      toast.success("Todos os dispositivos foram revogados");
    },
  });
}

export function useRequestDataExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { scope?: string; format?: string } = {}) => {
      const { data, error } = await supabase.rpc("request_data_export" as any, {
        _scope: args.scope ?? "profile",
        _format: args.format ?? "json",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["data-exports"] });
      toast.success("Pedido de exportação registado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao solicitar exportação"),
  });
}

export function useDataExports() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["data-exports", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_export_requests" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}

export function useWorkspaceDeletions() {
  return useQuery({
    queryKey: ["workspace-deletions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_deletion_requests" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}
