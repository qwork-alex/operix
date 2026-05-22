/**
 * RealtimeHub — singleton broker for Supabase postgres_changes.
 *
 * Goals:
 *  - 1 channel per (schema, table, event, filter) tuple — automatic dedup
 *  - Stable channel names (no Math.random) → no orphan channels on remount
 *  - Refcount per subscription key → safe cleanup, no leaks
 *  - workspace_id filter is recommended (passed as `workspaceId`) → builds
 *    a server-side filter so we don't receive cross-workspace events
 *  - Drop-in API: `subscribe(opts, handler) => unsubscribe`
 *  - Resilient: late subscribers attach to the existing channel; last
 *    unsubscribe removes the channel from the supabase client.
 *
 * Non-goals (intentional):
 *  - No internal polling / heartbeat. The supabase-js socket already
 *    reconnects automatically.
 *  - No business logic. Pure plumbing.
 */
import { supabase } from "@/integrations/supabase/client";
import { recordRealtimeEvent } from "@/lib/observability";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type PgEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

export interface SubscribeOptions {
  table: string;
  event?: PgEvent;          // default "*"
  schema?: string;          // default "public"
  /** When provided, adds `workspace_id=eq.${workspaceId}` server-side filter. */
  workspaceId?: string | null;
  /** Raw filter override (takes precedence over workspaceId). */
  filter?: string;
}

type Listener = (payload: unknown) => void;

interface Entry {
  channel: RealtimeChannel;
  listeners: Set<Listener>;
}

const registry = new Map<string, Entry>();

function buildFilter(opts: SubscribeOptions): string | undefined {
  if (opts.filter) return opts.filter;
  if (opts.workspaceId) return `workspace_id=eq.${opts.workspaceId}`;
  return undefined;
}

function buildKey(opts: SubscribeOptions): string {
  const schema = opts.schema ?? "public";
  const event = opts.event ?? "*";
  const filter = buildFilter(opts) ?? "all";
  return `rt:${schema}.${opts.table}|${event}|${filter}`;
}

/**
 * Subscribe to a postgres_changes feed.
 * Returns an unsubscribe function (idempotent).
 */
export function subscribe(opts: SubscribeOptions, handler: Listener): () => void {
  const key = buildKey(opts);
  let entry = registry.get(key);

  if (!entry) {
    const config: any = {
      event: opts.event ?? "*",
      schema: opts.schema ?? "public",
      table: opts.table,
    };
    const filter = buildFilter(opts);
    if (filter) config.filter = filter;

    const channel = supabase
      .channel(key)
      .on("postgres_changes", config, (payload: unknown) => {
        recordRealtimeEvent();
        const e = registry.get(key);
        if (!e) return;
        for (const fn of e.listeners) {
          try { fn(payload); } catch (err) { console.error("[RealtimeHub] listener error", err); }
        }
      })
      .subscribe();

    entry = { channel, listeners: new Set() };
    registry.set(key, entry);
  }

  entry.listeners.add(handler);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const e = registry.get(key);
    if (!e) return;
    e.listeners.delete(handler);
    if (e.listeners.size === 0) {
      supabase.removeChannel(e.channel);
      registry.delete(key);
    }
  };
}

/** Diagnostics — read-only snapshot of active channels and listener counts. */
export function getHubSnapshot() {
  return Array.from(registry.entries()).map(([key, e]) => ({
    key,
    listeners: e.listeners.size,
  }));
}

/** Force-tear-down everything. Used only in tests / hard resets. */
export function resetHub() {
  for (const [, e] of registry) supabase.removeChannel(e.channel);
  registry.clear();
}

export const RealtimeHub = { subscribe, getHubSnapshot, resetHub };
export default RealtimeHub;
