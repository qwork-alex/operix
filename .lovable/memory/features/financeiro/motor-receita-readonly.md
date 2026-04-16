---
name: Read-only revenue engine
description: Distribution-driven Expected/Received aggregation per participant, used by Overview KPIs and Detalhamento year blocks
type: feature
---
The Financial module computes revenue read-only from three sources:

- **Expected** = sum of `service_order_distributions.calculated_value` per participant
- **Received** = `expected × received_ratio` where `received_ratio = Σ amount_paid / Σ total` of POs linked to the OS (capped at 1)
- **Difference** = Expected − Received

**Linking rules (PO ↔ OS)**, in priority order:
1. `po.service_order_id`
2. `po.group_id === so.group_id`
3. `po.list_name === so.week` AND normalized plate match

**Critical rules**:
- OS without any `service_order_distributions` row are IGNORED (no fallback).
- Status semantics: pending → 0, partial → proportional, paid → full.
- The Financial module NEVER writes to `payment_orders`, `service_orders`, or `service_order_distributions`.
- Aggregation is cached for 30s (`useParticipantAggregation` query key `participant-aggregation`) to avoid recomputing on every render.

**UI integration**:
- `useParticipantAggregation()` exposes `byParticipant`, `byParticipantYearMonth`, `totals`.
- `getParticipantYearAgg(data, name, year)` aggregates a single participant across a year.
- Overview KPIs (`FinancialPage`) override Receita esperada/real/Diferença/Discrepância using `aggregation.totals` when present.
- `YearRevenueSection` (Detalhamento) shows derived row (Esperada regras / Recebida real / Diferença) below the manual inputs, only when derived data exists for that technician+year.
