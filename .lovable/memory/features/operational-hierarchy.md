---
name: Operational Hierarchy Explorer (Phase 1A + 1B + 1C)
description: Left-side hierarchical tree + nested expandable table groups for SO/PO — Year → Client → Operational Unit → Week → Technician — with view (👁), counters, totals and aggregated status.
type: feature
---

Phase 1A (tree explorer) + Phase 1B (grouped tables):

- Tree: `src/components/shared/HierarchyExplorer.tsx`. Left sidebar, persists open nodes + active context in `localStorage` (`hierarchy.service_orders`, `hierarchy.payment_orders`).
- Grouped tables: `src/components/shared/HierarchicalOrdersView.tsx`. Wraps the existing `ServiceOrdersTable` / `PaymentOrdersTable` and renders nested collapsible groups Year → Client → Unit → Week → Technician. Persisted state under `${storageKey}.tblOpen`.
- Per-group bar shows: chevron expand/collapse, label, registros count, Bruto/Pago/Pendente totals, aggregated status (🟢 Pago / 🟡 Parcial / 🔴 Pendente / —), and a 👁 button that updates the shared `HierarchyContext` (kept in sync with the lateral tree).
- Leaf level = Technician → renders the existing table component with the subset of records. All editing/saving/permission/OCR/upload/realtime logic untouched.
- Aggregation: `paid` if all paid; `pending` if all pending/none; otherwise `partial`. Totals from `total`, paid from `amount_paid` (PO) or 0 (SO). Status fallback: derives from amount_paid vs total.
- Performance: children only rendered when group is open; tree rebuilt with `useMemo` over `records`.
- Fallback labels (`HIERARCHY_FALLBACK`): "Sem Data / Cliente / Unidade Operacional / Semana / Técnico" — old records without `operational_unit` show under "Sem Unidade Operacional", never disappear.
- Filters, status badges and bulk actions remain inside the leaf table.

Do not break: backend (RLS, save, realtime), OCR/extract, validation, document upload, batch status, technician earnings.

## Phase 1C — Contextual operational scope
- `HierarchyBreadcrumb` rendered on top of SO/PO content area shows the active context (`Year › Client › Unit › Week › Technician`) with a "Limpar" action. When `level === "all"` it shows a subtle "Modo global" indicator.
- `hierarchyDefaults(ctx)` exposes clean (non-fallback) defaults: `{ client, operational_unit, week, technician }`.
- OCR pre-fill: after extraction, missing `client` / `week` (or `list_name` for PO) / `technician` are filled from the active context — user is not asked again for what is already selected.
- Save payloads now persist `operational_unit` from the active context (column already exists on both `service_orders` and `payment_orders`). `week` / `list_name` / `group_id` also fall back to the context week when OCR did not return one.
- Global upload still works untouched: when context is "all", no defaults are injected.
- Persistence remains via `loadHierarchyContext(storageKey)` (localStorage) so refresh / save / navigation keeps the active node.

## Phase 1C.2 — ERP visual refinement
- Sidebar title renamed to **"Contexto Operacional"** (SO + PO). Width reduced from `w-64` → `w-52`.
- Year nodes in `HierarchyExplorer` now expose 3 sub-sections:
  - **Operacional** → wraps the existing Client/Unit/Week/Tech subtree (active).
  - **Documentos** → placeholder, `disabled: true`, "Em breve" pill.
  - **Relatórios** → placeholder, `disabled: true`, "Em breve" pill.
  - `TreeNode` extended with `disabled?: boolean` and `hint?: string`.
- Compact toolbar (single row, `card/40` background) replaces the stacked
  Breadcrumb + Stages + Upload blocks. `FileUploadZone` accepts `compact: true`
  to render a horizontal mini-bar (Upload / Photo / Scan buttons + camera dialog).
- `EmbeddedFileManager` accepts `defaultCollapsed?: boolean`. Pages set it to
  `sessionFileNames.length === 0 && queue.length === 0` so the file panel auto-
  collapses when there is no upload activity. A "Recolher" button collapses it
  back; the slim collapsed bar shows file count and toggles open.
- Filters (`client_id` / `platform` / `assigned_user_id` / `week|list_name`)
  are hidden when `hCtx.level !== "all"` — hierarchical context already narrows
  the view, removing redundancy.
- **Deferred to a later sub-phase**: hiding redundant columns (client / unit /
  week / technician) inside leaf tables — requires invasive refactor of
  `ServiceOrdersTable` and `PaymentOrdersTable`. Not implemented here so save /
  edit / delete / OCR / realtime stay 100% intact.
