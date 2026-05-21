// Phase 6D — Isolated PDF service for SaaS platform invoices.
// Generates a clean, EU-compliant invoice PDF and stores it in `invoice-pdfs` bucket.
// Does NOT touch any existing billing logic.

import { createClient } from "npm:@supabase/supabase-js@2";
import jsPDF from "npm:jspdf@2.5.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function db() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function money(v: number, currency = "EUR") {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(v ?? 0);
}

function buildPdf(invoice: any, items: any[], profile: any, settings: any): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  let y = margin;

  // Header
  const brandName = settings?.company_name ?? "QWork Group";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(brandName, margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  if (settings?.legal_address) doc.text(String(settings.legal_address), margin, y + 16);
  if (settings?.legal_vat) doc.text(`VAT: ${settings.legal_vat}`, margin, y + 30);

  // Invoice title block (right)
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("INVOICE", pageW - margin, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Nº ${invoice.invoice_number}`, pageW - margin, y + 16, { align: "right" });
  doc.text(`Issue: ${invoice.issue_date}`, pageW - margin, y + 30, { align: "right" });
  if (invoice.due_date) doc.text(`Due:   ${invoice.due_date}`, pageW - margin, y + 44, { align: "right" });

  y += 80;
  doc.setDrawColor(230);
  doc.line(margin, y, pageW - margin, y);
  y += 24;

  // Bill to
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Bill to", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const lines = [
    profile?.legal_name ?? invoice.customer_name ?? "—",
    profile?.address ?? "",
    [profile?.postal_code, profile?.city].filter(Boolean).join(" "),
    profile?.country ?? "",
    profile?.vat_number ? `VAT: ${profile.vat_number}` : "",
  ].filter(Boolean);
  lines.forEach((l, i) => doc.text(String(l), margin, y + 16 + i * 14));
  y += 16 + lines.length * 14 + 16;

  // Items table header
  doc.setFillColor(245);
  doc.rect(margin, y, pageW - margin * 2, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Description", margin + 8, y + 15);
  doc.text("Qty", pageW - margin - 200, y + 15, { align: "right" });
  doc.text("Unit", pageW - margin - 110, y + 15, { align: "right" });
  doc.text("Total", pageW - margin - 8, y + 15, { align: "right" });
  y += 30;

  doc.setFont("helvetica", "normal");
  items.forEach((it: any) => {
    const desc = String(it.description ?? "Subscription");
    doc.text(desc, margin + 8, y);
    doc.text(String(it.quantity ?? 1), pageW - margin - 200, y, { align: "right" });
    doc.text(money(Number(it.unit_price ?? 0)), pageW - margin - 110, y, { align: "right" });
    doc.text(money(Number(it.amount ?? it.total ?? 0)), pageW - margin - 8, y, { align: "right" });
    y += 18;
  });

  y += 12;
  doc.setDrawColor(230);
  doc.line(pageW - margin - 240, y, pageW - margin, y);
  y += 16;

  const subtotal = Number(invoice.subtotal ?? 0);
  const vatAmount = Number(invoice.vat_amount ?? 0);
  const total = Number(invoice.total ?? 0);

  doc.setFont("helvetica", "normal");
  doc.text("Subtotal", pageW - margin - 110, y, { align: "right" });
  doc.text(money(subtotal), pageW - margin - 8, y, { align: "right" });
  y += 16;

  const vatLabel = invoice.vat_mode === "reverse_charge"
    ? "VAT (reverse charge)"
    : invoice.vat_mode === "no_vat"
      ? "VAT (exempt)"
      : `VAT (${Math.round(Number(invoice.vat_rate ?? 0) * 100)}%)`;
  doc.text(vatLabel, pageW - margin - 110, y, { align: "right" });
  doc.text(money(vatAmount), pageW - margin - 8, y, { align: "right" });
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Total", pageW - margin - 110, y, { align: "right" });
  doc.text(money(total, invoice.currency ?? "EUR"), pageW - margin - 8, y, { align: "right" });

  y += 30;

  // Legal mention
  if (invoice.vat_mode === "reverse_charge") {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(
      "Reverse charge — Article 196 of EU VAT Directive 2006/112/EC. VAT to be accounted for by the recipient.",
      margin, y, { maxWidth: pageW - margin * 2 },
    );
    y += 24;
  }

  // Bank snapshot
  const bank = invoice.bank_snapshot as any;
  if (bank && typeof bank === "object") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20);
    doc.text("Payment details", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80);
    const bl = [
      bank.beneficiary ? `Beneficiary: ${bank.beneficiary}` : "",
      bank.bank_name ? `Bank: ${bank.bank_name}` : "",
      bank.iban ? `IBAN: ${bank.iban}` : "",
      bank.bic ? `BIC/SWIFT: ${bank.bic}` : "",
      bank.reference ? `Reference: ${bank.reference}` : `Reference: ${invoice.invoice_number}`,
    ].filter(Boolean);
    bl.forEach((l, i) => doc.text(l, margin, y + 14 + i * 12));
    y += 14 + bl.length * 12 + 12;
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(160);
  doc.text(
    `${brandName} — Invoice ${invoice.invoice_number} — generated ${new Date().toISOString().slice(0, 10)}`,
    pageW / 2,
    doc.internal.pageSize.getHeight() - 24,
    { align: "center" },
  );

  return doc.output("arraybuffer") as unknown as Uint8Array;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth gate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimErr } = await userClient.auth.getClaims(token);
    if (claimErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const { invoiceId } = await req.json();
    if (!invoiceId || typeof invoiceId !== "string") {
      return new Response(JSON.stringify({ error: "invoiceId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = db();
    const { data: invoice, error: invErr } = await admin
      .from("platform_invoices")
      .select("*")
      .eq("id", invoiceId)
      .maybeSingle();
    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: "invoice_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorize: user must belong to workspace
    const { data: member } = await admin
      .from("memberships")
      .select("id")
      .eq("workspace_id", invoice.workspace_id)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (!member) {
      const { data: isOwner } = await admin.rpc("is_platform_owner", { _user_id: userId });
      if (!isOwner) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const [{ data: items }, { data: profile }, { data: settings }] = await Promise.all([
      admin.from("platform_invoice_items").select("*").eq("invoice_id", invoiceId).order("sort_order"),
      admin.from("billing_profiles").select("*").eq("workspace_id", invoice.workspace_id).maybeSingle(),
      admin.from("company_settings").select("*").eq("workspace_id", invoice.workspace_id).maybeSingle(),
    ]);

    const pdfBytes = buildPdf(invoice, items ?? [], profile ?? {}, settings ?? {});
    const path = `${invoice.workspace_id}/${invoice.id}.pdf`;

    const { error: upErr } = await admin.storage
      .from("invoice-pdfs")
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      console.error("[pdf upload]", upErr);
      return new Response(JSON.stringify({ error: "pdf_upload_failed", details: upErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("platform_invoices").update({
      pdf_path: path,
      pdf_generated_at: new Date().toISOString(),
    }).eq("id", invoiceId);

    await admin.from("invoice_events").insert({
      invoice_id: invoiceId,
      workspace_id: invoice.workspace_id,
      event_type: invoice.pdf_path ? "pdf_regenerated" : "pdf_generated",
      payload: { path, bytes: pdfBytes.byteLength },
      actor_id: userId,
    });

    const { data: signed } = await admin.storage
      .from("invoice-pdfs")
      .createSignedUrl(path, 3600);

    return new Response(JSON.stringify({ ok: true, path, signedUrl: signed?.signedUrl }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[generate-invoice-pdf]", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
