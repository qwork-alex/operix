// AI Actions — controlled execution layer
// SAFE MODE: requires user JWT, workspace membership, and explicit recommendation context.
// Only whitelisted actions are allowed; everything is logged to ai_action_log.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPA_SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Action =
  | "apply_recommendation"
  | "dismiss_recommendation"
  | "acknowledge_alert"
  | "dismiss_alert";

interface Body {
  workspace_id: string;
  action: Action;
  recommendation_id?: string;
  alert_id?: string;
  payload?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "missing auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const userClient = createClient(SUPA_URL, SUPA_ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const body = (await req.json()) as Body;
  if (!body?.workspace_id || !body?.action) {
    return new Response(JSON.stringify({ error: "workspace_id and action required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Membership check via RLS
  const { data: m } = await userClient.from("memberships").select("workspace_id").eq("workspace_id", body.workspace_id).maybeSingle();
  if (!m) return new Response(JSON.stringify({ error: "workspace_forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const svc = createClient(SUPA_URL, SUPA_SVC);
  const log = async (status: string, result: any = null, error: string | null = null) => {
    await svc.from("ai_action_log").insert({
      workspace_id: body.workspace_id,
      user_id: user.id,
      action: body.action,
      recommendation_id: body.recommendation_id ?? null,
      payload: { ...(body.payload ?? {}), alert_id: body.alert_id ?? null },
      status,
      result,
      error,
    });
  };

  try {
    let result: any = null;
    switch (body.action) {
      case "apply_recommendation": {
        if (!body.recommendation_id) throw new Error("recommendation_id required");
        const { data, error } = await svc.from("ai_recommendations")
          .update({ status: "applied", applied_at: new Date().toISOString(), applied_by: user.id })
          .eq("id", body.recommendation_id).eq("workspace_id", body.workspace_id).select().single();
        if (error) throw error;
        result = data;
        break;
      }
      case "dismiss_recommendation": {
        if (!body.recommendation_id) throw new Error("recommendation_id required");
        const { data, error } = await svc.from("ai_recommendations")
          .update({ status: "dismissed" })
          .eq("id", body.recommendation_id).eq("workspace_id", body.workspace_id).select().single();
        if (error) throw error;
        result = data;
        break;
      }
      case "acknowledge_alert": {
        if (!body.alert_id) throw new Error("alert_id required");
        const { data, error } = await svc.from("ai_alerts")
          .update({ status: "acknowledged", acknowledged_at: new Date().toISOString(), acknowledged_by: user.id })
          .eq("id", body.alert_id).eq("workspace_id", body.workspace_id).select().single();
        if (error) throw error;
        result = data;
        break;
      }
      case "dismiss_alert": {
        if (!body.alert_id) throw new Error("alert_id required");
        const { data, error } = await svc.from("ai_alerts")
          .update({ status: "dismissed" })
          .eq("id", body.alert_id).eq("workspace_id", body.workspace_id).select().single();
        if (error) throw error;
        result = data;
        break;
      }
      default:
        throw new Error("unknown action");
    }
    await log("ok", result);
    return new Response(JSON.stringify({ ok: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log("error", null, msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
