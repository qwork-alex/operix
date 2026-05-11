---
name: Operational Hierarchy Explorer (Phase 1A)
description: Left-side hierarchical tree on SO/PO pages — Year → Client → Operational Unit → Week → Technician — with view (👁) and expand (👉) actions, persisted state.
type: feature
---

Phase 1A scope (1B = grouped collapsible tables, deferred):

- Component: `src/components/shared/HierarchyExplorer.tsx`. Pure presentation. Builds tree from current `orders` array; does not query DB itself.
- Levels: Year (created_at) → Client (client_name) → Operational Unit (`operational_unit` column, new in DB) → Week (week or list_name) → Technician (technician_name).
- Per node: chevron toggles expansion; eye icon sets that node as active "view context", filtering the table below via `applyHierarchyContext`.
- Persistence: `localStorage` keys `${storageKey}.open` (Set of node keys) and `${storageKey}.ctx` (HierarchyContext). Storage keys used: `hierarchy.service_orders`, `hierarchy.payment_orders`.
- Layout: 256px sticky left column (`hidden md:block`), main content on the right. Mobile (<md) hides the explorer to preserve existing UX.
- DB: `service_orders.operational_unit text` and `payment_orders.operational_unit text` (nullable, indexed). No RLS changes.
- Preserved: upload, OCR, validation, save, server-side filters, status, bulk delete — all untouched.

Do not break: when `operational_unit` is null, records appear under `—` bucket. Tree stays in sync because filtering is client-side over already-loaded `orders`.
