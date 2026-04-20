import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResp({ error: "No authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller identity
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return jsonResp({ error: "not_authenticated" }, 401);

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (roleData?.role !== "admin") return jsonResp({ error: "forbidden" }, 403);

    const body = await req.json();
    const { action } = body;

    // ── TOGGLE USER (ban/unban) ──
    if (action === "toggle_active") {
      const { user_id, active } = body;
      if (!user_id) return jsonResp({ error: "user_id required" }, 400);

      const { error } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: active ? "none" : "876600h",
      });
      if (error) return jsonResp({ error: error.message }, 400);

      return jsonResp({ success: true });
    }

    // ── DELETE USER ──
    if (action === "delete_user") {
      const { user_id } = body;
      if (!user_id) return jsonResp({ error: "user_id required" }, 400);

      // Protect system owner
      const { data: targetAuth } = await adminClient.auth.admin.getUserById(user_id);
      if (targetAuth?.user?.email === "qwork@qworkgroup.com") {
        return jsonResp({ error: "owner_protected" }, 403);
      }

      // Resolve app_user_id (memberships reference app_users.id, not auth uid)
      const { data: appUser } = await adminClient
        .from("app_users")
        .select("id")
        .eq("auth_user_id", user_id)
        .maybeSingle();
      const appUserId = appUser?.id;

      // 1. Wipe all dependents BEFORE deleting auth user (no CASCADE in DB)
      const cleanups: Promise<any>[] = [
        adminClient.from("user_permissions").delete().eq("user_id", user_id),
        adminClient.from("user_roles").delete().eq("user_id", user_id),
        adminClient.from("notifications").delete().eq("user_id", user_id),
        adminClient.from("partner_clients").delete().eq("partner_user_id", user_id),
        adminClient.from("user_usage").delete().eq("user_id", user_id),
        // Detach (don't delete) operational data so history is preserved
        adminClient.from("technicians").update({ user_id: null }).eq("user_id", user_id),
        adminClient.from("profiles").delete().eq("id", user_id),
      ];
      if (appUserId) {
        cleanups.push(
          adminClient.from("memberships").delete().eq("user_id", appUserId),
          adminClient.from("app_users").delete().eq("id", appUserId),
        );
      }
      const results = await Promise.allSettled(cleanups);
      const failures = results
        .map((r, i) => (r.status === "rejected" ? `[${i}] ${(r.reason as Error)?.message}` : null))
        .filter(Boolean);
      if (failures.length) {
        console.warn("[delete_user] cleanup warnings:", failures);
      }

      // 2. Delete the auth user
      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error && !error.message?.includes("not found") && !error.message?.includes("User not found")) {
        return jsonResp({ error: `auth.deleteUser: ${error.message}` }, 400);
      }

      return jsonResp({ success: true });
    }

    // ── CREATE USER ──
    const { email, full_name, role } = body;
    if (!email || !role) return jsonResp({ error: "email and role required" }, 400);

    const validRoles = ["admin", "partner", "technician", "client"];
    if (!validRoles.includes(role)) return jsonResp({ error: "invalid role" }, 400);

    // Generate temporary password
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
    let tempPassword = "";
    for (let i = 0; i < 12; i++) {
      tempPassword += chars[Math.floor(Math.random() * chars.length)];
    }

    // Create auth user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: full_name || email.split("@")[0],
        must_change_password: true,
      },
    });

    if (createError) {
      const msg = createError.message || "";
      if (msg.includes("already been registered") || msg.includes("email_exists")) {
        return jsonResp({ error: "Este email já está registrado no sistema." }, 400);
      }
      return jsonResp({ error: msg }, 400);
    }

    const userId = newUser.user.id;
    const displayName = full_name || email.split("@")[0];

    // Insert profile and role (triggers are removed, we do it manually)
    await adminClient.from("profiles").upsert({
      id: userId,
      full_name: displayName,
      email,
    }, { onConflict: "id" });

    await adminClient.from("user_roles").upsert({
      user_id: userId,
      role,
    }, { onConflict: "user_id" });

    return jsonResp({
      success: true,
      user_id: userId,
      temp_password: tempPassword,
    });

  } catch (err) {
    return jsonResp({ error: err.message || "Internal error" }, 500);
  }
});
