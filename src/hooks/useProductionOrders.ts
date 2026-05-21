import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "./useWorkspace";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type ProductionStatus =
  | "new_vehicle" | "triage" | "awaiting_validation" | "in_production"
  | "paused" | "finished" | "invoiced" | "delivered";

export type CommercialStatus = "invoiced" | "delivered" | null;

/** Statuses that lock the order from editing once reached. */
export const LOCKED_STATUSES: ProductionStatus[] = ["finished", "invoiced", "delivered"];
export const isOrderLocked = (s?: ProductionStatus | null) => !!s && LOCKED_STATUSES.includes(s);

export type ProductionPriority = "low" | "normal" | "high" | "urgent";

export interface ProductionOrder {
  id: string;
  workspace_id: string;
  code: string;
  client_id: string | null;
  client_name: string | null;
  technician_user_id: string | null;
  technician_name: string | null;
  platform: string | null;
  insurer: string | null;
  license_plate: string | null;
  vin: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  notes: string | null;
  priority: ProductionPriority;
  status: ProductionStatus;
  due_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  delivered_at: string | null;
  service_order_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Operational pipeline statuses only — commercial states (invoiced/delivered) live elsewhere. */
export const PRODUCTION_STATUSES: { value: ProductionStatus; label: string; color: string }[] = [
  { value: "new_vehicle", label: "Novo Veículo", color: "bg-slate-500" },
  { value: "triage", label: "Em Triagem", color: "bg-blue-500" },
  { value: "awaiting_validation", label: "Aguardando Validação", color: "bg-amber-500" },
  { value: "in_production", label: "Em Produção", color: "bg-indigo-500" },
  { value: "paused", label: "Pausado", color: "bg-orange-500" },
  { value: "finished", label: "Finalizado", color: "bg-emerald-500" },
];

export const PRIORITY_META: Record<ProductionPriority, { label: string; tone: string }> = {
  low: { label: "Baixa", tone: "text-muted-foreground" },
  normal: { label: "Normal", tone: "text-foreground" },
  high: { label: "Alta", tone: "text-amber-500" },
  urgent: { label: "Urgente", tone: "text-destructive" },
};

export function useProductionOrders(filters?: { technicianOnly?: boolean; status?: ProductionStatus }) {
  const qc = useQueryClient();
  const { workspaceId } = useWorkspace();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["production_orders", workspaceId, filters],
    enabled: !!workspaceId,
    queryFn: async () => {
      let q: any = supabase
        .from("production_orders" as any)
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false });
      if (filters?.status) q = q.eq("status", filters.status);
      if (filters?.technicianOnly && user?.id) q = q.eq("technician_user_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ProductionOrder[];
    },
  });

  useEffect(() => {
    if (!workspaceId) return;
    const channelId = `production:${workspaceId}:${Math.random().toString(36).slice(2, 10)}`;
    const ch = supabase
      .channel(channelId)
      .on("postgres_changes", { event: "*", schema: "public", table: "production_orders" }, () => {
        qc.invalidateQueries({ queryKey: ["production_orders"] });
        qc.invalidateQueries({ queryKey: ["production_kpis"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, workspaceId]);


  const create = useMutation({
    mutationFn: async (payload: Partial<ProductionOrder>) => {
      if (!workspaceId) throw new Error("Workspace ausente");
      const { data, error } = await (supabase as any)
        .from("production_orders")
        .insert({ ...payload, workspace_id: workspaceId })
        .select()
        .single();
      if (error) throw error;
      return data as ProductionOrder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production_orders"] });
      toast.success("Ordem criada");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<ProductionOrder> & { id: string }) => {
      // Auto stamp timestamps on status transitions
      const stamp: any = {};
      if (patch.status === "in_production" && !patch.started_at) stamp.started_at = new Date().toISOString();
      if (patch.status === "finished" && !patch.finished_at) stamp.finished_at = new Date().toISOString();
      if (patch.status === "delivered" && !patch.delivered_at) stamp.delivered_at = new Date().toISOString();
      const { data, error } = await (supabase as any)
        .from("production_orders")
        .update({ ...patch, ...stamp })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ProductionOrder;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production_orders"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("production_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production_orders"] });
      toast.success("Ordem removida");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { ...query, create, update, remove };
}

export function useProductionKpis() {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: ["production_kpis", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("production_kpis", { _workspace_id: workspaceId });
      if (error) throw error;
      return data as {
        in_progress: number; paused: number; finished_today: number; delivered_today: number;
        overdue: number; active_technicians: number; avg_cycle_minutes: number;
        by_platform: Record<string, number>;
      };
    },
  });
}

export function useProductionTimeline(orderId: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["production_events", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("production_events")
        .select("*")
        .eq("production_order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!orderId) return;
    const channelId = `prod-events:${orderId}:${Math.random().toString(36).slice(2, 10)}`;
    const ch = supabase
      .channel(channelId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "production_events", filter: `production_order_id=eq.${orderId}` },
        () => qc.invalidateQueries({ queryKey: ["production_events", orderId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, orderId]);


  return query;
}
