/**
 * Boots AgentRuntime once. Mounted alongside the operational bus boot
 * so the agent has the unified stream available from the first paint.
 */
import { useEffect } from "react";
import { AgentRuntime } from "@/lib/agent";

export function useAgentRuntimeBoot() {
  useEffect(() => {
    AgentRuntime.start();
    // Intentionally do NOT stop on unmount — runtime is process-wide.
  }, []);
}
