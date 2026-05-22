/**
 * useVirtualEngineer — React subscription to the VirtualEngineer diagnosis.
 *
 * Returns the latest EngineerDiagnosis snapshot (hypotheses, fixes,
 * narrative, evidence) and a `generateReport()` helper for producing
 * printable incident reports on demand.
 *
 * Boot is implicit: the hook starts the engineer once on first mount.
 */
import { useCallback, useEffect, useState } from "react";
import { VirtualEngineer } from "@/lib/virtualEngineer";
import type { EngineerDiagnosis, IncidentReport } from "@/lib/virtualEngineer";
import type { AgentSignal } from "@/lib/agent/types";

export function useVirtualEngineer(): {
  diagnosis: EngineerDiagnosis;
  generateReport: (signal?: AgentSignal) => IncidentReport;
} {
  const [diagnosis, setDiagnosis] = useState<EngineerDiagnosis>(() => {
    VirtualEngineer.start();
    return VirtualEngineer.getDiagnosis();
  });

  useEffect(() => {
    VirtualEngineer.start();
    const unsub = VirtualEngineer.subscribe(setDiagnosis);
    return unsub;
  }, []);

  const generateReport = useCallback(
    (signal?: AgentSignal) => VirtualEngineer.generateIncidentReport(signal),
    [],
  );

  return { diagnosis, generateReport };
}

export default useVirtualEngineer;
