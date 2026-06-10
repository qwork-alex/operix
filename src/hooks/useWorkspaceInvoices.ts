import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
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
      const data = await apiRequest<{ invoices: WorkspaceInvoice[] }>(
        `/billing/workspaces/${workspaceId}/invoices`,
      );
      return data.invoices ?? [];
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
