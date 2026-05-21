// Phase 6D — Invoice email dispatcher.
// Drains `invoice_email_queue` in small batches. Safe to invoke from cron, UI, or webhook.
// Sending backend is pluggable: tries existing `send-invoice-email` function; on failure marks attempt.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_BATCH = 10;
const MAX_ATTEMPTS = 5;

function db() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function dispatchOne(admin: ReturnType<typeof db>, row: any) {
  // Build a signed URL for the invoice PDF (if present) so the email can link to it
  const { data: inv } = await admin
    .from("platform_invoices")
    .select("invoice_number, total, currency, pdf_path, issue_date, due_date")
    .eq("id", row.invoice_id)
    .maybeSingle();

  let pdfUrl: string | null = null;
  if (inv?.pdf_path) {
    const { data: signed } = await admin.storage
      .from("invoice-pdfs")
      .createSignedUrl(inv.pdf_path, 60 * 60 * 24 * 7);
    pdfUrl = signed?.signedUrl ?? null;
  }

  const tpl: string = row.template ?? "invoice-issued";
  const num = inv?.invoice_number ?? row.invoice_id;
  const total = `${inv?.total ?? ""} ${inv?.currency ?? "EUR"}`;

  let subject: string;
  let message: string;
  let kind = "initial";

  switch (tpl) {
    case "dunning-reminder":
      subject = `Friendly reminder · invoice ${num}`;
      message = `This is a friendly reminder that invoice ${num} (${total}) is past due. Please settle at your earliest convenience.\n` + (pdfUrl ? `\nDownload: ${pdfUrl}\n` : "");
      kind = "reminder";
      break;
    case "dunning-warning":
      subject = `Payment overdue · invoice ${num}`;
      message = `Invoice ${num} (${total}) remains unpaid. Continued non-payment may limit your service access.\n` + (pdfUrl ? `\nDownload: ${pdfUrl}\n` : "");
      kind = "warning";
      break;
    case "dunning-limited_mode":
      subject = `Service limited · invoice ${num}`;
      message = `Your workspace has been moved to limited mode due to unpaid invoice ${num} (${total}). Settle to restore full access.\n` + (pdfUrl ? `\nDownload: ${pdfUrl}\n` : "");
      kind = "risk";
      break;
    case "dunning-suspension":
      subject = `Workspace suspended · invoice ${num}`;
      message = `Your workspace has been suspended due to unpaid invoice ${num} (${total}). Please contact billing or settle the invoice to reactivate.\n` + (pdfUrl ? `\nDownload: ${pdfUrl}\n` : "");
      kind = "suspension";
      break;
    default:
      subject = `Invoice ${num}`;
      message =
        `Your invoice ${num} is available.\n` +
        `Issue date: ${inv?.issue_date ?? ""}\n` +
        (inv?.due_date ? `Due date: ${inv.due_date}\n` : "") +
        `Total: ${total}\n` +
        (pdfUrl ? `\nDownload: ${pdfUrl}\n` : "");
  }

  // Try the existing send-invoice-email function (decoupled provider adapter)
  try {
    const r = await admin.functions.invoke("send-invoice-email", {
      body: {
        invoiceId: row.invoice_id,
        recipient: row.recipient,
        subject,
        message,
        idempotencyKey: `inv-email-${row.id}`,
        kind,
      },
    });

    if (r.error) throw r.error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = db();

    const { data: rows, error } = await admin
      .from("invoice_email_queue")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(MAX_BATCH);
    if (error) throw error;

    let sent = 0;
    let failed = 0;
    for (const row of rows ?? []) {
      const res = await dispatchOne(admin, row);
      const attempts = (row.attempts ?? 0) + 1;
      if (res.ok) {
        sent++;
        await admin.from("invoice_email_queue").update({
          status: "sent",
          attempts,
          sent_at: new Date().toISOString(),
          last_error: null,
        }).eq("id", row.id);
        await admin.from("invoice_events").insert({
          invoice_id: row.invoice_id,
          workspace_id: row.workspace_id,
          event_type: "sent",
          payload: { recipient: row.recipient, queue_id: row.id },
        });
      } else {
        failed++;
        const dlq = attempts >= MAX_ATTEMPTS;
        await admin.from("invoice_email_queue").update({
          status: dlq ? "dlq" : "pending",
          attempts,
          last_error: res.error?.slice(0, 500) ?? "unknown",
          scheduled_at: dlq
            ? new Date().toISOString()
            : new Date(Date.now() + Math.min(60_000 * attempts, 15 * 60_000)).toISOString(),
        }).eq("id", row.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: rows?.length ?? 0, sent, failed }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[process-invoice-emails]", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
