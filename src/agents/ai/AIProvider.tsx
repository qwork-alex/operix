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
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useOperationalSignals } from "@/hooks/useOperationalSignals";
import { presenceEngine } from "@/agents/presence/PresenceEngine";
import { idleTracker } from "@/agents/presence/IdleBehavior";
import { movementOrchestrator } from "@/agents/presence/MovementOrchestrator";
import { robotAwareness } from "@/ai/entity/RobotAwareness";
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
  const location = useLocation();
  const [snapshot, setSnapshot] = useState<AIEntitySnapshot>(() => globalAI.current());
  const lastSignalRef = useRef(worst);

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

  // Contextual gaze — soft glance toward the page's main content when the
  // route changes (the robot "checks out the new module") and toward the
  // first visible alert when the worst signal changes.
  useEffect(() => {
    // Wait a tick for the new route to mount, then aim at <main> / banner.
    const t = window.setTimeout(() => {
      robotAwareness.glanceAtElement("main h1, main [role='heading'], main", 1600);
    }, 180);
    return () => window.clearTimeout(t);
  }, [location.pathname]);

  useEffect(() => {
    if (worst === lastSignalRef.current) return;
    lastSignalRef.current = worst;
    if (worst === "ok") return;
    // Glance toward whichever alert just appeared, if any rendered.
    const t = window.setTimeout(() => {
      robotAwareness.glanceAtElement("[data-op-alert], [role='alert']", 1400);
    }, 80);
    return () => window.clearTimeout(t);
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
