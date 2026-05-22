/**
 * AIProvider — top-level React adapter for the single Global AI Entity.
 *
 * Wires:
 *   useOperationalSignals  → globalAI.setSignal
 *   PresenceEngine (idle)  → globalAI.setActivity / setPosition
 *   agentBus               → AIEventReactor
 *   window online/visible  → AIRealtimeConnector
 *
 * Exposes the live snapshot through React context.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useOperationalSignals } from "@/hooks/useOperationalSignals";
import { presenceEngine } from "@/agents/presence/PresenceEngine";
import { idleTracker } from "@/agents/presence/IdleBehavior";
import { movementOrchestrator } from "@/agents/presence/MovementOrchestrator";
import { globalAI } from "./GlobalAIState";
import { startAIReactor } from "./AIEventReactor";
import { startAIRealtime } from "./AIRealtimeConnector";
import type { AIEntitySnapshot } from "./types";

interface AICtx {
  snapshot: AIEntitySnapshot;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const Ctx = createContext<AICtx | null>(null);

export function AIProvider({ children }: { children: ReactNode }) {
  const { worst } = useOperationalSignals();
  const [snapshot, setSnapshot] = useState<AIEntitySnapshot>(() => globalAI.current());

  // Boot all engines once
  useEffect(() => {
    presenceEngine.start();
    const stopReactor = startAIReactor();
    const stopRealtime = startAIRealtime();

    const unsubIdle = idleTracker.subscribe((lvl) =>
      globalAI.setActivity(lvl === "deep-idle" ? "deepIdle" : lvl === "idle" ? "idle" : "active"),
    );
    const unsubMove = movementOrchestrator.subscribe((m) => {
      globalAI.setPosition(m.position, m.fps);
      globalAI.setVisible(m.visible);
    });
    const unsubAI = globalAI.subscribe(setSnapshot);

    return () => {
      stopReactor(); stopRealtime();
      unsubIdle(); unsubMove(); unsubAI();
    };
  }, []);

  // Operational signals → AI state machine
  useEffect(() => {
    globalAI.setSignal(worst);
  }, [worst]);

  const api: AICtx = {
    snapshot,
    open: () => globalAI.setMode("expanded"),
    close: () => globalAI.setMode("compact"),
    toggle: () => globalAI.setMode(snapshot.mode === "expanded" ? "compact" : "expanded"),
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAI(): AICtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAI must be used inside <AIProvider>");
  return v;
}
