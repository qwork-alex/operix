// Generic invoice email sender with provider adapter (mock | resend | mailgun)
// All providers are decoupled — switch via EMAIL_PROVIDER env var.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type SendPayload = {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  text?: string;
  attachmentPath?: string;     // storage path inside invoice-pdfs
  attachmentName?: string;
};

type SendResult = {
  ok: boolean;
  providerId?: string;
  error?: string;
};

interface EmailProvider {
  name: string;
  send(p: SendPayload): Promise<SendResult>;
}

// ─── Mock provider (default; logs only) ──────────────────────────
const MockProvider: EmailProvider = {
  name: "mock",
  async send(p) {
    console.log(`[mock-email] -> ${p.to} | subject="${p.subject}" | attachment=${p.attachmentPath ?? "none"}`);
    return { ok: true, providerId: `mock-${crypto.randomUUID()}` };
  },
};

// ─── Resend provider stub (enabled when RESEND_API_KEY present) ──
const ResendProvider: EmailProvider = {
  name: "resend",
  async send(p) {
    const key = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("EMAIL_FROM") ?? "onboarding@resend.dev";
    if (!key) return { ok: false, error: "RESEND_API_KEY missing" };
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [p.to], cc: p.cc ? [p.cc] : undefined,
        subject: p.subject, html: p.html, text: p.text,
      }),
    });
    if (!r.ok) return { ok: false, error: `resend ${r.status}: ${await r.text()}` };
    const data = await r.json();
    return { ok: true, providerId: data.id };
  },
};

// ─── Mailgun stub ────────────────────────────────────────────────
const MailgunProvider: EmailProvider = {
  name: "mailgun",
  async send(_p) {
    return { ok: false, error: "mailgun adapter not implemented yet" };
  },
};

function selectProvider(): EmailProvider {
  const choice = (Deno.env.get("EMAIL_PROVIDER") ?? "").toLowerCase();
  if (choice === "mock") return MockProvider;
  if (Deno.env.get("RESEND_API_KEY")) return ResendProvider;
  if (choice === "mailgun") return MailgunProvider;
  return MockProvider;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, supabaseService);

    const body = await req.json() as {
      invoiceId: string;
      recipient: string;
      cc?: string;
      subject: string;
      message: string;
      pdfBase64?: string;       // optional inline PDF
      pdfFileName?: string;
      idempotencyKey?: string;
      kind?: "initial" | "reminder";
    };

    if (!body.invoiceId || !body.recipient || !body.subject) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency check
    if (body.idempotencyKey) {
      const { data: existing } = await admin
        .from("invoice_send_log")
        .select("id,status")
        .eq("idempotency_key", body.idempotencyKey)
        .maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ ok: true, deduped: true, logId: existing.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Upload PDF if provided
    let pdfPath: string | null = null;
    if (body.pdfBase64) {
      const bin = Uint8Array.from(atob(body.pdfBase64), (c) => c.charCodeAt(0));
      const fileName = body.pdfFileName ?? `invoice-${body.invoiceId}.pdf`;
      pdfPath = `${body.invoiceId}/${Date.now()}-${fileName}`;
      const up = await admin.storage.from("invoice-pdfs").upload(pdfPath, bin, {
        contentType: "application/pdf", upsert: false,
      });
      if (up.error) {
        console.warn("pdf upload failed:", up.error.message);
        pdfPath = null;
      }
    }

    const kind = body.kind === "reminder" ? "reminder" : "initial";

    // Anti-spam: prevent reminder if one was sent in the last 24h
    if (kind === "reminder") {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await admin
        .from("invoice_send_log")
        .select("id,created_at")
        .eq("invoice_id", body.invoiceId)
        .eq("kind", "reminder")
        .gte("created_at", since)
        .limit(1);
      if (recent && recent.length > 0) {
        return new Response(JSON.stringify({
          ok: false, throttled: true,
          error: "Uma cobrança já foi enviada nas últimas 24h.",
        }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Insert pending log
    const { data: logRow, error: insErr } = await admin
      .from("invoice_send_log")
      .insert({
        invoice_id: body.invoiceId,
        recipient: body.recipient,
        cc: body.cc ?? null,
        subject: body.subject,
        body: body.message,
        pdf_path: pdfPath,
        provider: selectProvider().name,
        status: "pending",
        idempotency_key: body.idempotencyKey ?? null,
        sent_by: user.id,
        kind,
      })
      .select()
      .single();
    if (insErr) throw insErr;

    // Build signed URL for download link in email
    let downloadUrl: string | null = null;
    if (pdfPath) {
      const { data: signed } = await admin.storage.from("invoice-pdfs")
        .createSignedUrl(pdfPath, 60 * 60 * 24 * 7);
      downloadUrl = signed?.signedUrl ?? null;
    }

    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.6">
        ${body.message.replace(/\n/g, "<br/>")}
        ${downloadUrl ? `<p style="margin-top:24px"><a href="${downloadUrl}" style="background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Descarregar fatura (PDF)</a></p>` : ""}
      </div>
    `;

    const provider = selectProvider();
    const result = await provider.send({
      to: body.recipient, cc: body.cc, subject: body.subject,
      html, text: body.message,
      attachmentPath: pdfPath ?? undefined,
    });

    await admin.from("invoice_send_log").update({
      status: result.ok ? "sent" : "failed",
      sent_at: result.ok ? new Date().toISOString() : null,
      error: result.error ?? null,
    }).eq("id", logRow.id);

    return new Response(JSON.stringify({
      ok: result.ok, logId: logRow.id, provider: provider.name,
      error: result.error, downloadUrl,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: result.ok ? 200 : 500,
    });
  } catch (e) {
    console.error("send-invoice-email error:", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
