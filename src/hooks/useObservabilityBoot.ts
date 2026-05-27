/**
 * Observability boot — Phase 4. Wires the live observability stack ONLY
 * after the dashboard has painted and the browser is idle. SAFE_BOOT
 * disables it entirely.
 */
import { useEffect } from "react";
import {
  IncidentGenerator,
  SystemHealthEngine,
  PerformanceAnalyzer,
  RealtimeInspector,
  ErrorCorrelation,
} from "@/agents/observability";
import { RuntimeHealthMonitor } from "@/lib/observability";
import { scheduleDeferredBoot } from "@/lib/bootStage";

export function useObservabilityBoot() {
  useEffect(() => {
    return scheduleDeferredBoot("Observability", () => {
      // RuntimeHealthMonitor is idempotent; safe to call here instead of
      // eagerly in main.tsx.
      RuntimeHealthMonitor.start();
      PerformanceAnalyzer.start();
      RealtimeInspector.start();
      ErrorCorrelation.start();
      SystemHealthEngine.start();
      IncidentGenerator.start();
    }, { delayMs: 2200 });
  }, []);
}

export default useObservabilityBoot;
