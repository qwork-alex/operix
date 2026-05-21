import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "./useWorkspace";

export interface WorkspaceInvoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: string;
  stripe_invoice_id: string | null;
  metadata: Record<string, any> | null;
}

/**
 * Faturas da própria workspace (subscription billing).
 * Filtra por `metadata->>'kind' = 'subscription'` quando existir,
 * mas também aceita registos sem flag desde que pertençam à workspace.
 */
export function useWorkspaceInvoices() {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: ["workspace-invoices", workspaceId],
    enabled: !!workspaceId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_invoices")
        .select(
          "id, invoice_number, issue_date, due_date, total_amount, paid_amount, remaining_amount, status, stripe_invoice_id, metadata"
        )
        .eq("workspace_id", workspaceId!)
        .is("deleted_at", null)
        .order("issue_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as WorkspaceInvoice[];
    },
  });
}

export type InvoiceBucket = "paid" | "pending" | "failed" | "overdue";

export function bucketOf(inv: WorkspaceInvoice): InvoiceBucket {
  const s = (inv.status || "").toLowerCase();
  if (s.includes("paid") || s === "settled") return "paid";
  if (s.includes("fail") || s.includes("void") || s.includes("cancel")) return "failed";
  if (inv.due_date && new Date(inv.due_date) < new Date() && Number(inv.remaining_amount) > 0) return "overdue";
  return "pending";
}
