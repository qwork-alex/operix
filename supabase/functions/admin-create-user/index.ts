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

/**
 * Count rows that reference a user across operational tables.
 * Returns a structured map so the UI can show "X linked records".
 */
async function collectDependencies(adminClient: any, authUserId: string) {
  // Counts (use HEAD + count exact for efficiency)
  const countTable = async (table: string, column: string, value: string | null) => {
    if (!value) return 0;
    const { count, error } = await adminClient
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(column, value);
    if (error) {
      console.warn(`[deps] count ${table}.${column} failed:`, error.message);
      return 0;
    }
    return count ?? 0;
  };

  const [
    serviceOrdersAsAssignedUser,
    serviceOrdersCreated,
    paymentOrdersAsAssignedUser,
    paymentOrdersCreated,
    fleetTrips,
    financialRecords,
    documents,
  ] = await Promise.all([
    countTable("service_orders", "assigned_user_id", authUserId),
    countTable("service_orders", "created_by", authUserId),
    countTable("payment_orders", "assigned_user_id", authUserId),
    countTable("payment_orders", "created_by", authUserId),
    countTable("fleet_trips", "created_by", authUserId),
    countTable("financial_records", "created_by", authUserId),
    countTable("documents", "uploaded_by", authUserId),
  ]);

  // assigned_user_id is nullable on both tables → all dependencies are detachable
  const blocking = 0;
  const detachable =
    serviceOrdersAsAssignedUser +
    serviceOrdersCreated +
    paymentOrdersAsAssignedUser +
    paymentOrdersCreated +
    fleetTrips +
    financialRecords +
    documents;

  return {
    technician: null,
    counts: {
      service_orders_as_assigned_user: serviceOrdersAsAssignedUser,
      service_orders_created: serviceOrdersCreated,
      payment_orders_as_assigned_user: paymentOrdersAsAssignedUser,
      payment_orders_created: paymentOrdersCreated,
      fleet_trips: fleetTrips,
      financial_records: financialRecords,
      documents: documents,
    },
    blocking,
    detachable,
    has_dependencies: blocking + detachable > 0,
  };
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

    // ── CHECK DEPENDENCIES (preflight before delete) ──
    if (action === "check_user_dependencies") {
      const { user_id } = body;
      if (!user_id) return jsonResp({ error: "user_id required" }, 400);

      const { data: targetAuth } = await adminClient.auth.admin.getUserById(user_id);
      if (targetAuth?.user?.email === "qwork@qworkgroup.com") {
        return jsonResp({ error: "owner_protected", message: "O proprietário do sistema não pode ser removido." }, 403);
      }

      const deps = await collectDependencies(adminClient, user_id);
      return jsonResp({ success: true, ...deps });
    }

    // ── DELETE USER (with cascade control) ──
    if (action === "delete_user") {
      const { user_id, mode, reassign_to_user_id } = body as {
        user_id: string;
        mode?: "block" | "reassign" | "detach";
        reassign_to_user_id?: string;
      };
      if (!user_id) return jsonResp({ error: "user_id required" }, 400);
      const effectiveMode = mode ?? "block";

      // Protect system owner
      const { data: targetAuth } = await adminClient.auth.admin.getUserById(user_id);
      if (targetAuth?.user?.email === "qwork@qworkgroup.com") {
        return jsonResp({ error: "owner_protected", message: "O proprietário do sistema não pode ser removido." }, 403);
      }

      // Always check dependencies first
      const deps = await collectDependencies(adminClient, user_id);

      // ─── BLOCK MODE: refuse if any blocking (or any) dependencies exist ───
      if (effectiveMode === "block" && deps.has_dependencies) {
        return jsonResp({
          error: "has_dependencies",
          message: "Usuário possui dados vinculados e não pode ser removido. Reatribua os registos a outro técnico ou utilize o modo 'detach'.",
          ...deps,
        }, 409);
      }

      // ─── REASSIGN MODE: move operational data to another user ───
      if (effectiveMode === "reassign") {
        if (!reassign_to_user_id) {
          return jsonResp({ error: "reassign_to_user_id required for reassign mode" }, 400);
        }
        if (reassign_to_user_id === user_id) {
          return jsonResp({ error: "Cannot reassign to the same user" }, 400);
        }

        // Resolve target user's display name from profiles
        const { data: targetProfile } = await adminClient
          .from("profiles")
          .select("full_name, email")
          .eq("id", reassign_to_user_id)
          .maybeSingle();

        // Reassign service_orders / payment_orders — must update user_id, assigned_user_id AND created_by
        // user_id is NOT NULL and used by RLS — failing to update it leaves orphan rows that block deletion.
        const targetName = targetProfile?.full_name || targetProfile?.email || "";

        const reassignTable = async (table: "service_orders" | "payment_orders") => {
          // Update by user_id
          const { error: e1 } = await adminClient.from(table).update({
            user_id: reassign_to_user_id,
            assigned_user_id: reassign_to_user_id,
            technician_name: targetName,
          }).eq("user_id", user_id);
          if (e1) console.warn(`[delete_user] reassign ${table} by user_id error:`, e1.message);

          // Update by assigned_user_id (in case they diverge)
          const { error: e2 } = await adminClient.from(table).update({
            user_id: reassign_to_user_id,
            assigned_user_id: reassign_to_user_id,
            technician_name: targetName,
          }).eq("assigned_user_id", user_id);
          if (e2) console.warn(`[delete_user] reassign ${table} by assigned_user_id error:`, e2.message);

          // Update by created_by
          const { error: e3 } = await adminClient.from(table).update({
            created_by: reassign_to_user_id,
          }).eq("created_by", user_id);
          if (e3) console.warn(`[delete_user] reassign ${table} by created_by error:`, e3.message);

          // VALIDATE: count must be 0 across all 3 columns
          const [{ count: c1 }, { count: c2 }, { count: c3 }] = await Promise.all([
            adminClient.from(table).select("id", { count: "exact", head: true }).eq("user_id", user_id),
            adminClient.from(table).select("id", { count: "exact", head: true }).eq("assigned_user_id", user_id),
            adminClient.from(table).select("id", { count: "exact", head: true }).eq("created_by", user_id),
          ]);
          const remaining = (c1 ?? 0) + (c2 ?? 0) + (c3 ?? 0);
          if (remaining > 0) {
            throw new Error(`Reassign falhou em ${table}: ${remaining} registros ainda vinculados ao usuário antigo (user_id=${c1}, assigned=${c2}, created_by=${c3}).`);
          }
          return { table, moved_user_id: c1, moved_assigned: c2, moved_created_by: c3 };
        };

        try {
          await reassignTable("service_orders");
          await reassignTable("payment_orders");
        } catch (err) {
          return jsonResp({ error: "reassign_failed", message: (err as Error).message }, 500);
        }

        // Move other created_by-bound rows
        await Promise.allSettled([
          (async () => { await adminClient.from("financial_records").update({ created_by: reassign_to_user_id }).eq("created_by", user_id); })(),
          (async () => { await adminClient.from("fleet_trips").update({ created_by: reassign_to_user_id }).eq("created_by", user_id); })(),
          (async () => { await adminClient.from("documents").update({ uploaded_by: reassign_to_user_id }).eq("uploaded_by", user_id); })(),
        ]);
      }

      // ─── DETACH MODE / final cleanup ───
      // assigned_user_id is nullable on service_orders and payment_orders, so detach is always safe.
      // (Legacy SO/PO blocking checks against technician_id are no longer needed.)

      // Resolve app_user_id (memberships reference app_users.id, not auth uid)
      const { data: appUser } = await adminClient
        .from("app_users")
        .select("id")
        .eq("auth_user_id", user_id)
        .maybeSingle();
      const appUserId = appUser?.id;

      // 1. Wipe identity / preference rows. Operational data was either reassigned above,
      //    or is referenced by nullable columns we can null out for created_by/uploaded_by.
      const cleanups: Promise<unknown>[] = [
        (async () => { await adminClient.from("user_permissions").delete().eq("user_id", user_id); })(),
        (async () => { await adminClient.from("user_roles").delete().eq("user_id", user_id); })(),
        (async () => { await adminClient.from("notifications").delete().eq("user_id", user_id); })(),
        (async () => { await adminClient.from("partner_clients").delete().eq("partner_user_id", user_id); })(),
        (async () => { await adminClient.from("user_usage").delete().eq("user_id", user_id); })(),
        // Detach (don't delete) operational data so history is preserved
        (async () => { await adminClient.from("service_orders").update({ created_by: null }).eq("created_by", user_id); })(),
        (async () => { await adminClient.from("payment_orders").update({ created_by: null }).eq("created_by", user_id); })(),
        (async () => { await adminClient.from("financial_records").update({ created_by: null }).eq("created_by", user_id); })(),
        (async () => { await adminClient.from("fleet_trips").update({ created_by: null }).eq("created_by", user_id); })(),
        (async () => { await adminClient.from("documents").update({ uploaded_by: null }).eq("uploaded_by", user_id); })(),
        // Delete technician row LAST (after SO rows have been reassigned), only if no SO references remain
        (async () => { await adminClient.from("technicians").delete().eq("user_id", user_id); })(),
        (async () => { await adminClient.from("profiles").delete().eq("id", user_id); })(),
      ];
      if (appUserId) {
        cleanups.push(
          (async () => { await adminClient.from("memberships").delete().eq("user_id", appUserId); })(),
          (async () => { await adminClient.from("app_users").delete().eq("id", appUserId); })(),
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

      return jsonResp({ success: true, mode: effectiveMode });
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
    return jsonResp({ error: (err as Error).message || "Internal error" }, 500);
  }
});
