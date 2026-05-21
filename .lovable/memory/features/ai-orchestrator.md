---
name: AI Orchestrator
description: Central AI inference layer with explainable recommendations, insights, alerts, scoring, contextual cache. Workspace-isolated. SAFE MODE — no tenancy/auth/RBAC mutations.
type: feature
---

# QWork AI Orchestrator

Central inference engine for the Nexus platform, powered by Lovable AI Gateway (`google/gemini-3-flash-preview` default). 100% workspace-isolated, explainable, and cached.

## Tables (workspace-scoped, RLS via `is_workspace_member`)
- `ai_cache` — Deterministic cache keyed by `(workspace_id, task, sha256(context))` with 1h TTL.
- `ai_recommendations` — Operational suggestions (status pending/applied/dismissed, reasoning, confidence).
- `ai_insights` — Bottlenecks, cost/fuel/productivity/financial analysis (severity info/warn/critical).
- `ai_alerts` — Fraud/delay/anomaly (status open/acknowledged/dismissed).
- `ai_scores` — Technician, fleet, productivity, financial-risk scoring (0-100 + band).
- `ai_action_log` — Append-only audit of every AI-triggered action.

## Edge Functions
- **`ai-orchestrator`** — Validates JWT + workspace membership, gathers read-only context per task type (service_orders, payment_orders, fleet_fuel_logs, profiles), checks `ai_cache`, calls Lovable AI Gateway with strict `emit_result` tool schema (forces explainable structured output: `summary`, `confidence`, `items[]`, `explanation{why,origem,contexto}`). Persists items to the right table by `kind`.
- **`ai-action`** — Controlled action layer. Only whitelisted actions: `apply_recommendation`, `dismiss_recommendation`, `acknowledge_alert`, `dismiss_alert`. Every call logged in `ai_action_log`.

## Tasks
Operational: `interpret_os`, `suggest_assignment`, `detect_bottlenecks`, `predict_delay`, `productivity`, `fuel`.
Financial: `costs`, `financial_behavior`.
Risk: `fraud_score`.
Scoring: `score_technician`, `score_fleet`, `score_productivity`, `score_financial_risk`.

## UI
- Page: `/ai` (route `AIPage.tsx`), sidebar entry "QWork AI" (Brain icon, gated by `dashboard.view`).
- Hook: `useAIOrchestrator.ts` — `useAIInference`, `useAIRecommendations`, `useAIInsights`, `useAIAlerts`, `useAIScores`, `useAIActionLog`, `useAIAction`.
- 5 tabs: Recomendações / Insights / Alertas / Scoring / Timeline.
- Explainability: every row exposes a tooltip with `why / contexto / origem` + confidence badge.

## Safety Guarantees
- No `auth`/`tenancy`/`memberships`/`user_roles` reads or writes.
- Service-role used only inside edge functions after JWT + membership re-validation.
- Cache prevents redundant Gateway calls; 429/402 errors surfaced to user.
- `ai-action` never executes critical mutations on operational tables — only updates AI-owned rows.
