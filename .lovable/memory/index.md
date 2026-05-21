# Memory: index.md
Updated: now

# Project Memory

## Core
Stack: React (Vite), TS, Tailwind, Three.js, Supabase, TanStack Query. Edge Functions for APIs.
Single-tenant RBAC (admin, socio, tecnico, cliente). DB is the single source of truth.
Dark Luxury UI: charcoal/black base, neon accents, glassmorphism. Inline editing, fixed created_at sorting.
Constraint: No visual redesigns/feature removals. Stabilize logic & complete CRUD operations.
Resilience: Try/catch all async actions, localized toasts, diffing for mutations. Fallbacks for IDs.
Owner account (qwork@qworkgroup.com) is protected, has exclusive reset access. No public signup.
i18n rule: every visible string MUST flow through useLanguage().t(key) — no inline literals (see mem://style/i18n-rule).

## Memories
- [Phase 6 — Operational Engine](mem://features/production/phase-6-operational-engine) — production_orders/events/photos tables, kanban board, technician hub mobile-first, photo uploader with client-side compression, KPIs RPC, /production route. Fully additive to existing service_orders flow.
- [Phase 5 — Tenant Security](mem://features/security/phase-5-tenant-isolation) — security_events append-only log, log_security_event/compute_security_metrics RPCs, TenantProvider/useTenant, RoleGuard, PermissionGate, Security tab in PlatformOwner
- [i18n Rule](mem://style/i18n-rule) — Phase 4C: all UI strings via t(); no inline literals; Brazilian PT goes in the existing pt slot
- [Workspace Context Phase 1](mem://auth/workspace-context-phase1) — workspace_id/year_reference/visibility_scope em todas tabelas críticas, workspace_module_permissions, resolvers SQL, hooks frontend opt-in (scopeQuery, useWorkspaceModules). Aditivo, sem quebra de RLS.
- [Contextual Action Engine](mem://auth/contextual-action-engine) — useContextualWorkspace + ContextualWorkspacePicker (discreet chip) + treeGrouping helper. Auto-resolve quando 1 ws elegível, prompt mínimo quando 2+. Session-scoped.
- [Data Visibility Flags](mem://features/auth/data-visibility-flags) — user_settings table + has_global_view() controlling SO/PO/financial SELECT scope
- [RBAC Hardening Phase B2](mem://auth/hardening-phase-b2) — Single owner trigger per table (SO/PO/financial). assigned_user_id independent of user_id. Fixes assignment-loss bug.
- [RBAC Hardening Phase B3.1b](mem://auth/hardening-phase-b3-1b) — Safe user deletion: get_user_ownership_map() RPC + edge function gates by NOT-NULL "blocking" only; nulls all 3 financial_records owner cols.
- [RBAC Hardening Phase B3.2](mem://auth/hardening-phase-b3-2) — Re-ENABLED + FORCED RLS on service_orders/payment_orders/profiles/app_users (was silently disabled → cross-user SELECT leak).
- [RBAC Hardening Phase B3.3](mem://auth/hardening-phase-b3-3) — DELETE ACL: SO/PO/financial_records DELETE now permission+scope-driven; frontend `assertedDelete` helper validates rows affected to kill silent "Excluído com sucesso".
- [Theme Style](mem://style/theme) — Dark Luxury aesthetic rules, customizable admin branding and glow effects
- [Internationalization](mem://features/i18n) — 12 languages, PT primary, locale-aware currencies/numbers
- [Service Orders](mem://features/service-orders) — 4-stage OCR, inline editing, text fallbacks, strictly validated saving
- [Payment Orders](mem://features/payment-orders) — Flattened data (up to 4 services), total sums, text fallbacks
- [Documents](mem://features/documents) — Signed URLs (1h), blob fetching for view/print, pinch-zoom, print iframe
- [Resilience Logic](mem://logic/resilience) — Error boundaries, TanStack Query enabled ties to session, manual fallbacks
- [Settings](mem://features/settings) — Logo upload, typography, colors, glow slider persisted in company_settings
- [Logging Tech](mem://tech/logging) — backend_event_logs for DB actions, policies, and auth events
- [Preservation Constraint](mem://constraints/preservation) — Strict rule against UI redesigns or removing working features
- [Automation](mem://tech/automation) — 14 backend triggers, array-based logic for SO status sync
- [Notifications](mem://features/notifications) — Real-time DB triggers, unread badge, mark as read
- [OCR Intelligence](mem://logic/ocr-intelligence) — Gemini 2.5 Flash, confidence indicators, Force Save override
- [Upload Queue](mem://tech/upload-queue) — Sequential one-by-one file processing with real-time UI
- [Embedded File Manager](mem://features/embedded-file-manager) — SO/PO file organization, module-tagged, session-filtered
- [Editing Pattern](mem://ux/editing-pattern) — Spreadsheet-style inline row editing for operational tables
- [UX Principles](mem://ux/principles) — Inline editing, single-tenant RBAC, DB truth, fixed sorting, hidden search
- [User Management](mem://features/usuarios/gestao-e-identidade) — Centralized auth, manual profile persistence via Edge Functions
- [System Reset](mem://dev/system-reset) — Danger Zone DB wipe restricted to owner account
- [Tech Stack](mem://tech/stack) — React, Tailwind, Supabase, Edge Functions for APIs (Gemini, ORS, Nominatim)
- [Fleet Architecture](mem://features/frota/arquitetura) — Registry, Ops, Intelligence layers, lion-tone tabs
- [Fleet Routes](mem://features/frota/trajetos) — Persistent sessions, optional final km (GPS fallback), locked on finish
- [Routing Logic](mem://features/frota/logica-de-rotas) — Nominatim + ORS, Haversine fallback (1.3x factor, 50km/h)
- [Fleet OCR](mem://features/frota/captura-e-ocr) — Calculates price_per_liter, 1 active driver rule, clickable status toggles
- [Fleet Reports](mem://features/frota/relatorios-e-kpis) — EU/FR compliant PDF/CSV reports (€/km, L/100km) generated weekly/monthly
- [Control Center](mem://features/contabilidade/centro-de-controle) — 3D globe nav hub, maps expense categories for real-time DRE
- [Accounting Isolation](mem://features/financeiro/accounting-isolation) — Accounting lives inside Financial tab; every record scoped to workspace+user+year, RLS prevents cross-user leakage
- [RBAC](mem://auth/single-tenant-rbac) — Admin, Sócio, Técnico, Cliente roles with strict RLS filtering
- [Hardening A1](mem://auth/hardening-phase-a1) — RLS leaks fechadas: discrepancies/drivers restritas; sod ampliada ao dono; is_system_owner flag.
- [Hardening B1](mem://auth/hardening-phase-b1) — Canonical helpers (is_order_visible/writable, owner_filter_uids, assert_active). Sem policy changes; base de B2/B3/B4.
- [Hardening B3.1](mem://auth/hardening-phase-b3-1) — Sync triggers SECURITY DEFINER (fix save RLS error); clients & technicians SELECT scoped (fecha vazamento test4↔test5).
- [Owner Protection](mem://auth/system-owner-protection) — qwork@qworkgroup.com protected from deletion, exclusive dev tools
- [Auth Security](mem://logic/auth-security) — Admin-created users forced to change password on first login
- [Impersonation](mem://features/auth/impersonation) — Admin "view as user" via frontend filter, banner + audit log, no RLS bypass
- [Smart Alerts](mem://features/financeiro/alertas-inteligentes) — Aging alerts for delayed payments (L1 30+ days amber, L2 60+ days red)
- [Bulk Deletion Protection](mem://ux/protecao-exclusao-massa) — SO/PO bulk delete requires explicit modal confirmation
- [Batch Status Updates](mem://features/financeiro/batch-status-updates) — Update PO status per week/list, propagates to SO
- [Geolocation Tracking](mem://tech/geolocation-tracking) — Auto geo tracking on login for dashboard map
- [Table Grouping](mem://ux/table-grouping-and-stability) — Grouped by Week, fixed created_at sorting for stability
- [Data Integrity](mem://logic/integridade-e-consistencia) — Diffing mutations, OCR doesn't overwrite manual edits, DB truth
- [Technician Earnings](mem://features/financeiro/technician-earnings) — Real-time calc via profit_rules crossed with group_id
- [Bulk Edit Pattern](mem://ux/bulk-edit-pattern) — Smart granular bulk edit for table rows (Service 2 only applies to Service 2)
- [PO Column Visibility](mem://ux/payment-orders/column-visibility) — Dynamic columns based on max filled services, expands to 4 on edit
- [Camera Capture](mem://features/upload/camera-capture) — Native photo/scan with 1.3x canvas contrast for OCR
- [Profit Engine](mem://features/lucros/motor-de-calculo) — Rules tied to group_ids (no tech_id needed), semantic participant colors
- [Status Syncing](mem://features/financeiro/status-sync-group-id) — PO triggers SO status via group_id. Text colors used for status
- [Billing Master Authority](mem://features/financeiro/billing-master-authority) — Phase 3: Billing invoices drive paid/partial/pending; triggers propagate to OP/SO/Financial Received; financial_events log
- [Form Reliability](mem://ux/form-reliability-patterns) — ID binding with text fallback, diffing updates
- [Profit Colors](mem://style/profit-distribution-colors) — Semantic colors: Yellow (Client), Blue (Tech), Green (Partner), Purple (Company)
- [Profit Safety](mem://ux/profit-distribution-safety) — Deleting rules needs AlertDialog confirmation
- [Dashboard Layout](mem://features/dashboard/intelligence-and-layout) — 4 levels, full width chart/map, real revenue vs pending
- [Plate Normalization](mem://logic/data-standardization/license-plates-matching) — Uppercase with hyphens, aggressive normalizer for sync
- [Reconciliation UI](mem://features/financeiro/confronto-os-op) — Manual merge, Pending discrepancies, History tabs
- [Financial Overview](mem://features/financeiro/visao-geral-analitica) — KPI cards with semantic glows, horizontal bar charts for rankings
- [Technical Analysis](mem://features/financeiro/analise-tecnica-detalhada) — Granular tech view comparing Expected vs Received, Net result status
- [Read-only Revenue Engine](mem://features/financeiro/motor-receita-readonly) — Distribution × payment-ratio aggregation feeds Overview KPIs and Detalhamento; never writes
- [Reconciliation Engine](mem://logic/financeiro/motor-de-reconciliacao) — Edge function, groups by placa|plataforma|cliente, 80% string match rule
- [Operational Hierarchy](mem://features/operational-hierarchy) — Phase 1A: SO/PO left-side tree (Year→Client→Unit→Week→Tech) with view/expand, persisted state, new operational_unit DB column
- [Hard Isolation Phase 2.5](mem://auth/phase-2-5-hard-isolation) — Additive ws_scope_* RLS + scopeQuery on top hooks. Admin-global still passes via legacy policies until Phase 3.
- [Participation Engine](mem://features/financeiro/participation-engine) — Phase 4 ledger: participant rows from snapshot+billing, workspace/year isolated, new ParticipationTab
- [Financial Audit Layer](mem://features/financeiro/audit-layer) — Phase 4.5 read-only: timeline view, integrity KPIs, participation_diffs trigger, FinancialAuditTab
- [Compliance & GDPR](mem://features/security/phase-5-5-compliance) — Phase 5.5: consent_logs, immutable_audit_logs (sha256 chain), fraud_signals, user_devices, data exports, workspace deletion lifecycle, security_policies
- [Stripe Gateway](mem://features/billing/stripe-gateway) — Stripe as payment gateway only (checkout/portal/webhook). Internal plans stay authoritative. lookup_key = `{plan_code}_{cycle}`. No auto product creation.
- [Portal Financeiro](mem://features/billing/portal-financeiro) — SubscriptionPage em 5 abas: Visão geral, Faturas, Pagamento, Faturação (vat_mode), Histórico. Alertas inteligentes, Invoice Center, Stripe Portal CTA.
