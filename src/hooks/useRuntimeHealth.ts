/**
 * useRuntimeHealth — React hook over RuntimeHealthMonitor.
 * Subscribes on mount, returns the latest snapshot. Zero polling.
 */
import { useEffect, useState } from "react";
import { RuntimeHealthMonitor } from "@/lib/observability";
import type { HealthSnapshot } from "@/lib/observability/types";

export function useRuntimeHealth(): HealthSnapshot {
  const [snap, setSnap] = useState<HealthSnapshot>(() => RuntimeHealthMonitor.getSnapshot());
  useEffect(() => {
    const off = RuntimeHealthMonitor.subscribe(setSnap);
    setSnap(RuntimeHealthMonitor.getSnapshot());
    return off;
  }, []);
  return snap;
}
