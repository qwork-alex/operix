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
  // Phase B3.1b: use canonical ownership map RPC as single source of truth.
  const { data: map, error } = await adminClient.rpc("get_user_ownership_map", { _uid: authUserId });
  if (error) {
    console.error("[deps] get_user_ownership_map failed:", error.message);
    return {
      technician: null,
      counts: {},
      blocking: 0,
      detachable: 0,
      identity: 0,
      has_dependencies: false,
      map: null,
      error: error.message,
    };
  }
  const totals = (map?.totals ?? {}) as { blocking?: number; detachable?: number; identity?: number };
  // Backwards-compatible flat counts for the existing UI dialog.
  const flat = {
    service_orders_as_assigned_user: map?.blocking?.service_orders_assigned_user_id ?? 0,
    service_orders_created: map?.detachable?.service_orders_created_by ?? 0,
    payment_orders_as_assigned_user: map?.blocking?.payment_orders_assigned_user_id ?? 0,
    payment_orders_created: map?.detachable?.payment_orders_created_by ?? 0,
    fleet_trips: map?.detachable?.fleet_trips_created_by ?? 0,
    financial_records:
      (map?.detachable?.financial_records_user_id ?? 0) +
      (map?.detachable?.financial_records_assigned_user_id ?? 0) +
      (map?.detachable?.financial_records_created_by ?? 0),
    documents: map?.detachable?.documents_uploaded_by ?? 0,
  };
  return {
    technician: null,
    counts: flat,
    blocking: totals.blocking ?? 0,
    detachable: totals.detachable ?? 0,
    identity: totals.identity ?? 0,
    // "has_dependencies" preserves old semantics (any ownership row),
    // but `blocking` is what gates deletion now.
    has_dependencies: (totals.blocking ?? 0) + (totals.detachable ?? 0) > 0,
    map,
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

    // ── CLEANUP ORPHAN USER (remove all references for a user_id that no longer exists in auth) ──
    if (action === "cleanup_orphan_user") {
      const { user_id } = body;
      if (!user_id) return jsonResp({ error: "user_id required" }, 400);

      console.log("🧹 CLEANUP ORPHAN USER iniciado:", user_id);

      // Safety: confirm user does NOT exist in auth (we only cleanup orphans)
      const { data: stillExists } = await adminClient.auth.admin.getUserById(user_id);
      if (stillExists?.user) {
        console.warn("⚠️ Usuário ainda existe no auth — abortando cleanup:", user_id);
        return jsonResp({
          error: "user_still_exists_in_auth",
          message: "O usuário ainda existe no Auth. Use 'delete_user' ou 'force_delete' para removê-lo primeiro.",
        }, 409);
      }

      // Resolve app_user_id (memberships reference it, not auth uid)
      const { data: appUser } = await adminClient
        .from("app_users")
        .select("id")
        .eq("auth_user_id", user_id)
        .maybeSingle();
      const appUserId = appUser?.id ?? null;

      type Op = { table: string; mode: "delete" | "null"; column: string; nullCols?: string[] };
      const ops: Op[] = [
        // Detach (preserve history)
        { table: "service_orders",   mode: "null",   column: "user_id",          nullCols: ["created_by"] },
        { table: "service_orders",   mode: "null",   column: "assigned_user_id", nullCols: ["assigned_user_id"] },
        { table: "service_orders",   mode: "null",   column: "created_by",       nullCols: ["created_by"] },
        { table: "payment_orders",   mode: "null",   column: "user_id",          nullCols: ["created_by"] },
        { table: "payment_orders",   mode: "null",   column: "assigned_user_id", nullCols: ["assigned_user_id"] },
        { table: "payment_orders",   mode: "null",   column: "created_by",       nullCols: ["created_by"] },
        { table: "financial_records", mode: "null",  column: "created_by",       nullCols: ["created_by"] },
        { table: "financial_records", mode: "null",  column: "user_id",          nullCols: ["user_id"] },
        { table: "financial_records", mode: "null",  column: "assigned_user_id", nullCols: ["assigned_user_id"] },
        { table: "fleet_trips",      mode: "null",   column: "created_by",       nullCols: ["created_by"] },
        { table: "documents",        mode: "null",   column: "uploaded_by",      nullCols: ["uploaded_by"] },
        // Hard delete (identity / preferences)
        { table: "user_permissions", mode: "delete", column: "user_id" },
        { table: "user_roles",       mode: "delete", column: "user_id" },
        { table: "notifications",    mode: "delete", column: "user_id" },
        { table: "partner_clients",  mode: "delete", column: "partner_user_id" },
        { table: "user_usage",       mode: "delete", column: "user_id" },
        { table: "user_settings",    mode: "delete", column: "user_id" },
        { table: "technicians",      mode: "delete", column: "user_id" },
        { table: "profiles",         mode: "delete", column: "id" },
      ];

      const log: Array<{ table: string; mode: string; column: string; affected: number; error?: string }> = [];

      for (const op of ops) {
        try {
          // Count first
          const { count } = await adminClient
            .from(op.table)
            .select("*", { count: "exact", head: true })
            .eq(op.column, user_id);
          const affected = count ?? 0;
          if (affected === 0) {
            log.push({ table: op.table, mode: op.mode, column: op.column, affected: 0 });
            continue;
          }
          if (op.mode === "delete") {
            const { error } = await adminClient.from(op.table).delete().eq(op.column, user_id);
            log.push({ table: op.table, mode: "delete", column: op.column, affected, error: error?.message });
          } else {
            const patch: Record<string, null> = {};
            for (const c of op.nullCols ?? [op.column]) patch[c] = null;
            const { error } = await adminClient.from(op.table).update(patch).eq(op.column, user_id);
            log.push({ table: op.table, mode: "null", column: op.column, affected, error: error?.message });
          }
        } catch (e) {
          log.push({ table: op.table, mode: op.mode, column: op.column, affected: 0, error: (e as Error).message });
        }
      }

      // app_users (and memberships) — handled separately via appUserId
      if (appUserId) {
        try {
          const { count: mCount } = await adminClient
            .from("memberships").select("*", { count: "exact", head: true }).eq("user_id", appUserId);
          const { error: mErr } = await adminClient.from("memberships").delete().eq("user_id", appUserId);
          log.push({ table: "memberships", mode: "delete", column: "user_id(app_user)", affected: mCount ?? 0, error: mErr?.message });
        } catch (e) {
          log.push({ table: "memberships", mode: "delete", column: "user_id(app_user)", affected: 0, error: (e as Error).message });
        }
      }
      try {
        const { count: aCount } = await adminClient
          .from("app_users").select("*", { count: "exact", head: true }).eq("auth_user_id", user_id);
        const { error: aErr } = await adminClient.from("app_users").delete().eq("auth_user_id", user_id);
        log.push({ table: "app_users", mode: "delete", column: "auth_user_id", affected: aCount ?? 0, error: aErr?.message });
      } catch (e) {
        log.push({ table: "app_users", mode: "delete", column: "auth_user_id", affected: 0, error: (e as Error).message });
      }

      const totalRemoved = log.reduce((s, r) => s + (r.mode === "delete" ? r.affected : 0), 0);
      const totalDetached = log.reduce((s, r) => s + (r.mode === "null" ? r.affected : 0), 0);

      console.log("🧹 CLEANUP RESULTADO:", { user_id, totalRemoved, totalDetached, log });
      return jsonResp({ success: true, user_id, total_removed: totalRemoved, total_detached: totalDetached, log });
    }

    // ── DEACTIVATE USER (SAFE MODE) — ban + revoke access, preserve data ──
    if (action === "deactivate_user_safe") {
      const { user_id } = body;
      if (!user_id) return jsonResp({ error: "user_id required" }, 400);

      // Protect system owner
      const { data: targetAuth } = await adminClient.auth.admin.getUserById(user_id);
      if (targetAuth?.user?.email === "qwork@qworkgroup.com") {
        return jsonResp({ error: "owner_protected", message: "O proprietário do sistema não pode ser desativado." }, 403);
      }

      const log: Record<string, unknown> = { user_id };

      // 1. Ban user in auth (100 years)
      const banDuration = "876000h"; // ~100 years
      const { error: banErr } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: banDuration,
      });
      if (banErr) {
        console.error("❌ Ban failed:", banErr);
        return jsonResp({ error: `ban_failed: ${banErr.message}` }, 400);
      }
      console.log("User deactivated successfully");
      log.banned = true;

      // 2. Remove access bindings (idempotent — safe to run multiple times)
      const { error: rolesErr } = await adminClient.from("user_roles").delete().eq("user_id", user_id);
      const { error: permsErr } = await adminClient.from("user_permissions").delete().eq("user_id", user_id);
      const { error: techErr }  = await adminClient.from("technicians").delete().eq("user_id", user_id);

      // memberships uses app_users.id, not auth uid
      const { data: appUser } = await adminClient
        .from("app_users").select("id").eq("auth_user_id", user_id).maybeSingle();
      let membErr: any = null;
      if (appUser?.id) {
        const r = await adminClient.from("memberships").delete().eq("user_id", appUser.id);
        membErr = r.error;
      }

      console.log("Permissions removed");
      log.user_roles_error = rolesErr?.message ?? null;
      log.user_permissions_error = permsErr?.message ?? null;
      log.technicians_error = techErr?.message ?? null;
      log.memberships_error = membErr?.message ?? null;

      console.log("User hidden from system");
      return jsonResp({ success: true, ...log });
    }

    // ── FORCE DELETE (test endpoint — bypass dependency checks) ──
    if (action === "force_delete") {
      const { user_id } = body;
      if (!user_id) return jsonResp({ error: "user_id required" }, 400);

      console.log("🚨 FORCE DELETE EXECUTADO", user_id);
      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error) {
        console.error("❌ ERRO FORCE DELETE:", error);
        return jsonResp({ error: error.message }, 400);
      }
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

      // Always check dependencies first (canonical map)
      const deps = await collectDependencies(adminClient, user_id);

      console.log("🧠 DEPENDÊNCIAS:", deps);

      // ─── BLOCK MODE: refuse only if BLOCKING refs exist (NOT NULL ownership in SO/PO).
      // Detachable refs (financial_records, documents, created_by, …) are nullable and
      // will be cleaned up safely below.
      if (effectiveMode === "block" && (deps.blocking ?? 0) > 0) {
        console.log("⛔ DELETE BLOQUEADO POR REFERÊNCIAS NÃO-NULAS");
        return jsonResp({
          error: "has_blocking_dependencies",
          message: "Usuário possui ordens de serviço/pagamento atribuídas. Reatribua a outro usuário antes de excluir.",
          ...deps,
        }, 409);
      }

      // ─── DETACH is ALWAYS allowed when blocking==0. Cleanup nulls every nullable owner column.
      if (effectiveMode === "detach" && (deps.blocking ?? 0) > 0) {
        return jsonResp({
          error: "reassign_required",
          message: "Não é possível desanexar: existem ordens com ownership obrigatório. Use o modo 'reassign'.",
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
        // Phase B3.1b: financial_records has 3 nullable owner columns. Null them ALL,
        // including orphan auto-synced revenue rows that no longer reference any SO/PO.
        (async () => { await adminClient.from("financial_records").update({ created_by: null }).eq("created_by", user_id); })(),
        (async () => { await adminClient.from("financial_records").update({ user_id: null }).eq("user_id", user_id); })(),
        (async () => { await adminClient.from("financial_records").update({ assigned_user_id: null }).eq("assigned_user_id", user_id); })(),
        // Detach also other nullable owner columns surfaced by the ownership map
        (async () => { await adminClient.from("clients").update({ user_id: null }).eq("user_id", user_id); })(),
        (async () => { await adminClient.from("clients").update({ created_by: null }).eq("created_by", user_id); })(),
        (async () => { await adminClient.from("profit_rules").update({ created_by: null }).eq("created_by", user_id); })(),
        (async () => { await adminClient.from("profit_rules").update({ assigned_user_id: null }).eq("assigned_user_id", user_id); })(),
        (async () => { await adminClient.from("profit_distributions").update({ created_by: null }).eq("created_by", user_id); })(),
        (async () => { await adminClient.from("profit_distributions").update({ target_user_id: null }).eq("target_user_id", user_id); })(),
        (async () => { await adminClient.from("drivers").update({ created_by: null }).eq("created_by", user_id); })(),
        (async () => { await adminClient.from("fleet_fuel_logs").update({ created_by: null }).eq("created_by", user_id); })(),
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

      // 2. FINAL VALIDATION: confirm zero remaining links across critical tables before deleting auth user
      const finalDeps = await collectDependencies(adminClient, user_id);
      const totalRemaining =
        finalDeps.counts.service_orders_as_assigned_user +
        finalDeps.counts.service_orders_created +
        finalDeps.counts.payment_orders_as_assigned_user +
        finalDeps.counts.payment_orders_created;
      if (totalRemaining > 0) {
        return jsonResp({
          error: "links_still_present",
          message: `Não é possível excluir: ainda existem ${totalRemaining} vínculos em service_orders/payment_orders. Reatribua antes de excluir.`,
          ...finalDeps,
        }, 409);
      }

      // 3. Delete the auth user
      console.log("🔥 DELETE AUTH DISPARADO:", user_id);
      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error) {
        console.error("❌ ERRO AO DELETAR AUTH:", error);
      } else {
        console.log("✅ USER DELETADO DO AUTH");
      }
      if (error && !error.message?.includes("not found") && !error.message?.includes("User not found")) {
        return jsonResp({ error: `auth.deleteUser: ${error.message}` }, 400);
      }

      return jsonResp({ success: true, mode: effectiveMode });
    }

    // ── CREATE USER ──
    const { full_name, role } = body;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !role) return jsonResp({ error: "email and role required" }, 400);

    // Validate email format before calling Supabase auth (which returns a generic 400)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return jsonResp({ error: "Formato de email inválido. Verifique e tente novamente." }, 400);
    }

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
