/**
 * AgentRuntime boot — Phase 4. Deferred to browser idle so the dashboard
 * paints first. Honors SAFE_BOOT.
 */
import { useEffect } from "react";
import { AgentRuntime } from "@/lib/agent";
import { scheduleDeferredBoot } from "@/lib/bootStage";

export function useAgentRuntimeBoot() {
  useEffect(() => {
    return scheduleDeferredBoot("AgentRuntime", () => {
      AgentRuntime.start();
    }, { delayMs: 1400 });
  }, []);
}
