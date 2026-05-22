/**
 * CharacterContext — React adapter wiring operational signals into
 * the CharacterEngine, exposing snapshots to consumer components.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { characterEngine } from "./CharacterEngine";
import type { CharacterSnapshot } from "./types";
import { useOperationalSignals } from "@/hooks/useOperationalSignals";

interface Ctx {
  snapshot: CharacterSnapshot;
}

const CharacterCtx = createContext<Ctx | null>(null);

export function CharacterProvider({ children }: { children: ReactNode }) {
  const { worst, signals } = useOperationalSignals();
  const [snapshot, setSnapshot] = useState<CharacterSnapshot>(() => ({
    mood: {
      emotion: "calm",
      posture: "relaxed",
      eye: "open",
      hue: "210 90% 60%",
      accent: "200 70% 45%",
      micro: { kind: "pulse", period: 4, intensity: 0.4 },
      energy: 0.4,
      hold: 7,
    },
    version: 0,
    generatedAt: Date.now(),
  }));

  useEffect(() => {
    characterEngine.start();
    return characterEngine.subscribe(setSnapshot);
  }, []);

  useEffect(() => {
    const urgency =
      worst === "error" ? "critical" : worst === "warn" ? "high" : worst === "info" ? "normal" : "low";
    characterEngine.updateSignal({
      urgency,
      hasAlert: worst === "error" || worst === "warn",
      signalKind: signals[0]?.kind,
    });
  }, [worst, signals]);

  return <CharacterCtx.Provider value={{ snapshot }}>{children}</CharacterCtx.Provider>;
}

export function useCharacter(): Ctx {
  const v = useContext(CharacterCtx);
  if (!v) throw new Error("useCharacter must be used inside CharacterProvider");
  return v;
}
