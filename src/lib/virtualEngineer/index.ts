/**
 * VirtualEngineer — operational copilot.
 *
 * Sits on top of AgentRuntime + RuntimeHealthMonitor + OperationalEventBus,
 * producing root-cause hypotheses, fix proposals, and printable incident
 * reports. Pure analysis layer; no UI, no LLM, no mutations.
 */
export { VirtualEngineer, default } from "./VirtualEngineer";
export type {
  EngineerDiagnosis,
  EngineerListener,
  EngineerCauseTag,
  CauseMatch,
  RootCauseHypothesis,
  FixProposal,
  FixCategory,
  FixSeverity,
  IncidentReport,
  IncidentStatus,
} from "./types";
