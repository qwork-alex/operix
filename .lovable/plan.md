# Fase 2.5 — Hard Isolation Layer (RLS + Frontend Scoped)

Objetivo: fechar vazamentos cross-workspace **sem** alterar UI, cálculos,
matching OS↔OP, distribution engine, triggers de sync, reconciliation ou
realtime existente. Apenas **adicionar** uma camada contextual de
isolamento por `workspace_id`, mantendo 100% de compatibilidade.

---

## Princípios de segurança

- **Aditivo, nunca destrutivo**: novas policies convivem com as antigas.
  Policies antigas só são removidas em fase posterior, depois de validação
  em produção.
- **Admin/Partner continuam admin, mas só dentro dos seus workspaces**
  (membership ativa). Sem mais "vê tudo global".
- **Fallback preservado**: trigger `set_workspace_id_from_creator` continua
  preenchendo `workspace_id` em inserts antigos.
- **Zero migração de legado** nesta fase. `workspace_id` permanece
  nullable; legado segue visível pelo dono.

---

## 2.5.1 — DB: helpers + RLS workspace-scoped (aditivo)

### Helper SQL (novo)

```sql
create or replace function public.user_workspace_ids(_uid uuid)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.workspace_id
  from public.memberships m
  join public.app_users au on au.id = m.user_id
  where au.auth_user_id = _uid
    and m.status = 'active'
$$;

create or replace function public.is_workspace_member(_uid uuid, _ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _ws is not null and exists (
    select 1 from public.user_workspace_ids(_uid) x where x = _ws
  )
$$;

create or replace function public.has_role_in_workspace(
  _uid uuid, _role public.app_role, _ws uuid
) returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_uid, _role) and public.is_workspace_member(_uid, _ws)
$$;
```

### Policies novas (ADICIONAR, não remover ainda)

Para cada tabela crítica abaixo, criar policy de SELECT/UPDATE/DELETE
adicional, com nome prefixado `ws_scope_*`, que exige:

```
workspace_id is not null
and public.is_workspace_member(auth.uid(), workspace_id)
```

Tabelas: `service_orders`, `payment_orders`, `billing_invoices`,
`billing_attachments`, `billing_payments`, `billing_reconciliations`,
`financial_records`, `documents`, `fleet_trips`, `fleet_fuel_logs`,
`reconciliation_links` (se existir), `profit_distribution_rules`,
`profit_distribution_items`.

Como Postgres usa OR entre policies permissivas, **as policies antigas
(created_by/has_role admin global) continuam funcionando para legado sem
workspace_id**, e o novo escopo só **abre** acesso quando o usuário é
membro do workspace do registro. Para BLOQUEAR admin global de outros
workspaces precisamos converter as policies antigas de PERMISSIVE para
incluir a checagem de workspace. Faremos isso em duas etapas:

- Etapa A (esta fase): criar policies novas `ws_scope_*`. NÃO remover as
  antigas. Isso ainda permite vazamento via admin global — mitigado no
  frontend pelo scope defensivo (2.5.2).
- Etapa B (Fase 3 já planejada): trocar `has_role(uid,'admin')` por
  `has_role_in_workspace(uid,'admin',workspace_id)` dentro das policies
  antigas. Migração documentada em
  `.lovable/memory/auth/rbac-phase3-plan.md`.

### INSERT/UPDATE com workspace_id

Adicionar WITH CHECK nas policies de INSERT para exigir que, **quando
workspace_id é fornecido**, ele esteja entre os workspaces do usuário.
Mantém compatibilidade quando o trigger preenche depois.

---

## 2.5.2 — Frontend: scopeQuery defensivo

Já existe `src/lib/workspaceScope.ts` com `scopeQuery(qb, table, wsId)`.
**Não criar novo helper.** Aplicar em:

- `useServiceOrders.ts` — list query
- `usePaymentOrders.ts` — list query
- `usePaymentListsConsolidated.ts`
- `useDashboardData.ts` — soQ, poQ, frQ, clientQ
- `useReconciliation.ts`
- `useConfrontoOSOP.ts`
- `useAgingAlerts.ts`
- `useTechnicianEarnings.ts`
- `useAccountingExpensesByPeriod.ts`
- `useNotifications.ts`
- `useParticipantAggregation.ts`
- Billing screens: `InvoicesScreen`, `PaymentsScreen`,
  `ReconciliationScreen`, `ReportsScreen`, `ClientsScreen`,
  `UpcomingBillsScreen`
- Financial: `ExpenseSpreadsheet`, `OverviewTab`,
  `TechnicianDetailTab`, `PartialPaymentsList`, `FinancialMovements`
- Fleet: `TripsModule`, `FuelLogsModule`, `VehiclesModule`,
  `DriversModule`, `FleetReportsModule`, `FleetDocumentsModule`
- Dashboard widgets: `RecentActivity`, `ActiveMap`,
  `OperationalMap`, `OperationalPanel`, `OperationalOpportunities`,
  `RevenueChart`, `ServicePieChart`
- `EmbeddedFileManager` (global scope path)
- Profit: `ProfitDistribution` queries

Padrão:

```ts
import { useWorkspace } from "@/hooks/useWorkspace";
import { scopeQuery } from "@/lib/workspaceScope";

const { workspaceId } = useWorkspace();
let q = supabase.from("service_orders").select("...");
q = scopeQuery(q, "service_orders", workspaceId);
```

Querykeys: adicionar `workspaceId` para evitar **cache cruzado**:

```ts
queryKey: ["service_orders", workspaceId, ...rest]
```

Realtime: adicionar `workspaceId` ao channel name onde aplicável:

```ts
.channel(`service_orders:${workspaceId}`)
```

Não tocar em lógica de matching, status, distribution, reconciliation —
apenas adicionar filtro de leitura.

---

## 2.5.3 — Admin/Partner contextual

Sem alterar RBAC nem permissões. O efeito sai automaticamente da
combinação 2.5.1 (RLS Etapa B na Fase 3) + 2.5.2 (frontend já scoped).

Para reforçar agora, **o frontend** trata admin/partner como contextual:
queries sempre adicionam `.eq('workspace_id', currentWs)`. Resultado:
admin do QW não vê dados do RH no aplicativo, mesmo que a RLS ainda
permita.

---

## 2.5.4 — Hardening gradual

- Manter `workspace_id` **nullable** no schema.
- Inserts novos: hook contextual já força `workspace_id` quando
  resolvido; trigger preenche o resto.
- `year_reference`: trigger atual continua preenchendo. Nada a fazer.

---

## 2.5.5 — Read engine contextual

Já implementado por `useWorkspace` + `useContextualWorkspace`. Esta fase
apenas garante que **todas as leituras críticas** consomem `workspaceId`
do `useWorkspace()` ativo.

Quando o usuário perde acesso ao workspace, `useWorkspace` recalcula e o
TanStack Query refaz com a nova key — sessão contextual invalidada
automaticamente.

---

## 2.5.6 — Validação e relatório

Após implementação, gerar
`/mnt/documents/phase_2_5_isolation_report.md` com:

1. Helpers SQL criados.
2. Policies novas (lista por tabela).
3. Policies antigas ainda existentes (não removidas — planejado p/ Fase 3).
4. Queries frontend protegidas (lista de arquivos).
5. Realtime channels renomeados.
6. Cenários 1–5 (manualmente verificáveis no app).
7. Riscos residuais (principal: admin global ainda passa via RLS antiga
   até Fase 3; mitigado por scope frontend).
8. Performance: nenhum custo extra além do `IN` sobre memberships.
9. Checklist de readiness Fase 3.

---

## Resumo de arquivos

**Migration**: 1 (helpers + ~13 policies aditivas).

**Frontend tocados (~25 arquivos)**: hooks de leitura listados em 2.5.2.
Cada arquivo recebe 2-4 linhas: import + scopeQuery + queryKey ws.

**Memória**: `.lovable/memory/auth/phase-2-5-hard-isolation.md` (novo).

**Sem migração de dados. Sem alteração de UI. Sem alteração de
triggers/calculations/matching.**
