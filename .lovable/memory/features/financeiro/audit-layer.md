---
name: Phase 4.5 Financial Audit Layer
description: Read-only observability layer over financial engine — timeline, integrity KPIs, participation diff inspector. No mutation paths.
type: feature
---

Phase 4.5 adds a strictly read-only audit/observability layer over the financial engine (Phases 3B + 4).

**DB objects**
- `participation_diffs` table — before/after capture per `participation_ledger` change. SECURITY DEFINER trigger `capture_participation_diff` writes; no INSERT/UPDATE/DELETE RLS for users. Skips no-op writes.
- `financial_event_timeline_v` — security-invoker view of `financial_events` with `payload_summary` JSON and revision/source.
- `v_financial_integrity_summary` — per-workspace KPIs: duplicate_hash_count, orphan_op_count, missing_so_links, over_allocated_distributions (sum > 100.5), invalid_workspace_rows, replay_collapses, skipped_diff_updates, financial_sync_lock_hits.

**Frontend**
- `useFinancialAudit.ts` — `useFinancialEventTimeline`, `useFinancialIntegritySummary`, `useParticipationDiffs`.
- `FinancialAuditTab.tsx` — 4th tab under Financial. KPI grid + filters (year/event_type/entity_type/hash search) + expandable timeline rows + side-drawer diff inspector.

**Constraints (do not violate)**
- No mutation UI; no replay execution; no billing math changes; no participation logic changes; no trigger rewrites in other modules.
- Workspace-scoped via existing `is_workspace_member` / admin bypass.
