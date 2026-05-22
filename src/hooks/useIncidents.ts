/**
 * useIncidents — subscribe to open incidents from IncidentGenerator.
 */
import { useEffect, useState } from "react";
import { IncidentGenerator, type Incident } from "@/agents/observability";

export function useIncidents(): {
  open: Incident[];
  resolve: (id: string) => void;
} {
  const [open, setOpen] = useState<Incident[]>(() => {
    IncidentGenerator.start();
    return IncidentGenerator.getOpen();
  });
  useEffect(() => {
    IncidentGenerator.start();
    return IncidentGenerator.subscribe(setOpen);
  }, []);
  return { open, resolve: (id) => IncidentGenerator.resolve(id) };
}

export default useIncidents;
