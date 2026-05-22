/**
 * AIRealtimeConnector — observes online/offline transitions and
 * Supabase realtime channel activity (already tracked by the
 * RealtimeInspector) to nudge the entity into "syncing" briefly.
 *
 * No new subscriptions — purely reactive to window events.
 */
import { globalAI } from "./GlobalAIState";

let started = false;

export function startAIRealtime() {
  if (started || typeof window === "undefined") return () => {};
  started = true;

  const onOnline = () => {
    globalAI.pulse("syncing", 1400);
    globalAI.noteEvent("Conexão restabelecida");
  };
  const onOffline = () => {
    globalAI.noteEvent("Sem conexão");
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      globalAI.pulse("syncing", 900);
    }
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisibility);
    started = false;
  };
}
