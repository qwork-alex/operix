---
name: Read-only revenue engine (snapshot-based)
description: Distribution-snapshot-driven Expected/Received aggregation; immutable per OS, used by Overview KPIs and Detalhamento year blocks
type: feature
---
The Financial module computes revenue read-only from three sources:

- **Expected** = sum of values from `service_orders.distribution_snapshot` per participant (immutable per OS). Falls back to live `service_order_distributions` only when snapshot is absent.
- **Received** = `expected × received_ratio` where `received_ratio = Σ amount_paid / Σ total` of POs linked to the OS (capped at 1)
- **Difference** = Expected − Received

**Snapshot rules (CRITICAL — historical integrity)**:
- `distribution_snapshot` is a JSONB array of `{ participant_name, percentage, calculated_value, rule_item_id }` stored on each `service_orders` row.
- It is **frozen on first insert** of any `service_order_distributions` row for that OS, via the `freeze_distribution_snapshot` trigger.
- Editing a profit rule later **NEVER** mutates existing snapshots — past OS keep original percentages.
- New OS assigned to the (now-edited) rule materialize a fresh snapshot from the new percentages.
- Backfilled once at migration time for all pre-existing OS.

**Linking rules (PO ↔ OS)**, in priority order:
1. `po.service_order_id`
2. `po.group_id === so.group_id`
3. `po.list_name === so.week` AND normalized plate match

**Critical rules**:
- OS without snapshot AND without live distributions are IGNORED (no fallback to default shares).
- Status semantics: pending → 0, partial → proportional, paid → full.
- The Financial module NEVER writes to `payment_orders`, `service_orders`, `service_order_distributions`, or `distribution_snapshot`.
- Aggregation is cached for 30s (`useParticipantAggregation` query key `participant-aggregation`).

**UI integration**:
- `useParticipantAggregation()` exposes `byParticipant`, `byParticipantYearMonth`, `totals`.
- `getParticipantYearAgg(data, name, year)` aggregates a single participant across a year.
- Overview KPIs (`FinancialPage`) override Receita esperada/real/Diferença/Discrepância using `aggregation.totals` when present.
- `YearRevenueSection` (Detalhamento) shows derived row below manual inputs when derived data exists.
