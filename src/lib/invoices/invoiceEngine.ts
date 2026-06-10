import { apiRequest } from "@/lib/api";

export interface GenerateInvoiceArgs {
  workspaceId: string;
  planCode: string;
  cycle: "monthly" | "yearly";
  vatMode: "with_vat" | "no_vat" | "reverse_charge" | "business" | "consumer";
  amount?: number;
  bankAccountId?: string;
}

export async function generatePlatformInvoice(args: GenerateInvoiceArgs) {
  try {
    const data = await apiRequest(`/billing/workspaces/${args.workspaceId}/invoices/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_code: args.planCode,
        cycle: args.cycle,
        vat_mode: args.vatMode === "with_vat" || args.vatMode === "business" ? "business" : "personal",
        bank_account_id: args.bankAccountId ?? null,
        amount: args.amount ?? 0,
        vat_rate: 0,
        vat_exemption: null,
        legal_name: "Workspace",
        billing_email: "billing@example.com",
        country: "PT",
        vat_number: null,
      }),
    });
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export async function requestInvoicePdf(invoiceId: string) {
  try {
    const data = await apiRequest<{ signedUrl: string }>(`/billing/invoices/${invoiceId}/pdf`, {
      method: "POST",
    });
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export async function getInvoicePdfSignedUrl(pdfPath: string, expiresInSeconds = 3600) {
  void expiresInSeconds;
  return { url: pdfPath ?? null, error: null };
}
