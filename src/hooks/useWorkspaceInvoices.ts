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
  // 6D additions (optional — kept tolerant for legacy rows)
  pdf_path?: string | null;
  vat_mode?: string | null;
  vat_amount?: number | null;
  subtotal?: number | null;
  bank_snapshot?: Record<string, any> | null;
}

/**
 * Real SaaS subscription invoices live in `platform_invoices`.
 * This hook reads them and returns them in a shape compatible with the
 * existing Invoice Center UI (kept stable to avoid breaking 6C components).
 */
export function useWorkspaceInvoices() {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: ["workspace-invoices", workspaceId],
    enabled: !!workspaceId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_invoices")
        .select(
          "id, invoice_number, issue_date, due_date, total, subtotal, vat_amount, status, metadata, paid_at, pdf_path, vat_mode, bank_snapshot, pdf_url"
        )
        .eq("workspace_id", workspaceId!)
        .order("issue_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r): WorkspaceInvoice => {
        const total = Number(r.total ?? 0);
        const paid = r.paid_at ? total : 0;
        return {
          id: r.id,
          invoice_number: r.invoice_number,
          issue_date: r.issue_date,
          due_date: r.due_date,
          total_amount: total,
          paid_amount: paid,
          remaining_amount: total - paid,
          status: r.status,
          stripe_invoice_id: r.metadata?.stripe_invoice_id ?? null,
          metadata: { ...(r.metadata ?? {}), hosted_invoice_url: r.metadata?.hosted_invoice_url, invoice_pdf: r.pdf_url ?? undefined },
          pdf_path: r.pdf_path,
          vat_mode: r.vat_mode,
          vat_amount: r.vat_amount != null ? Number(r.vat_amount) : null,
          subtotal: r.subtotal != null ? Number(r.subtotal) : null,
          bank_snapshot: r.bank_snapshot ?? null,
        };
      });
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
