import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toastError } from "@/lib/normalizeError";
import { toast } from "sonner";

export type RecoverableEntity =
  | "service_orders" | "payment_orders" | "billing_invoices" | "financial_records"
  | "clients" | "vehicles" | "drivers" | "fleet_fuel_logs" | "fleet_trips";

export interface RecoverableItem {
  entity_type: RecoverableEntity;
  id: string;
  workspace_id: string | null;
  deleted_at: string;
  deleted_by: string | null;
  deleted_reason: string | null;
  label: string;
}

export function useRecoverableItems() {
  return useQuery({
    queryKey: ["recoverable_items"],
    queryFn: async (): Promise<RecoverableItem[]> => {
      const { data, error } = await (supabase as any).rpc("list_recoverable_items");
      if (error) throw error;
      return (data || []) as RecoverableItem[];
    },
    staleTime: 30_000,
  });
}

export function useSoftDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ table, id, reason }: { table: RecoverableEntity; id: string; reason?: string }) => {
      const { data, error } = await (supabase as any).rpc("soft_delete_record", {
        _table: table, _row_id: id, _reason: reason ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recoverable_items"] });
      toast.success("Item arquivado", { description: "Pode recuperá-lo no Centro de Recuperação." });
    },
    onError: (e) => { toastError(e); },
  });
}

export function useRestoreRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ table, id }: { table: RecoverableEntity; id: string }) => {
      const { data, error } = await (supabase as any).rpc("restore_record", { _table: table, _row_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recoverable_items"] });
      toast.success("Item restaurado");
    },
    onError: (e) => { toastError(e); },
  });
}
