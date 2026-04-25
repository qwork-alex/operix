import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the caller is the owner
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (user.email !== "qwork@qworkgroup.com") {
      return new Response(JSON.stringify({ error: "Forbidden: only system owner can reset" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for admin operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get owner app_user id
    const { data: ownerAppUser } = await adminClient
      .from("app_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();

    if (!ownerAppUser) {
      return new Response(JSON.stringify({ error: "Owner app_user not found" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ownerAppUserId = ownerAppUser.id;
    const ownerAuthId = user.id;

    // 1. Delete memberships except owner's
    await adminClient.from("memberships").delete().neq("user_id", ownerAppUserId);

    // 2. Delete all invites
    await adminClient.from("invites").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // 3. Delete event logs
    await adminClient.from("backend_event_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // 4. Delete user_usage except owner
    await adminClient.from("user_usage").delete().neq("user_id", ownerAppUserId);

    // 5. Delete notifications except owner
    await adminClient.from("notifications").delete().neq("user_id", ownerAuthId);

    // 6. Delete user_roles except owner
    await adminClient.from("user_roles").delete().neq("user_id", ownerAuthId);

    // 7. Delete profiles except owner
    await adminClient.from("profiles").delete().neq("id", ownerAuthId);

    // 8. Delete workspaces not owned by owner
    await adminClient.from("workspaces").delete().neq("owner_user_id", ownerAppUserId);

    // 9. Delete app_users except owner
    await adminClient.from("app_users").delete().neq("id", ownerAppUserId);

    // 10. Delete auth users except owner using admin API
    const { data: authUsers } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    if (authUsers?.users) {
      for (const u of authUsers.users) {
        if (u.id !== ownerAuthId) {
          await adminClient.auth.admin.deleteUser(u.id);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, message: "System reset complete" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
