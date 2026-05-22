/**
 * Boots OperationalEventBus once the workspace context is known.
 * Mount in AppLayout (or any place that runs after auth + workspace).
 */
import { useEffect } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { OperationalEventBus } from "@/lib/operationalBus";

export function useOperationalBusBoot() {
  const { workspaceId } = useWorkspace();
  useEffect(() => {
    OperationalEventBus.start(workspaceId ?? null);
  }, [workspaceId]);
}
