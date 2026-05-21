// run-automation-engine — drains automation_queue, evaluates rules, executes
// actions, writes execution log, applies retry/dead-letter policy. Tenant-safe.
//
// Invoked by:
//   - pg_cron (every minute)
//   - manual fetch from AutomationsPage ("Run now")
//
// SAFE MODE: never touches auth, RBAC, memberships. Uses service role to bypass
// the user-write block on queue/exec/dead tables (which is by design).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BATCH_SIZE = 100;
const ACTION_TIMEOUT_MS = 5_000;
const GLOBAL_EXEC_TIMEOUT_MS = 30_000;

type Op = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "in" | "exists" | "truthy";
interface Condition { path: string; op: Op; value?: unknown }
interface Action {
  type: "notify" | "update_status" | "audit" | "webhook" | "assign_user";
  [k: string]: unknown;
}
interface Rule {
  id: string; workspace_id: string; name: string;
  trigger_type: string; conditions: Condition[]; actions: Action[];
  max_retries: number; retry_backoff_seconds: number;
  safe_mode: boolean; enabled: boolean;
}
interface QueueItem {
  id: string; workspace_id: string; rule_id: string | null;
  event_type: string; entity_type: string | null; entity_id: string | null;
  payload: any; source_correlation_id: string | null;
  depth: number; status: string; attempts: number;
}

function getPath(obj: any, path: string): unknown {
  if (!obj || !path) return undefined;
  return path.split(".").reduce<any>((a, k) => (a == null ? a : a[k]), obj);
}

function evalCondition(payload: any, c: Condition): boolean {
  const v = getPath(payload, c.path);
  switch (c.op) {
    case "eq": return v === c.value;
    case "neq": return v !== c.value;
    case "gt": return Number(v) > Number(c.value);
    case "gte": return Number(v) >= Number(c.value);
    case "lt": return Number(v) < Number(c.value);
    case "lte": return Number(v) <= Number(c.value);
    case "contains": return Array.isArray(v) ? v.includes(c.value) : String(v ?? "").includes(String(c.value ?? ""));
    case "in": return Array.isArray(c.value) && (c.value as unknown[]).includes(v);
    case "exists": return v !== undefined && v !== null;
    case "truthy": return Boolean(v);
    default: return false;
  }
}

function matchesAll(payload: any, conditions: Condition[]): boolean {
  if (!conditions?.length) return true;
  try { return conditions.every((c) => evalCondition(payload, c)); }
  catch { return false; }
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout:${label}`)), ms)),
  ]);
}

const SAFE_UPDATE_COLUMNS: Record<string, string[]> = {
  service_order: ["status", "priority", "notes", "assigned_user_id"],
  payment_order: ["status", "notes"],
};

const ENTITY_TABLE: Record<string, string> = {
  service_order: "service_orders",
  payment_order: "payment_orders",
  fleet_fuel_log: "fleet_fuel_logs",
};

async function execAction(
  admin: ReturnType<typeof createClient>,
  q: QueueItem,
  action: Action,
  log: any[],
  dryRun: boolean,
): Promise<void> {
  const correlation = `engine:${q.id}`;
  const ws = q.workspace_id;

  if (dryRun) {
    log.push({ type: action.type, dry_run: true, at: new Date().toISOString() });
    return;
  }

  switch (action.type) {
    case "notify": {
      const userId = (action.user_id as string) || (q.payload?.new?.assigned_user_id as string);
      if (!userId) { log.push({ type: "notify", skipped: "no user_id" }); return; }
      await withTimeout(
        admin.from("notifications").insert({
          workspace_id: ws, user_id: userId,
          type: (action.severity as string) || "info",
          title: String(action.title ?? "Automação"),
          message: String(action.message ?? ""),
          entity_type: q.entity_type, entity_id: q.entity_id,
        }) as unknown as Promise<unknown>,
        ACTION_TIMEOUT_MS, "notify",
      );
      log.push({ type: "notify", user_id: userId, at: new Date().toISOString() });
      break;
    }

    case "audit": {
      await withTimeout(
        admin.from("audit_log").insert({
          workspace_id: ws, table_name: q.entity_type ?? "automation",
          row_id: q.entity_id, operation: "SYSTEM", origin: "automation",
          new_values: { rule_id: q.rule_id, event: q.event_type, action },
          reason: String(action.reason ?? `automation:${q.rule_id}`),
        }) as unknown as Promise<unknown>,
        ACTION_TIMEOUT_MS, "audit",
      );
      log.push({ type: "audit", at: new Date().toISOString() });
      break;
    }

    case "update_status": {
      const table = ENTITY_TABLE[q.entity_type ?? ""];
      const allowed = SAFE_UPDATE_COLUMNS[q.entity_type ?? ""] ?? [];
      if (!table || !q.entity_id) { log.push({ type: "update_status", skipped: "no target" }); return; }
      const patch: Record<string, unknown> = {};
      for (const k of allowed) if (action[k] !== undefined) patch[k] = action[k];
      if (Object.keys(patch).length === 0) { log.push({ type: "update_status", skipped: "empty patch" }); return; }
      // Tenant-safe: scope by workspace_id
      await withTimeout(
        admin.from(table).update(patch).eq("id", q.entity_id).eq("workspace_id", ws) as unknown as Promise<unknown>,
        ACTION_TIMEOUT_MS, "update_status",
      );
      log.push({ type: "update_status", patch, at: new Date().toISOString() });
      break;
    }

    case "assign_user": {
      const table = ENTITY_TABLE[q.entity_type ?? ""];
      const userId = action.user_id as string;
      if (!table || !q.entity_id || !userId) { log.push({ type: "assign_user", skipped: "missing target/user" }); return; }
      await withTimeout(
        admin.from(table).update({ assigned_user_id: userId }).eq("id", q.entity_id).eq("workspace_id", ws) as unknown as Promise<unknown>,
        ACTION_TIMEOUT_MS, "assign_user",
      );
      log.push({ type: "assign_user", user_id: userId, at: new Date().toISOString() });
      break;
    }

    case "webhook": {
      const url = action.url as string;
      if (!url || !/^https?:\/\//i.test(url)) { log.push({ type: "webhook", skipped: "invalid url" }); return; }
      const res = await withTimeout(
        fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-automation-correlation": correlation },
          body: JSON.stringify({ event: q.event_type, entity: q.entity_type, entity_id: q.entity_id, payload: q.payload }),
        }),
        ACTION_TIMEOUT_MS, "webhook",
      );
      const body = await res.text().catch(() => "");
      log.push({ type: "webhook", status: res.status, body: body.slice(0, 200), at: new Date().toISOString() });
      if (!res.ok) throw new Error(`webhook ${res.status}`);
      break;
    }

    default:
      log.push({ type: action.type, skipped: "unknown action" });
  }
}

async function processItem(
  admin: ReturnType<typeof createClient>,
  q: QueueItem,
): Promise<void> {
  // Anti-recursion (belt and braces)
  if ((q.source_correlation_id ?? "").startsWith("engine:")) {
    await admin.from("automation_queue")
      .update({ status: "done", last_error: "recursion blocked" })
      .eq("id", q.id);
    return;
  }
  if (q.depth > 3) {
    await admin.from("automation_queue")
      .update({ status: "dead", last_error: "depth exceeded" })
      .eq("id", q.id);
    return;
  }

  // Mark processing
  await admin.from("automation_queue")
    .update({ status: "processing", attempts: q.attempts + 1 })
    .eq("id", q.id);

  // Load matching rules (workspace + trigger + enabled)
  const { data: rulesRaw } = await admin
    .from("automation_rules")
    .select("*")
    .eq("workspace_id", q.workspace_id)
    .eq("trigger_type", q.event_type)
    .eq("enabled", true);

  const rules = (rulesRaw ?? []) as unknown as Rule[];
  const matched = rules.filter((r) => matchesAll(q.payload, r.conditions ?? []));

  if (matched.length === 0) {
    await admin.from("automation_queue")
      .update({ status: "done", last_error: null })
      .eq("id", q.id);
    return;
  }

  const startedAt = Date.now();

  for (const rule of matched) {
    if (Date.now() - startedAt > GLOBAL_EXEC_TIMEOUT_MS) break;
    const log: any[] = [];
    let status: "success" | "failed" | "dry_run" = rule.safe_mode ? "dry_run" : "success";
    let error: string | null = null;

    try {
      for (const action of (rule.actions ?? [])) {
        await execAction(admin, q, action, log, rule.safe_mode);
      }
    } catch (e) {
      status = "failed";
      error = (e as Error)?.message ?? String(e);
    }

    await admin.from("automation_executions").insert({
      workspace_id: q.workspace_id,
      rule_id: rule.id, queue_id: q.id,
      finished_at: new Date().toISOString(),
      status, attempt: q.attempts + 1,
      actions_log: log, error, dry_run: rule.safe_mode,
    });

    // Retry / dead-letter
    if (status === "failed") {
      const maxR = rule.max_retries ?? 3;
      if (q.attempts + 1 >= maxR) {
        await admin.from("automation_dead_letter").insert({
          workspace_id: q.workspace_id, queue_id: q.id, rule_id: rule.id,
          last_error: error, attempts: q.attempts + 1, payload: q.payload,
          event_type: q.event_type,
        });
        await admin.from("automation_queue")
          .update({ status: "dead", last_error: error })
          .eq("id", q.id);
        return;
      } else {
        const backoff = (rule.retry_backoff_seconds ?? 30) * Math.pow(2, q.attempts);
        await admin.from("automation_queue").update({
          status: "failed", last_error: error,
          scheduled_at: new Date(Date.now() + backoff * 1000).toISOString(),
        }).eq("id", q.id);
        return;
      }
    }
  }

  await admin.from("automation_queue")
    .update({ status: "done", last_error: null })
    .eq("id", q.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Fetch pending or retryable items whose schedule is due
    const { data: items, error } = await admin
      .from("automation_queue")
      .select("*")
      .in("status", ["pending", "failed"])
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(BATCH_SIZE);
    if (error) throw error;

    const list = (items ?? []) as unknown as QueueItem[];
    let processed = 0;
    for (const q of list) {
      try {
        await processItem(admin, q);
        processed++;
      } catch (e) {
        await admin.from("automation_queue")
          .update({ status: "failed", last_error: (e as Error).message })
          .eq("id", q.id);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, fetched: list.length, processed }),
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }
});
