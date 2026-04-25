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
  // Resolve technician id (operational tables reference technicians.id, not auth uid)
  const { data: tech } = await adminClient
    .from("technicians")
    .select("id, name")
    .eq("user_id", authUserId)
    .maybeSingle();
  const technicianId: string | null = tech?.id ?? null;

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
    serviceOrdersAsTech,
    serviceOrdersCreated,
    paymentOrdersAsTech,
    paymentOrdersCreated,
    fleetTrips,
    financialRecords,
    documents,
  ] = await Promise.all([
    countTable("service_orders", "technician_id", technicianId),
    countTable("service_orders", "created_by", authUserId),
    countTable("payment_orders", "technician_id", technicianId),
    countTable("payment_orders", "created_by", authUserId),
    countTable("fleet_trips", "created_by", authUserId),
    countTable("financial_records", "created_by", authUserId),
    countTable("documents", "uploaded_by", authUserId),
  ]);

  // service_orders.technician_id is NOT NULL → blocking dependency
  const blocking = serviceOrdersAsTech;
  // Other refs are nullable / can be detached
  const detachable =
    serviceOrdersCreated +
    paymentOrdersAsTech +
    paymentOrdersCreated +
    fleetTrips +
    financialRecords +
    documents;

  return {
    technician: tech ? { id: tech.id, name: tech.name } : null,
    counts: {
      service_orders_as_technician: serviceOrdersAsTech,
      service_orders_created: serviceOrdersCreated,
      payment_orders_as_technician: paymentOrdersAsTech,
      payment_orders_created: paymentOrdersCreated,
      fleet_trips: fleetTrips,
      financial_records: financialRecords,
      documents: documents,
    },
    blocking,        // count that prevents hard delete unless reassigned
    detachable,      // count that can be safely set to null / kept as orphan history
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

        // Resolve target technician
        const { data: targetTech } = await adminClient
          .from("technicians")
          .select("id, name")
          .eq("user_id", reassign_to_user_id)
          .maybeSingle();

        // For service_orders.technician_id (NOT NULL), reassign requires a valid target technician
        if (deps.counts.service_orders_as_technician > 0 && !targetTech?.id) {
          return jsonResp({
            error: "target_not_technician",
            message: "O usuário destino não é um técnico válido. Selecione outro técnico para reatribuição.",
          }, 400);
        }

        // Move technician-bound rows
        if (deps.technician?.id && targetTech?.id) {
          const moves: Promise<unknown>[] = [
            (async () => { await adminClient.from("service_orders").update({
              technician_id: targetTech.id,
              technician_name: targetTech.name ?? "",
            }).eq("technician_id", deps.technician.id); })(),
            (async () => { await adminClient.from("payment_orders").update({
              technician_id: targetTech.id,
              technician_name: targetTech.name ?? "",
            }).eq("technician_id", deps.technician.id); })(),
          ];
          const moveResults = await Promise.allSettled(moves);
          const moveFailures = moveResults
            .map((r, i) => (r.status === "rejected" ? `[move ${i}] ${(r.reason as Error)?.message}` : null))
            .filter(Boolean);
          if (moveFailures.length) console.warn("[delete_user] reassign warnings:", moveFailures);
        }

        // Move created_by-bound rows (auth uid based)
        const createdByMoves: Promise<unknown>[] = [
          (async () => { await adminClient.from("service_orders").update({ created_by: reassign_to_user_id }).eq("created_by", user_id); })(),
          (async () => { await adminClient.from("payment_orders").update({ created_by: reassign_to_user_id }).eq("created_by", user_id); })(),
          (async () => { await adminClient.from("financial_records").update({ created_by: reassign_to_user_id }).eq("created_by", user_id); })(),
          (async () => { await adminClient.from("fleet_trips").update({ created_by: reassign_to_user_id }).eq("created_by", user_id); })(),
          (async () => { await adminClient.from("documents").update({ uploaded_by: reassign_to_user_id }).eq("uploaded_by", user_id); })(),
        ];
        await Promise.allSettled(createdByMoves);
      }

      // ─── DETACH MODE / final cleanup ───
      // Even after reassignment we still need to wipe identity refs (roles, perms, profile, app_user, technician row)
      // If service_orders still reference this technician (detach mode + remaining rows), it would fail the NOT NULL constraint.
      // In detach mode, only proceed if no SO rows reference the technician; otherwise refuse.
      if (effectiveMode === "detach" && deps.counts.service_orders_as_technician > 0) {
        return jsonResp({
          error: "has_blocking_dependencies",
          message: "Não é possível desanexar: existem ordens de serviço a referenciar este técnico. Reatribua a outro técnico.",
          ...deps,
        }, 409);
      }

      // Resolve app_user_id (memberships reference app_users.id, not auth uid)
      const { data: appUser } = await adminClient
        .from("app_users")
        .select("id")
        .eq("auth_user_id", user_id)
        .maybeSingle();
      const appUserId = appUser?.id;

      // 1. Wipe identity / preference rows. Operational data was either reassigned above,
      //    or is referenced by nullable columns we can null out for created_by/uploaded_by.
      const cleanups: Promise<any>[] = [
        adminClient.from("user_permissions").delete().eq("user_id", user_id),
        adminClient.from("user_roles").delete().eq("user_id", user_id),
        adminClient.from("notifications").delete().eq("user_id", user_id),
        adminClient.from("partner_clients").delete().eq("partner_user_id", user_id),
        adminClient.from("user_usage").delete().eq("user_id", user_id),
        // Detach (don't delete) operational data so history is preserved
        adminClient.from("service_orders").update({ created_by: null }).eq("created_by", user_id),
        adminClient.from("payment_orders").update({ created_by: null }).eq("created_by", user_id),
        adminClient.from("financial_records").update({ created_by: null }).eq("created_by", user_id),
        adminClient.from("fleet_trips").update({ created_by: null }).eq("created_by", user_id),
        adminClient.from("documents").update({ uploaded_by: null }).eq("uploaded_by", user_id),
        // Delete technician row LAST (after SO rows have been reassigned), only if no SO references remain
        adminClient.from("technicians").delete().eq("user_id", user_id),
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
