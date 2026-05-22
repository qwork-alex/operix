/**
 * useObservabilityBoot — single-shot starter for the live observability
 * stack. Wires:
 *   PerformanceAnalyzer → RealtimeInspector → ErrorCorrelation
 *     → SystemHealthEngine → IncidentGenerator
 *
 * Mount once in AppLayout. Idempotent.
 */
import { useEffect } from "react";
import {
  IncidentGenerator,
  SystemHealthEngine,
  PerformanceAnalyzer,
  RealtimeInspector,
  ErrorCorrelation,
} from "@/agents/observability";

export function useObservabilityBoot() {
  useEffect(() => {
    PerformanceAnalyzer.start();
    RealtimeInspector.start();
    ErrorCorrelation.start();
    SystemHealthEngine.start();
    IncidentGenerator.start();
  }, []);
}

export default useObservabilityBoot;
