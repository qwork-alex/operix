/**
 * Global Operational Observer — singleton, idempotent, decoupled.
 *
 * Phase 2 of the AI Agent: starts ONCE at module load and feeds the
 * `agentBus` with runtime signals without touching React or providers.
 *
 * Observes:
 *  - window errors / unhandled promise rejections
 *  - network failures via lightweight fetch wrapper (failures only — no payload capture)
 *  - Supabase realtime channel transitions (best-effort via channel hook)
 *  - heartbeat: emits a soft "alive" tick every 60s for downstream timers
 *
 * Persists last 30 events to localStorage so the agent has memory across reloads.
 */
import { agentBus, type AgentEvent } from "./agentEventBus";
import "./runtimeDiagnostics"; // start passive runtime + realtime monitoring

const LS_KEY = "qwork.agent.events.v1";
const HEARTBEAT_MS = 60_000;


let started = false;

function persist(evt: AgentEvent) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr: AgentEvent[] = raw ? JSON.parse(raw) : [];
    arr.push(evt);
    while (arr.length > 30) arr.shift();
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  } catch {
    /* quota — ignore */
  }
}

export function loadPersistedAgentEvents(): AgentEvent[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as AgentEvent[]) : [];
  } catch {
    return [];
  }
}

export function startOperationalObserver() {
  if (started || typeof window === "undefined") return;
  started = true;

  // Mirror error/warn events to localStorage (memory layer)
  agentBus.subscribe((evt) => {
    if (evt.level === "error" || evt.level === "warn") persist(evt);
  });

  // --- Network failure observer (fetch wrapper) ---------------------
  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const started = performance.now();
    try {
      const res = await origFetch(...args);
      const ms = performance.now() - started;
      // Surface slow APIs (> 4s) and 5xx as operational warnings
      if (res.status >= 500) {
        agentBus.emit({
          kind: "sync_failure",
          level: "error",
          title: "API com falha",
          detail: `HTTP ${res.status} em ${shortUrl(args[0])}`,
        });
      } else if (ms > 4000) {
        agentBus.emit({
          kind: "operational_alert",
          level: "warn",
          title: "API lenta detectada",
          detail: `${Math.round(ms)}ms em ${shortUrl(args[0])}`,
        });
      }
      return res;
    } catch (err) {
      agentBus.emit({
        kind: "sync_failure",
        level: "error",
        title: "Falha de rede",
        detail: shortUrl(args[0]),
      });
      throw err;
    }
  };

  // --- Heartbeat tick (drives derived signals like "radar sem eventos") ---
  setInterval(() => {
    agentBus.emit({
      kind: "context_change",
      level: "info",
      title: "heartbeat",
      meta: { silent: true },
    });
  }, HEARTBEAT_MS);
}

function shortUrl(input: unknown): string {
  try {
    const url = typeof input === "string" ? input : (input as Request).url;
    return url.replace(/^https?:\/\/[^/]+/, "").slice(0, 80);
  } catch {
    return "request";
  }
}

// Auto-start on import (idempotent guard above).
startOperationalObserver();
