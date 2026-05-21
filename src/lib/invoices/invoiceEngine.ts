/**
 * Client-side wrapper around platform invoice RPCs.
 * Thin, defensive — never throws into the caller's render path; surfaces errors as resolved tuples.
 */

import { supabase } from "@/integrations/supabase/client";

export interface GenerateInvoiceArgs {
  workspaceId: string;
  planCode: string;
  cycle: "monthly" | "yearly";
  vatMode: "with_vat" | "no_vat" | "reverse_charge" | "business" | "consumer";
  amount?: number;
  bankAccountId?: string;
}

export async function generatePlatformInvoice(args: GenerateInvoiceArgs) {
  const { data, error } = await supabase.rpc("generate_platform_invoice", {
    _workspace_id: args.workspaceId,
    _plan_code: args.planCode,
    _cycle: args.cycle,
    _vat_mode: args.vatMode,
    _bank_account_id: args.bankAccountId ?? null,
    _amount: args.amount ?? null,
  });
  return { data: data as any, error };
}

export async function requestInvoicePdf(invoiceId: string) {
  const { data, error } = await supabase.functions.invoke("generate-invoice-pdf", {
    body: { invoiceId },
  });
  return { data, error };
}

export async function getInvoicePdfSignedUrl(pdfPath: string, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage
    .from("invoice-pdfs")
    .createSignedUrl(pdfPath, expiresInSeconds);
  return { url: data?.signedUrl ?? null, error };
}
