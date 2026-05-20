# Workspace Context Engine — Fase 1 (Backend + Compat Layer)

Refatoração arquitetural para multi-workspace **sem quebrar nada existente**. Esta fase é puramente backend/compat: nenhum redesign visual, nenhuma mudança em fluxos OS↔OP↔Billing↔Financial.

## Estado atual (já existe)

- Tabela `workspaces` (4 workspaces ativos) com `owner_user_id`.
- Tabela `memberships(user_id, workspace_id, role, status)` — base já correta.
- Colunas `workspace_id` parciais em: `app_users`, `documents`, `invites`, `service_orders`, `technicians`, `memberships`.
- Hooks: `useWorkspace`, `useUserContext`, `useImpersonation`, `useRole`.

## O que falta (foco desta fase)

### 1. DB — Migração aditiva (NÃO destrutiva)

Adicionar colunas **nullable** com default sensato (sem backfill obrigatório que quebre RLS):

- `workspace_id uuid` em: `payment_orders`, `financial_records`, `billing_invoices`, `billing_payments`, `billing_clients`, `billing_suppliers`, `clients`, `notifications`, `fleet_trips`, `fleet_fuel_logs`, `drivers`, `hail_reports`, `discrepancies`.
- `year_reference int` (default `extract(year from created_at)`) em: `service_orders`, `payment_orders`, `financial_records`, `billing_invoices`.
- `visibility_scope text` em entidades operacionais críticas (default `'workspace'`, valores: `'private'|'workspace'|'global'`).
- `created_by_user_id uuid` apenas onde **não existe** `created_by`/`user_id`/`uploaded_by` equivalente.

Backfill em UPDATE separado (não no ALTER):
- workspace_id = workspace do `created_by` via `app_users.workspace_id`, fallback `Default Workspace`.
- year_reference = `extract(year from created_at)::int`.

Índices: `(workspace_id)` em todas as tabelas alteradas, `(workspace_id, year_reference)` nas operacionais.

Tabela nova: `workspace_module_permissions(workspace_id, module text, enabled bool, settings jsonb)` — define quais módulos estão ativos por workspace (ex: RH bloqueia `financial`).

### 2. Camada SQL — Resolvers

Novas funções `SECURITY DEFINER` (não tocam policies existentes):

- `get_user_workspaces(_uid uuid)` — retorna `[{workspace_id, role, modules_enabled[]}]`.
- `user_can_access_workspace(_uid, _ws_id)` — bool.
- `user_can_access_module(_uid, _ws_id, _module)` — combina membership + `workspace_module_permissions`.
- `current_workspace_id()` — lê de header/setting; fallback ao primeiro membership ativo.

Estas funções **convivem** com `has_role`/`can_do` atuais. Policies só serão migradas em fases futuras (não agora).

### 3. Frontend — Context Engine

- `WorkspaceContextProvider` (extensão do `useWorkspace` atual, **sem renomeação**):
  - expõe `workspaceId`, `workspaces[]`, `modulesEnabledByWs`, `switchWorkspace()`, `canAccessModule(module)`.
  - persiste workspace ativo em `localStorage` (já existe via `selected_workspace_id`).
- `PermissionResolver` (`src/lib/workspaceScope.ts`):
  - `resolveModuleAccess(user, workspaces, module)` — union: módulo aparece no menu se **algum** ws permitir.
  - `scopeQuery(qb, workspaceId)` — helper para adicionar `.eq('workspace_id', wsId)` quando coluna existir (no-op em tabelas legadas).
- `AppSidebar` / menu: filtrar items por `canAccessModule` agregado.
- `WorkspaceSelector` (já existe): manter, só aparece se `workspaces.length > 1`. ✓
- Dentro de cada módulo: hooks (`useServiceOrders`, `usePaymentOrders`, etc.) **ganham filtro opcional** `workspace_id` quando a coluna existe — usando `scopeQuery` para evitar regressão em tabelas sem a coluna ainda.

### 4. Compatibilidade

- Todas mudanças DB são **aditivas**. Zero `DROP`, zero `NOT NULL` em colunas novas até backfill completo + validação.
- Policies RLS atuais permanecem inalteradas. Workspace isolation entra como **filtro adicional** no client primeiro; RLS por workspace é Fase 2.
- Comunicação OS↔OP↔Billing↔Financial usa relações existentes (`group_id`, `list_name`, `service_order_id`); workspace_id é metadata adicional.

## Validação

Após migração + deploy:

1. `SELECT count(*) FROM service_orders WHERE workspace_id IS NULL` → 0 esperado após backfill.
2. Login com user multi-workspace → `WorkspaceSelector` aparece, troca recarrega dados.
3. Login com user single-workspace → selector escondido.
4. Comparar contagem de SO/PO antes/depois do filtro de workspace → idêntica para user dentro do mesmo ws.
5. Smoke: criar OS, gerar OP, criar Invoice, registrar Payment → fluxo intacto.

## Fora de escopo (fases futuras)

- Migrar policies RLS para `workspace_id` (Fase 2).
- Workspace switching no UI de configurações.
- Permissões granulares por usuário+workspace+módulo (Fase 3 — usa `workspace_module_permissions` como base).
- Backfill de tabelas legadas (`mileage_logs`, `fuel_receipts`, `partner_clients`, etc.).

## Detalhes técnicos resumidos

- Migração: 1 arquivo SQL, ~200 linhas, idempotente (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
- Funções: schema `public`, `SECURITY DEFINER`, `SET search_path=public`.
- Frontend: 1 hook novo (`useWorkspaceModules`), 1 lib (`workspaceScope.ts`), edits pequenos em ~5 hooks.
- Sem mudança em edge functions nesta fase.
