---
name: Participation Engine
description: Phase 4 participant-level financial ledger derived from distribution snapshot + billing receipts, isolated by workspace/year
type: feature
---

`participation_ledger` table holds per-OS, per-participant rows (one per `(service_order_id, rule_item_id, participant_name)`). Populated by `sync_participation_for_so(uuid)` from frozen `distribution_snapshot` + billing-sourced `financial_records` (Phase 3 master). Status: pending/partial/paid. Triggers fire on distribution insert, SO total change, and financial_records billing insert/update. Clients always excluded. Workspace + year isolation enforced via RLS + index `idx_pl_ws_year`. Aggregated view `v_participation_summary` powers `ParticipationTab` (3rd tab of FinancialPage). Idempotent via unique key + diff-skip UPSERT + deterministic event hash.
