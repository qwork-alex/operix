/**
 * PresenceContext — React adapter for the PresenceEngine singleton.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { presenceEngine } from "./PresenceEngine";
import type { PresenceSnapshot } from "./types";
import { useOperationalSignals } from "@/hooks/useOperationalSignals";

interface PresenceCtx {
  snapshot: PresenceSnapshot;
}

const Ctx = createContext<PresenceCtx | null>(null);

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { worst, signals } = useOperationalSignals();
  const [snapshot, setSnapshot] = useState<PresenceSnapshot>(() => ({
    state: "idle",
    mode: "ambient",
    position: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    visible: false,
    fps: 60,
  }));

  useEffect(() => {
    presenceEngine.start();
    return presenceEngine.subscribe(setSnapshot);
  }, []);

  useEffect(() => {
    const urgency =
      worst === "error" ? "critical" : worst === "warn" ? "high" : worst === "info" ? "normal" : "low";
    const hasAlert = worst === "error" || worst === "warn";
    presenceEngine.updateSignal({ urgency, hasAlert });
  }, [worst, signals.length]);

  return <Ctx.Provider value={{ snapshot }}>{children}</Ctx.Provider>;
}

export function usePresence(): PresenceCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePresence must be used inside PresenceProvider");
  return v;
}
