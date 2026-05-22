/**
 * Agent core — operational intelligence (non-LLM substrate).
 * The orb / FloatingAgent / future LLM driver all consume this surface.
 */
export { AgentRuntime, default } from "./AgentRuntime";
export type {
  AgentContext,
  AgentSignal,
  AgentSignalKind,
  AgentUrgency,
  AgentListener,
} from "./types";
