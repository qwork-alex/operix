/**
 * Operational Copilot — type surface.
 *
 * Deterministic intelligence layer that consumes operational data slices
 * (service_orders, payment_orders, production_orders, financial_records,
 * fleet_fuel_logs, automation_executions, ai_alerts) plus the live runtime
 * substrate (AgentRuntime / VirtualEngineer) and emits forward-looking,
 * actionable artifacts:
 *
 *   - CopilotForecast       (demand / revenue / fuel projections)
 *   - DelayPrediction       (orders likely to slip SLA)
 *   - DispatchSuggestion    (which tech / vehicle for which job)
 *   - ProductivityInsight   (per-technician / per-vehicle deltas)
 *   - FinancialInsight      (margin, retention, anomaly)
 *   - StrategicRecommendation (what to do next, ranked)
 *
 * All artifacts include `reasoning` and `evidence` so they can be explained
 * to humans or fed as grounding context to an LLM driver later.
 *
 * Non-goals:
 *   - No LLM calls in this layer. An LLM may consume snapshots downstream.
 *   - No mutations. Read-only inference.
 *   - No UI. Hooks expose the snapshot, surfaces opt-in.
 */

export type CopilotSeverity = "info" | "watch" | "warn" | "critical";
export type CopilotCategory =
  | "demand"
  | "delay"
  | "dispatch"
  | "productivity"
  | "financial"
  | "automation"
  | "strategic";

export interface CopilotEvidence {
  kind: "record" | "metric" | "signal" | "event";
  ref: string;       // table:id, signal:id, metric key, etc.
  label?: string;
  value?: number | string;
}

export interface CopilotForecast {
  id: string;
  metric: "service_orders" | "payment_orders" | "revenue" | "fuel_cost" | "production_throughput";
  horizon: "next_7d" | "next_30d" | "eom";
  baseline: number;
  projected: number;
  delta: number;            // projected - baseline
  deltaPct: number;         // (projected - baseline) / max(1, baseline)
  confidence: number;       // 0..1
  reasoning: string[];
  evidence: CopilotEvidence[];
}

export interface DelayPrediction {
  id: string;
  orderId: string;
  orderRef?: string | null;
  module: "service_orders" | "production_orders";
  expectedAt?: number | null;
  predictedAt: number;      // estimated completion timestamp
  slipMinutes: number;      // 0 = on time, positive = late
  probability: number;      // 0..1 likelihood of delay
  reasoning: string[];
  evidence: CopilotEvidence[];
}

export interface DispatchSuggestion {
  id: string;
  orderId: string;
  orderRef?: string | null;
  candidate: {
    techId?: string | null;
    techName?: string | null;
    vehicleId?: string | null;
    vehiclePlate?: string | null;
  };
  score: number;            // 0..1 fit
  reasoning: string[];
  evidence: CopilotEvidence[];
}

export interface ProductivityInsight {
  id: string;
  subject: { kind: "technician" | "vehicle" | "team"; id: string; label: string };
  metric: "orders_per_day" | "revenue_per_order" | "completion_rate" | "fuel_efficiency";
  current: number;
  baseline: number;
  deltaPct: number;
  severity: CopilotSeverity;
  reasoning: string[];
  evidence: CopilotEvidence[];
}

export interface FinancialInsight {
  id: string;
  topic:
    | "margin_pressure"
    | "concentration_risk"
    | "cash_outflow_spike"
    | "unpaid_aging"
    | "fuel_overspend";
  amount?: number;
  severity: CopilotSeverity;
  title: string;
  detail: string;
  reasoning: string[];
  evidence: CopilotEvidence[];
}

export interface StrategicRecommendation {
  id: string;
  title: string;
  detail: string;
  category: CopilotCategory;
  severity: CopilotSeverity;
  expectedImpact?: string;
  steps: string[];
  evidence: CopilotEvidence[];
}

/* ------------------------------------------------------- dataset ---- */

export interface CopilotServiceOrder {
  id: string;
  ref?: string | null;
  status: string;
  createdAt: number;
  expectedAt?: number | null;
  completedAt?: number | null;
  assignedTechId?: string | null;
  client?: string | null;
  platform?: string | null;
  vehiclePlate?: string | null;
  amount?: number | null;
}

export interface CopilotPaymentOrder {
  id: string;
  status: string;
  createdAt: number;
  paidAt?: number | null;
  amount?: number | null;
  techId?: string | null;
  client?: string | null;
}

export interface CopilotProductionOrder {
  id: string;
  ref?: string | null;
  status: string;
  createdAt: number;
  expectedAt?: number | null;
  completedAt?: number | null;
  techId?: string | null;
}

export interface CopilotFinancialRecord {
  id: string;
  type: "income" | "expense" | "withdrawal" | string;
  amount: number;
  category?: string | null;
  createdAt: number;
  assignedUserId?: string | null;
}

export interface CopilotFuelLog {
  id: string;
  vehicleId?: string | null;
  driverId?: string | null;
  liters: number;
  totalCost: number;
  kmAtFuel?: number | null;
  date: number;
}

export interface CopilotAutomationRun {
  id: string;
  status: "ok" | "error" | string;
  ruleId?: string | null;
  createdAt: number;
}

export interface CopilotTechnician {
  id: string;
  name?: string | null;
  email?: string | null;
  activeNow?: boolean;
}

export interface CopilotDataset {
  workspaceId: string;
  generatedAt: number;
  windowDays: number;
  serviceOrders: CopilotServiceOrder[];
  paymentOrders: CopilotPaymentOrder[];
  productionOrders: CopilotProductionOrder[];
  financialRecords: CopilotFinancialRecord[];
  fuelLogs: CopilotFuelLog[];
  automationRuns: CopilotAutomationRun[];
  technicians: CopilotTechnician[];
}

export interface CopilotSnapshot {
  generatedAt: number;
  workspaceId: string;
  forecasts: CopilotForecast[];
  delays: DelayPrediction[];
  dispatch: DispatchSuggestion[];
  productivity: ProductivityInsight[];
  financial: FinancialInsight[];
  recommendations: StrategicRecommendation[];
  meta: {
    windowDays: number;
    serviceOrderCount: number;
    paymentOrderCount: number;
    technicianCount: number;
  };
}

export type CopilotListener = (snap: CopilotSnapshot) => void;
