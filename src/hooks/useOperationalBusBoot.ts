/**
 * Boots OperationalEventBus once the workspace context is known.
 * Phase-3 boot: lightweight, but still deferred a tick to avoid racing
 * the first dashboard paint.
 */
import { useEffect } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { OperationalEventBus } from "@/lib/operationalBus";
import { bootStage } from "@/lib/bootStage";

export function useOperationalBusBoot() {
  const { workspaceId } = useWorkspace();
  useEffect(() => {
    bootStage.log("OperationalBus", `workspace=${workspaceId ?? "none"}`);
    if (bootStage.isSafeBoot()) return;
    const handle = setTimeout(() => {
      OperationalEventBus.start(workspaceId ?? null);
    }, 0);
    return () => clearTimeout(handle);
  }, [workspaceId]);
}
