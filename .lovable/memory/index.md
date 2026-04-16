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

## Memories
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
- [RBAC](mem://auth/single-tenant-rbac) — Admin, Sócio, Técnico, Cliente roles with strict RLS filtering
- [Owner Protection](mem://auth/system-owner-protection) — qwork@qworkgroup.com protected from deletion, exclusive dev tools
- [Auth Security](mem://logic/auth-security) — Admin-created users forced to change password on first login
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
