import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.49.1/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client with caller's JWT to check role
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "not_authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { email, full_name, role, action } = body;

    // ── TOGGLE USER (ban/unban) ──
    if (action === "toggle_active") {
      const { user_id, active } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (active) {
        // Unban
        const { error } = await adminClient.auth.admin.updateUserById(user_id, {
          ban_duration: "none",
        });
        if (error) throw error;
      } else {
        // Ban (effectively disable)
        const { error } = await adminClient.auth.admin.updateUserById(user_id, {
          ban_duration: "876600h", // ~100 years
        });
        if (error) throw error;
      }

      await adminClient.from("backend_event_logs").insert({
        table_name: "auth",
        action: active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
        row_id: user_id,
        actor_user_id: caller.id,
        payload: { user_id, active },
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DELETE USER ──
    if (action === "delete_user") {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete role first
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      // Delete profile
      await adminClient.from("profiles").delete().eq("id", user_id);
      // Delete auth user
      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error) throw error;

      await adminClient.from("backend_event_logs").insert({
        table_name: "auth",
        action: "USER_DELETED",
        row_id: user_id,
        actor_user_id: caller.id,
        payload: { user_id },
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CREATE USER ──
    if (!email || !role) {
      return new Response(JSON.stringify({ error: "email and role required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validRoles = ["admin", "partner", "technician", "client"];
    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: "invalid role" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate temporary password
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
    let tempPassword = "";
    for (let i = 0; i < 12; i++) {
      tempPassword += chars[Math.floor(Math.random() * chars.length)];
    }

    // Create auth user with auto-confirm
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: full_name || email.split("@")[0],
        must_change_password: true,
      },
    });

    if (createError) throw createError;

    // Assign role
    await adminClient.from("user_roles").insert({
      user_id: newUser.user.id,
      role,
    });

    // Ensure profile exists (trigger should handle, but be safe)
    await adminClient.from("profiles").upsert({
      id: newUser.user.id,
      full_name: full_name || email.split("@")[0],
      email,
    }, { onConflict: "id" });

    // Log
    await adminClient.from("backend_event_logs").insert({
      table_name: "auth",
      action: "ADMIN_CREATE_USER",
      row_id: newUser.user.id,
      actor_user_id: caller.id,
      payload: { email, role, full_name: full_name || null },
    });

    return new Response(JSON.stringify({
      success: true,
      user_id: newUser.user.id,
      temp_password: tempPassword,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
