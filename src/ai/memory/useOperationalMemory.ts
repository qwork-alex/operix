import { useEffect, useState } from "react";
import { operationalMemory, type OperationalMemorySnapshot, deriveContextualHint } from "./OperationalMemory";

/** Subscribe to the operational memory snapshot. */
export function useOperationalMemory(): OperationalMemorySnapshot {
  const [snap, setSnap] = useState<OperationalMemorySnapshot>(() => operationalMemory.snapshot());
  useEffect(() => operationalMemory.subscribe(setSnap), []);
  return snap;
}

/** Derive a single contextual hint for the current context. */
export function useOperationalMemoryHint(ctx: { path?: string; signalId?: string } = {}): string | null {
  const snap = useOperationalMemory();
  return deriveContextualHint(snap, ctx);
}
