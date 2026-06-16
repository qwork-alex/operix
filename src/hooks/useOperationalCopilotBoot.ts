/**
 * useOperationalCopilotBoot — Phase 4 (DEFERRED).
 *
 * The Copilot snapshot pulls 7 tables of historical data. We arm it only
 * after the dashboard has painted AND the browser is idle. SAFE_BOOT
 * disables it completely. Failures stay contained in TanStack Query.
 */
import { useEffect, useState } from "react";
import { useOperationalCopilot } from "./useOperationalCopilot";
import { bootStage, scheduleDeferredBoot } from "@/lib/bootStage";

export function useOperationalCopilotBoot() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (bootStage.isSafeBoot()) {
      bootStage.log("OperationalCopilot", "skipped (SAFE_BOOT)");
      return;
    }
    return scheduleDeferredBoot("OperationalCopilot", () => {
      setReady(true);
    }, { delayMs: 10000, idleTimeoutMs: 12000 });
  }, []);

  // Query stays disabled until `ready` flips post-paint/idle.
  useOperationalCopilot({ enabled: ready });
}
