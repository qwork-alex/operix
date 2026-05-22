/**
 * OperationalCopilot — singleton coordinator.
 *
 * Pure orchestration: receives a CopilotDataset, runs deterministic analyzers,
 * caches the resulting snapshot, and fans it out to subscribers.
 *
 * Data fetching lives in `useOperationalCopilot` so this layer stays free of
 * Supabase/React dependencies and is trivially testable.
 */
import type { CopilotDataset, CopilotListener, CopilotSnapshot } from "./types";
import { forecastDemand } from "./analyzers/demandForecaster";
import { predictDelays } from "./analyzers/delayPredictor";
import { suggestDispatch } from "./analyzers/dispatchAdvisor";
import { analyzeProductivity } from "./analyzers/productivityAnalyzer";
import { analyzeFinancial } from "./analyzers/financialAnalyzer";
import { recommend } from "./analyzers/strategicRecommender";

const listeners = new Set<CopilotListener>();
let lastSnapshot: CopilotSnapshot | null = null;

export function ingest(dataset: CopilotDataset): CopilotSnapshot {
  const forecasts = forecastDemand(dataset);
  const delays = predictDelays(dataset);
  const dispatch = suggestDispatch(dataset);
  const productivity = analyzeProductivity(dataset);
  const financial = analyzeFinancial(dataset);
  const recommendations = recommend(
    dataset, forecasts, delays, dispatch, productivity, financial,
  );

  const snap: CopilotSnapshot = {
    generatedAt: Date.now(),
    workspaceId: dataset.workspaceId,
    forecasts,
    delays,
    dispatch,
    productivity,
    financial,
    recommendations,
    meta: {
      windowDays: dataset.windowDays,
      serviceOrderCount: dataset.serviceOrders.length,
      paymentOrderCount: dataset.paymentOrders.length,
      technicianCount: dataset.technicians.length,
    },
  };

  lastSnapshot = snap;
  fanout(snap);
  return snap;
}

export function getSnapshot(): CopilotSnapshot | null {
  return lastSnapshot;
}

export function subscribe(fn: CopilotListener): () => void {
  listeners.add(fn);
  if (lastSnapshot) {
    try { fn(lastSnapshot); } catch { /* noop */ }
  }
  return () => { listeners.delete(fn); };
}

export function reset(): void {
  lastSnapshot = null;
}

function fanout(snap: CopilotSnapshot) {
  listeners.forEach((l) => { try { l(snap); } catch { /* swallow */ } });
}

export const OperationalCopilot = {
  ingest,
  getSnapshot,
  subscribe,
  reset,
};

export default OperationalCopilot;
