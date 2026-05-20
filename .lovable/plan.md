# Phase 4C — Stabilization Validation + i18n Hardening

Read-only validation pass across all major routes + a structural i18n hardening layer. No new features, no schema migrations, no changes to billing / participation / distribution / matching logic.

## Part 1 — Validation Sweep (read-only)

Scope: confirm every major route renders without ErrorBoundary, hook-context, or undefined-property crashes after Phases 3B / 3C / 4A / 4.5.

Routes audited:
- `/` (dashboard)
- `/service-orders`, `/payment-orders`, `/billing`
- `/financial` (+ Participation tab, + Audit tab)
- `/profit-distribution`, `/documents`, `/users`, `/fleet`

Method:
1. Static audit — grep for direct `.property` access on possibly-undefined query data; verify each page wraps async data with loading + empty states; verify hooks live inside their required providers (`WorkspaceProvider`, `RoleProvider`, `LanguageProvider`).
2. Runtime audit — open the preview, navigate each route, capture console + network. Log findings.
3. Database sanity — run `SELECT`-only diagnostics on `participation_ledger`, `v_participation_summary`, `financial_event_timeline_v`, `v_financial_integrity_summary` to confirm: no duplicate `(workspace_id, service_order_id, participant_id)` rows, no duplicate `event_hash`, no orphan FK.

Deliverable: `/mnt/documents/phase_4c_validation_report.md` listing every route's status + any defects (file + line) + fixes applied. Only surgical fixes (null-guards, missing `LoadingSkeleton`, hook-order issues) are applied — no logic rewrites.

## Part 2 — i18n Hardening (structural, non-destructive)

Goal: enforce that every visible string flows through `useLanguage().t(...)` and that switching language live updates the entire app without refresh.

Steps:
1. **Inventory** — scripted scan (`scripts/i18n-audit.mjs`) listing every `.tsx` file with hardcoded user-visible literals (JSX text, `placeholder=`, `title=`, `aria-label=`, `toast({title|description})`). Output saved to `/mnt/documents/i18n_audit.md`.
2. **Dictionary expansion** — add missing keys to `src/hooks/useLanguage.tsx` grouped by module (`fin.*`, `participation.*`, `audit.*`, `so.*`, `po.*`, `fleet.*`, `users.*`, `common.*`). All 12 languages, PT as primary, with Brazilian Portuguese variants where they differ from European Portuguese (the existing `pt` slot is reused; no new lang code added in this phase).
3. **Refactor** — replace literals in the highest-traffic shells first:
   - `FinancialPage.tsx` tabs (`Confronto OS x OP`, `Detalhamento`, `Participation`, `Audit`)
   - `ParticipationTab.tsx`, `FinancialAuditTab.tsx` (KPI labels, status pills, drawer headings, empty/loading states)
   - `AppSidebar.tsx`, `TopBar.tsx`, `ErrorBoundary.tsx`, common `BulkDeleteDialog`, `SectionPlaceholder`
   - Toast notifications across financial hooks
4. **Guard rule** — add `eslint`-style note in `.lovable/memory/style/i18n-rule.md` so future phases respect "no inline literals in components; always `t('key')`". Memory index updated.
5. **Live switch validation** — open preview, switch language from the top bar, confirm all refactored areas update without reload.

## Out of scope (explicitly NOT touched)
- Billing calculations, participation math, OS↔OP matching, distribution snapshot logic
- RLS / multi-workspace policies
- SO ↔ OP sync flow
- Mutation paths for participation / audit (stay read-only)
- New language codes (no `pt-BR` slot added — Brazilian variants go in the existing `pt` strings where applicable)

## Deliverables
- `/mnt/documents/phase_4c_validation_report.md`
- `/mnt/documents/i18n_audit.md`
- Surgical fixes for any defect found
- Expanded `useLanguage.tsx` dictionary
- Refactored shell components above
- `.lovable/memory/style/i18n-rule.md` + index update

## Technical notes
- Translation lookup remains synchronous (`t(key)`); no async loader change.
- Refactor uses pure search/replace inside JSX; no prop-shape changes to components.
- All edits are additive; rollback = revert the dictionary + component edits.
