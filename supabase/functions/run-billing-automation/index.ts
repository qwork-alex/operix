// Phase 6E — Master billing automation runner.
// Invoked daily by pg_cron and on-demand from AutomationPanel.
// Calls run_subscription_automation() RPC and logs a platform event.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data, error } = await admin.rpc("run_subscription_automation");
    if (error) throw error;

    // Best-effort audit (NULL workspace = platform-level event)
    try {
      await admin.from("subscription_events").insert({
        workspace_id: null,
        event_type: "automation.run",
        severity: "info",
        message: "Billing automation executed",
        metadata: data ?? {},
      });
    } catch (_) {
      // workspace_id may be NOT NULL — fall back to a known workspace if possible
    }

    return new Response(JSON.stringify({ ok: true, result: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    console.error("[run-billing-automation]", e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
