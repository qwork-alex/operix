import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { action, token, workspace_id, role } = await req.json();

    // ACTION 1: Criar convite
    if (action === "create") {
      const wsId = workspace_id || "55b0f5fe-5e48-4f11-aef2-bc7c8c4f7f6d";
      const inviteRole = role || "tecnico";

      console.log(`[TEST-INVITES] Creating invite for workspace=${wsId}, role=${inviteRole}`);

      const { data, error } = await supabase
        .from("invites")
        .insert({
          workspace_id: wsId,
          created_by: "00000000-0000-0000-0000-000000000000", // dummy for test
          role: inviteRole,
          invite_type: "link",
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("id, token, short_code, workspace_id, role, expires_at")
        .single();

      if (error) {
        console.error(`[TEST-INVITES] CREATE ERROR:`, error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[TEST-INVITES] CREATE SUCCESS: token=${data.token}, short_code=${data.short_code}`);
      return new Response(JSON.stringify({ success: true, action: "create", invite: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION 2: Validar token
    if (action === "validate") {
      if (!token) {
        return new Response(JSON.stringify({ success: false, error: "token_required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[TEST-INVITES] Validating token=${token}`);

      const { data, error } = await supabase
        .from("invites")
        .select("id, token, short_code, workspace_id, role, accepted_at, expires_at")
        .eq("token", token)
        .maybeSingle();

      if (error) {
        console.error(`[TEST-INVITES] VALIDATE ERROR:`, error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!data) {
        console.log(`[TEST-INVITES] VALIDATE: NOT FOUND`);
        return new Response(JSON.stringify({ success: true, valid: false, reason: "not_found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isExpired = data.expires_at && new Date(data.expires_at) < new Date();
      const isUsed = !!data.accepted_at;
      const valid = !isExpired && !isUsed;

      console.log(`[TEST-INVITES] VALIDATE: found=${true}, valid=${valid}, expired=${isExpired}, used=${isUsed}`);

      return new Response(JSON.stringify({
        success: true,
        valid,
        reason: isUsed ? "already_used" : isExpired ? "expired" : "ok",
        invite: data,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, error: "invalid_action. Use 'create' or 'validate'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[TEST-INVITES] EXCEPTION:`, e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
