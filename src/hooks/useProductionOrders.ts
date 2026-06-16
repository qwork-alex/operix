import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "./useWorkspace";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { withAbortableTimeout, withPromiseTimeout } from "@/lib/asyncGuard";

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

const TIMESTAMP_FIELDS = ["due_at", "started_at", "finished_at", "delivered_at"] as const;
const TEXT_NULL_FIELDS = [
  "client_id", "client_name", "technician_user_id", "technician_name", "platform", "insurer",
  "license_plate", "vin", "brand", "model", "color", "notes", "service_order_id", "commercial_status",
] as const;

export function normalizeProductionOrderPayload(payload: Partial<ProductionOrder>) {
  const normalized: Record<string, unknown> = { ...payload };
  delete normalized.id;
  delete normalized.created_at;
  delete normalized.updated_at;
  delete normalized.created_by;
  delete normalized.workspace_id;

  TIMESTAMP_FIELDS.forEach((field) => {
    if (!(field in normalized)) return;
    const value = normalized[field];
    normalized[field] = typeof value === "string" && value.trim() === "" ? null : value ?? null;
  });

  TEXT_NULL_FIELDS.forEach((field) => {
    if (!(field in normalized)) return;
    if (normalized[field] === "") normalized[field] = null;
  });

  return normalized as Partial<ProductionOrder>;
}

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
      const { data, error } = await withPromiseTimeout<any>(q, 10000, "production_orders");
      if (error) throw error;
      return (data ?? []) as ProductionOrder[];
    },
    retry: 0,
    placeholderData: (previousData) => previousData ?? [],
  });

  const create = useMutation({
    mutationFn: async (payload: Partial<ProductionOrder>) => {
      if (!workspaceId) throw new Error("Workspace ausente");
      const clean = normalizeProductionOrderPayload(payload);
      const { data, error } = await withAbortableTimeout<{ data: any; error: any }>(
        async (signal) =>
          ((supabase as any)
            .from("production_orders")
            .insert({ priority: "normal", status: "new_vehicle", ...clean, workspace_id: workspaceId })
            .select()
            .single() as any).abortSignal(signal),
        12000,
        "production_orders_create",
      );
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
      const clean = normalizeProductionOrderPayload(patch);
      // Auto stamp timestamps on status transitions
      const stamp: any = {};
      if (clean.status === "in_production" && !clean.started_at) stamp.started_at = new Date().toISOString();
      if (clean.status === "finished" && !clean.finished_at) stamp.finished_at = new Date().toISOString();
      if (clean.status === "delivered" && !clean.delivered_at) stamp.delivered_at = new Date().toISOString();
      const { data, error } = await withAbortableTimeout<{ data: any; error: any }>(
        async (signal) =>
          ((supabase as any)
            .from("production_orders")
            .update({ ...clean, ...stamp })
            .eq("id", id)
            .select()
            .single() as any).abortSignal(signal),
        12000,
        "production_orders_update",
      );
      if (error) throw error;
      return data as ProductionOrder;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production_orders"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await withAbortableTimeout<{ data: any; error: any }>(
        async (signal) =>
          ((supabase as any).from("production_orders").delete().eq("id", id) as any).abortSignal(signal),
        12000,
        "production_orders_delete",
      );
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
      const { data, error } = await withPromiseTimeout<any>((supabase as any).rpc("production_kpis", { _workspace_id: workspaceId }), 10000, "production_kpis");
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
  const query = useQuery({
    queryKey: ["production_events", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await withPromiseTimeout<any>((supabase as any)
        .from("production_events")
        .select("*")
        .eq("production_order_id", orderId)
        .order("created_at", { ascending: false }), 10000, "production_events");
      if (error) throw error;
      return data ?? [];
    },
    retry: 0,
    placeholderData: (previousData) => previousData ?? [],
  });

  return query;
}
