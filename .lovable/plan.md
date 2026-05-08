
# Estabilização RBAC — Plano Cirúrgico (Fase B)

Continuação direta da Fase A1 (RLS hardening) e Fase 1 (User Context Layer). Mantém o método: zero downtime, mudanças reversíveis, validação por fase, sem workspace ainda.

## Diagnóstico real (do estado atual)

Revisei policies, funções e hooks. Os sintomas relatados têm **causas concretas**:

| Sintoma | Causa real |
|---|---|
| Técnico vendo dados indevidos | `clients.SELECT` permite **qualquer authenticated**. `financial_records.SELECT` aceita `created_by=auth.uid()` (técnico vê o que ele criou em outros módulos). `tech_select_scoped` em `technicians` libera SELECT a quem tem qualquer permission de view (matriz frouxa). |
| Admin funciona diferente | Admin tem shortcut em quase tudo (`has_role admin`); demais roles caem em `created_by=auth.uid()` OR `assigned_user_id=auth.uid()` OR `user_id=auth.uid()` — três colunas, três caminhos, comportamento diverge quando uma fica NULL. |
| Queries só com visão global | `useServiceOrders`/`usePaymentOrders` usam `applyScope(scope, user, "user_id")` no FE. Se o `scope` resolvido = `'all'`, sem filtro; se `'own'`, força `user_id=uid` — mas a RLS aceita também `assigned_user_id`/`created_by`, criando descasamento FE↔DB. |
| Status sincroniza parcial | `sync_so_status_from_po` depende de `group_id` OU `week+plate normalizada`. Quando OP não tem `group_id` e a placa difere por 1 char, a SO não atualiza. |
| Atribuições somem | Triggers `force_*_auth_owner` + `normalize_order_owner` **sobrescrevem** `user_id` e `assigned_user_id` para o mesmo valor (`v_owner`). Se admin edita uma SO de um técnico sem reenviar `assigned_user_id`, o owner muda. |
| Autofill quebra sob RLS | `set_*_user_from_auth` é **redundante** com `force_*_auth_owner` e `normalize_order_owner`; três triggers competem na mesma coluna em ordens diferentes por tabela. |
| FE esconde, BE não bloqueia | `Can`/`PermissionGuard` esconde botões, mas várias tabelas (`profit_rules`, `profit_rule_items`, `reconciliations`) só checam `has_role admin`/`partner` no SELECT — sem `check_permission`. |

## Princípios

1. **Backend é a verdade.** FE deixa de filtrar com `applyScope`; passa a confiar nas policies.
2. **Uma única coluna de owner por tabela** para decisão (continuamos suportando as três por compat, mas a função canônica `is_row_visible_to(_uid, _row)` decide).
3. **Triggers de owner consolidados** — uma só função por tabela, ordem determinística.
4. **Tudo passa por `get_user_context()`** no FE; `useRole`/`useAuth` viram wrappers finos.
5. **Nenhuma policy é alterada antes de validar com `rls_validation_logs`** (compara contagem antes/depois por role).

## Fases

### B1 — Helpers canônicos no DB (sem alterar policies)

Criar funções `STABLE SECURITY DEFINER` que serão a base das próximas fases. **Nenhuma policy muda ainda.**

- `public.is_order_visible(_uid uuid, _user_id uuid, _assigned uuid, _created_by uuid) → bool` — encapsula a regra atual (admin/partner OR uid bate em qualquer das três).
- `public.is_order_writable(_uid uuid, _user_id uuid) → bool` — admin/partner OR `_user_id=_uid`.
- `public.owner_filter_uids(_uid uuid) → uuid[]` — array de uids que o user pode "ver como owner" (hoje = `[_uid]`; preparado para grupos futuros).
- `public.assert_active(_uid uuid)` — RAISE se `is_user_active=false`. Usada em triggers.

**Risco:** zero. Só adiciona funções.
**Validação:** `SELECT public.is_order_visible(...)` em 10 SOs reais para admin, sócio, técnico — comparar com SELECT atual.

### B2 — Consolidar triggers de owner (1 PR por tabela)

Hoje convivem em `service_orders`, `payment_orders`, `financial_records`, `clients`, `company_settings`:
- `set_*_user_from_auth` (BEFORE INSERT)
- `force_*_auth_owner` (BEFORE INSERT/UPDATE)
- `normalize_order_owner` (BEFORE INSERT/UPDATE em SO/PO)

Substituir por **um único trigger** `BEFORE INSERT OR UPDATE` por tabela chamando `apply_order_owner()` (que já existe e está correto). Remover os duplicados.

**Correção do bug "atribuição some":** quando admin/partner faz UPDATE sem mexer em `assigned_user_id`, preservar `OLD.assigned_user_id` em vez de forçar = `user_id`. Ajustar `apply_order_owner` para tratar `assigned_user_id` independentemente de `user_id` quando o caller é admin/partner.

**Risco:** médio. Cada tabela = 1 migration + smoke test (insert/update via UI por admin, sócio, técnico).
**Validação:** `rls_validation_logs` registra `before/after_count` de cada tabela.

### B3 — Hardening de SELECT em tabelas frouxas

Por ordem de risco:

1. **`clients.SELECT`** — hoje libera qualquer authenticated. Restringir a: admin/partner OR `created_by=auth.uid()` OR `EXISTS partner_clients/technician_clients`. Já temos `can_access_client()`.
2. **`financial_records.SELECT`** — remover `created_by=auth.uid()` da regra (vazamento cross-módulo). Manter admin/partner OR `user_id=auth.uid()` OR `assigned_user_id=auth.uid()`.
3. **`technicians.tech_select_scoped`** — remover o leque de permissions; manter admin/partner OR `user_id=auth.uid()` OR `EXISTS technician_clients` para parceiros.
4. **`profit_rules`/`profit_rule_items`/`reconciliations`/`profit_distributions`** — adicionar bloqueio explícito por `is_user_active(auth.uid())`. Hoje só checam `has_role` que já checa active, mas tornar redundante e seguro.
5. **`notifications`** — já está correto (`user_id=auth.uid()`). Sem mudança.

Cada policy é trocada com `BEGIN; ... validação ... COMMIT;` e log em `rls_validation_logs` (phase='B3').

**Risco:** alto se errar. Mitigação: **shadow mode primeiro** — criar policy paralela com nome `*_v2` em modo permissivo somando à existente, medir contagens via `rls_validation_logs`, só então DROP da antiga.

### B4 — Migrar FE para `useUserContext` + remover `applyScope`

Ordem (1 PR por item, com smoke test):

1. `useNotifications` → `ctx.auth_user_id` (trivial).
2. `useDashboardData` → `ctx.flags.is_admin/is_partner/is_technician`.
3. `useTechnicianEarnings` → `ctx.ownership.technician_id`.
4. `useServiceOrders`/`usePaymentOrders` → **remover `applyScope`**. RLS já filtra. FE só envia filtros de UI (`client_id`, `week`, etc.). Resolve o bug "queries só funcionam com visão global".
5. `useAssignableUsers` → `ctx.can_manage_all`.
6. `usePermission/useCan` → ler permissões pré-carregadas em `ctx` (evita 3 queries paralelas no boot).
7. `useRole` → wrapper de `ctx.primary_db_role`. Mantém API para não quebrar consumidores.
8. Deletar `src/lib/applyScope.ts` quando 0 imports.

**Risco:** médio. Cada hook tem teste manual: admin vê tudo, sócio vê o permitido, técnico vê só atribuídos, banido vê nada.

## Validação por fase

Para cada fase, registro em `rls_validation_logs`:
- contagem de linhas visíveis para 1 admin de teste, 1 sócio, 1 técnico, 1 banido — antes e depois.
- amostra de 5 IDs por role.
- divergência > 0 em qualquer combinação **bloqueia** a fase seguinte.

## O que NÃO entra agora

- Workspace / multi-tenant. (Fase C, futura.)
- Mudança em `auth.uid()` espalhado dentro de funções DB (continuam usando — é seguro lá).
- `useAuth` continua sendo a fonte do `session`/`user` do Supabase.
- Edge functions não mudam.
- Sem refactor visual / UI.

## Ordem de execução proposta

```
B1 (helpers)   → 1 migration, ~10min, risco zero
B2 (triggers)  → 5 migrations (1/tabela), risco médio
B3 (RLS)       → 4 migrations com shadow mode, risco alto
B4 (FE)        → 7 PRs sequenciais, risco médio
```

**Recomendo aprovar apenas B1 agora.** Depois de validar 24h, abrimos B2 tabela por tabela.
