/**
 * AIEventReactor — listens to the operational agent event bus and
 * the conversational orchestrator, then nudges GlobalAIState with
 * the appropriate transient flag (analyzing, syncing, speaking…).
 *
 * Lightweight: started once from AIProvider.
 */
import { agentBus } from "@/lib/agentEventBus";
import { globalAI } from "./GlobalAIState";

let started = false;

export function startAIReactor() {
  if (started) return () => {};
  started = true;

  const unsubBus = agentBus.subscribe((evt) => {
    if (evt.meta?.silent) return;
    if (evt.level === "error" || evt.level === "warn") {
      globalAI.pulse("analyzing", 2400);
    } else if (evt.kind === "user_message") {
      globalAI.pulse("thinking", 1200);
    } else if (evt.kind === "agent_message") {
      globalAI.pulse("speaking", 1400);
    } else {
      globalAI.pulse("syncing", 900);
    }
    if (evt.title) globalAI.noteEvent(evt.title);
  });

  return () => {
    unsubBus();
    started = false;
  };
}
