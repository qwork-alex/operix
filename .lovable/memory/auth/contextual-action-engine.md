---
name: Contextual Action Engine
description: Hook + discreet picker that resolves which workspace an action belongs to; wired into OS, OP, Faturamento, Frota and Documentos creation flows. Picker only renders when user has 2+ eligible workspaces.
type: feature
---

# Contextual Action Engine

Additive layer on top of Phase 1 workspace context. Does NOT change
existing operational flows.

## Pieces
- `src/hooks/useContextualWorkspace.ts` — resolves `workspace_id` for an action by intersecting user's memberships with `workspace_module_permissions`.
- `src/components/workspace/ContextualWorkspacePicker.tsx` — small chip selector; renders nothing when only 1 workspace is eligible; collapses to tiny inline chip after confirm.
- `src/lib/treeGrouping.ts` — `groupByYearWorkspaceUser` helper (não plugado ainda na UI).

## Rule
- 1 eligible workspace → auto-assign, no UI.
- 2+ eligible → require explicit pick (session-scoped, sessionStorage key `ctx_ws::<module>`).
- After confirm, picker collapses to a discreet `↳ <wsname>` chip that re-opens on click.

## Wired modules (creation flows)

| Módulo            | Arquivo                                          | Módulo string       |
|-------------------|--------------------------------------------------|---------------------|
| Ordens Serviço    | `src/pages/ServiceOrdersPage.tsx`                | `service_orders`    |
| Ordens Pagamento  | `src/pages/PaymentOrdersPage.tsx`                | `payment_orders`    |
| Faturamento       | `src/components/billing/ImportInvoiceDialog.tsx` | `billing`           |
| Frota / Trajetos  | `src/components/fleet/TripsModule.tsx`           | `fleet`             |
| Documentos        | `src/components/file-manager/EmbeddedFileManager.tsx` | (usa `useWorkspace` direto, sem picker) |

Em cada insert, é passado `workspace_id: ctx.resolvedWorkspaceId` quando
resolvido. Quando ausente, o trigger DB `set_workspace_id_from_creator`
preenche via `app_users.workspace_id` do criador (comportamento prévio).

## Compatibilidade
- Sem mudança de RLS, policies, queries existentes, cálculos financeiros.
- Sem mudança de UI para usuários single-workspace (picker invisível).
- OS↔OP↔Faturamento↔Financeiro sync intacto (triggers preservados).
