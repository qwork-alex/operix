---
name: Operational Hierarchy Explorer (Phase 1A + 1B)
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
