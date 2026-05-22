/**
 * useAgentRuntime — subscribes to the AgentRuntime context.
 * Lightweight; no fetching. Returns latest signals + counters.
 */
import { useEffect, useState } from "react";
import { AgentRuntime, type AgentContext } from "@/lib/agent";

export function useAgentRuntime(): AgentContext {
  const [ctx, setCtx] = useState<AgentContext>(() => AgentRuntime.getContext());
  useEffect(() => AgentRuntime.subscribe(setCtx), []);
  return ctx;
}
