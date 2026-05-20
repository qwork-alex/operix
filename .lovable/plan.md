# Phase 4 — Participation Engine (Safe Extension)

## Goal
Add a true **participant-level financial engine** on top of the existing distribution system, without altering current distribution logic, OS↔OP matching, billing master flow, or RLS isolation.

Participants (partner, company, technician, shareholder, collaborator) get their own expected / received / pending / partial tracking, scoped by `workspace_id` + `year_reference` + `user_id`.

Clients are explicitly excluded.

## Current state (preserved, untouched)
- `profit_rules` (group_ids[], technician_id, assigned_user_id)
- `profit_rule_items` (participant_name, percentage, participant_type)
- `service_order_distributions` (frozen snapshot per OS, with calculated_value)
- Billing → OP → Financial sync from Phase 3/3B remains the only writer of `source='billing'` financial_records.

## New database objects

### 1. `participation_ledger` (new table)
Per-OS, per-participant, per-status ledger. One row per `(service_order_id, rule_item_id, participant_name)` — recomputed from snapshot + billing realization.

Columns:
- `id`, `workspace_id`, `year_reference`
- `service_order_id`, `rule_item_id` (nullable, FK SET NULL)
- `participant_name`, `participant_type` (`partner|company|technician|shareholder|collaborator|other`)
- `participant_user_id` (nullable — resolved from `profit_rules.assigned_user_id` / `technicians.user_id` when participant_type matches)
- `percentage` (numeric, from snapshot)
- `expected_amount` (snapshot `calculated_value`)
- `received_amount` (proportional from billing payments via OP→OS link)
- `pending_amount` (generated: expected − received)
- `status` (`pending|partial|paid`, derived)
- `last_event_hash`, `sync_revision`, timestamps
- Unique `(service_order_id, COALESCE(rule_item_id, '00…'), participant_name)`

RLS: workspace_member SELECT + admin/partner ALL. **No client visibility.**

### 2. `v_participation_summary` (view, security_invoker)
Aggregated per `(workspace_id, year_reference, participant_name, participant_type, participant_user_id)`:
`expected`, `received`, `pending`, `partial_count`, `paid_count`, `os_count`.

### 3. Helper functions
- `resolve_participant_user_id(rule_id, participant_type)` → uuid
- `sync_participation_for_so(service_order_id)` — recompute ledger rows for one OS:
  1. Read frozen `distribution_snapshot` (authoritative percentages/expected)
  2. Compute `received_ratio` = received share for this OS coming from billing (sum of `financial_records.amount` where `source='billing'` AND `service_order_id=this OS` AND status='paid' or partial) ÷ OS total
  3. For each snapshot entry: `received = expected * received_ratio` (rounded 2dp)
  4. UPSERT ledger rows, derive status
  5. Emit `financial_events` (`participation.updated`) using `deterministic_event_hash` (idempotent)
- `sync_participation_for_invoice(invoice_id)` — fan-out: for each linked OP → its OS → call `sync_participation_for_so`.

### 4. Triggers
- AFTER INSERT on `service_order_distributions` → `sync_participation_for_so(NEW.service_order_id)`
- AFTER UPDATE of `total` on `service_orders` → recompute
- AFTER INSERT/UPDATE on `financial_records` WHERE `source='billing'` → `sync_participation_for_so(NEW.service_order_id)`
- Reentrancy guarded via existing `financial_sync_lock` pattern at invoice level.

### 5. Year isolation
Ledger inherits `year_reference` from `service_orders.year_reference`. Rules with `group_ids` already encode year context (e.g. `2024-W12`); no schema change to `profit_rules` required.

## Frontend

### New tab: **Participation** (inside Financial module)
File: `src/components/financial/ParticipationTab.tsx`
- Lives alongside existing tabs (Visão Geral, Análise Técnica, Confronto). **No removal/redesign of existing tabs.**
- Reads from `v_participation_summary` filtered by current workspace + selected year.
- Displays a table grouped by `participant_type` then `participant_name`:
  - Expected | Received | Pending | Status mix (paid/partial/pending counts) | OS count
  - Click row → detail drawer listing the per-OS ledger entries.
- Filters: year (default current), participant_type, search by name.
- Hook: `src/hooks/useParticipationLedger.ts` (workspace+year scoped, TanStack Query).

### Constraints
- **No changes** to `ProfitDistribution.tsx`, distribution math, OS/OP forms, billing UI.
- Clients never appear (filter out `participant_type='client'` defensively even though rules don't produce them).

## Validation steps (post-migration, before close)
1. Create OS with snapshot → ledger rows appear with `expected=calculated_value`, `received=0`, status=pending.
2. Create invoice paying linked OP fully → ledger `received=expected`, status=paid.
3. Partial payment (50%) → ledger `received≈50% expected`, status=partial.
4. Cross-workspace query as workspace B user → 0 rows from workspace A.
5. 2024 OS doesn't leak into 2025 view (year filter).
6. Replay: emit duplicate trigger → no duplicate rows, no double counting (hash dedup).
7. Logs in `financial_events` show `participation.updated` events with revisions.

## Not changed
- Distribution rules / items / snapshot logic
- OS↔OP matching
- Billing Master flow (Phase 3/3B)
- RLS workspace isolation (Phase 2.5)
- Profit distribution UI
- Client tables (no participation for clients)

## Deliverables
- 1 migration (table + view + 3 functions + 3 triggers + RLS)
- 1 hook (`useParticipationLedger`)
- 1 component (`ParticipationTab`) wired into `FinancialPage`
- Validation report in `/mnt/documents/phase_4_participation_engine_report.md`
