---
name: Workspace Context Engine Phase 1
description: Multi-workspace core — workspace_id em todas tabelas operacionais/financeiras, year_reference, visibility_scope, workspace_module_permissions, resolvers SQL + hooks frontend opt-in
type: feature
---

# Workspace Context Engine — Phase 1 (additive)

## DB schema (Fase 1 aplicada)

Colunas adicionadas (nullable, backfilled):
- `workspace_id` em: payment_orders, financial_records, billing_invoices, billing_payments, billing_clients, billing_suppliers, billing_attachments, billing_reconciliations, clients, notifications, fleet_trips, fleet_fuel_logs, drivers, hail_reports, discrepancies. (Já existia em: service_orders, app_users, documents, invites, memberships, technicians.)
- `year_reference int` em: service_orders, payment_orders, financial_records, billing_invoices.
- `visibility_scope text DEFAULT 'workspace'` em: SO, PO, FR, billing_invoices, documents, clients, billing_clients.

Tabela nova: `workspace_module_permissions(workspace_id, module, enabled, settings)`. Default: módulo enabled a menos que linha explícita marque `enabled=false`.

Backfill executado em `SET LOCAL session_replication_role='replica'` para evitar triggers de owner. 0 nulls após migração.

## Triggers automáticos
- `set_year_reference()` BEFORE INSERT: SO/PO/FR/billing_invoices.
- `set_workspace_id_from_creator()` BEFORE INSERT: 15 tabelas. Resolve via `app_users.workspace_id` do `created_by`/`uploaded_by`/`user_id`, fallback a primeira membership ativa.

## Resolver functions (SECURITY DEFINER)
- `get_user_workspaces(_uid)` → workspaces ativas do usuário.
- `user_can_access_workspace(_uid, _ws)` → bool (admin ou membership ativa).
- `user_can_access_module(_uid, _ws, _module)` → cruza membership + workspace_module_permissions.

## Frontend (opt-in)
- `src/lib/workspaceScope.ts` — `scopeQuery(qb, table, wsId)` no-op se tabela não tem workspace_id ou wsId é null. Lista `WORKSPACE_SCOPED_TABLES`.
- `src/hooks/useWorkspaceModules.ts` — agrega permissões por workspace, expõe `canAccessModule(ws, module)` e `canAccessAnyWorkspaceModule(module)` para menu.
- `useWorkspace` + `WorkspaceSelector` existentes permanecem fonte de verdade do workspace ativo. Selector só aparece se `workspaces.length > 1` (já implementado).

## NÃO foi feito (Fase 2+)
- Migração de policies RLS para workspace_id (continuam baseadas em created_by/user_id/has_role).
- UI para gerenciar workspace_module_permissions.
- NOT NULL em workspace_id.
- Filtro automático nos hooks existentes (`useServiceOrders` etc) — opt-in via `scopeQuery` quando refatorar.

## Compatibilidade
- Zero quebra em OS↔OP↔Billing↔Financial. Triggers existentes (`sync_so_status_from_po`, `sync_financial_records_from_orders`, `billing_invoices_propagate_status`) intactos.
- Cross-workspace leak ainda possível via RLS atual; isolamento real entra na Fase 2 (policies).
