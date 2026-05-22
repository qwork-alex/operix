/**
 * Runtime Diagnostics Engine — passive observer of system health.
 *
 * Wraps low-risk surfaces:
 *  - console.error (render crashes, React warnings escalated to errors)
 *  - Supabase realtime open/close/error
 *  - augments agentBus with classified diagnostic events
 *
 * NO polling, NO timers beyond the heartbeat already in operationalObserver.
 * Idempotent — safe to import multiple times.
 */
import { agentBus } from "./agentEventBus";
import { supabase } from "@/integrations/supabase/client";

let started = false;

export type RealtimeStatus = "connected" | "disconnected" | "error" | "unknown";

const state = {
  realtime: "unknown" as RealtimeStatus,
  lastRealtimeChangeAt: 0 as number,
  consoleErrors: 0,
  renderCrashes: 0,
};

export function getDiagnosticsSnapshot() {
  return { ...state };
}

export function startRuntimeDiagnostics() {
  if (started || typeof window === "undefined") return;
  started = true;

  // --- console.error capture (React render errors hit here) ---------
  const origErr = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    state.consoleErrors += 1;
    const text = args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ").slice(0, 240);
    const isReact = /(React|render|hooks?|hydrat|Maximum update depth)/i.test(text);
    if (isReact) state.renderCrashes += 1;
    agentBus.emit({
      kind: isReact ? "runtime_error" : "operational_alert",
      level: isReact ? "error" : "warn",
      title: isReact ? "Erro de render detectado" : "console.error",
      detail: text,
    });
    origErr(...args);
  };

  // --- Supabase realtime lifecycle ----------------------------------
  try {
    const rt: any = (supabase as any).realtime;
    if (rt && typeof rt.onOpen === "function") {
      rt.onOpen(() => {
        const wasDown = state.realtime !== "connected" && state.realtime !== "unknown";
        state.realtime = "connected";
        state.lastRealtimeChangeAt = Date.now();
        if (wasDown) {
          agentBus.emit({
            kind: "operational_alert",
            level: "success",
            title: "Realtime reconectado",
          });
        }
      });
      rt.onClose?.(() => {
        if (state.realtime === "connected") {
          agentBus.emit({
            kind: "sync_failure",
            level: "warn",
            title: "Canal realtime desconectado",
          });
        }
        state.realtime = "disconnected";
        state.lastRealtimeChangeAt = Date.now();
      });
      rt.onError?.((err: any) => {
        state.realtime = "error";
        state.lastRealtimeChangeAt = Date.now();
        agentBus.emit({
          kind: "sync_failure",
          level: "error",
          title: "Erro no realtime",
          detail: String(err?.message ?? err ?? "unknown"),
        });
      });
    }
  } catch {
    /* realtime client may not be exposed — non-fatal */
  }
}

startRuntimeDiagnostics();
