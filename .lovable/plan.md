
# Hardening de Identidade — Diagnóstico + Plano (sem implementar)

Baseado no estado real do banco (tabelas, policies, funções) e do frontend (`useRole`, `usePermission`, `useImpersonation`, hooks de SO/PO).

---

## 1. Mapa de identidade (estado atual)

Existem **3 representações distintas do "usuário"** convivendo:

| Camada | Tabela | Chave | Para que serve hoje |
|---|---|---|---|
| Auth | `auth.users` | `id` (auth uid) | Login, `banned_until`, fonte para `is_user_active` |
| Perfil | `public.profiles` | `id = auth.uid()` | Nome, email espelho, display_code |
| Workspace user | `public.app_users` | `id` próprio + `auth_user_id` | "Membro" vinculado a `workspace_id`, ponte para `memberships` |
| Operacional | `public.technicians` | `id` próprio + `user_id = auth.uid()` | Identidade do técnico em SO/PO/financeiro |
| RBAC global | `public.user_roles` | `user_id = auth.uid()` | Fonte real de role hoje |
| RBAC por workspace | `public.memberships` | `user_id = app_users.id` | Existe mas **não governa nada ainda** (Fase 1 só populou) |
| Overrides | `public.user_permissions` | `user_id = auth.uid()` | Override por permissão |

**Problema raiz nº 1:** `user_roles.user_id`, `user_permissions.user_id`, `technicians.user_id`, `profiles.id` apontam para `auth.uid()`, mas `memberships.user_id` aponta para `app_users.id`. Qualquer policy futura que misture os dois precisa de JOIN — fonte garantida de bugs.

**Problema raiz nº 2:** Owner de workspace está em `workspaces.owner_user_id` E também em `memberships.role='admin'` E também em `user_roles.role='admin'`. Três fontes de verdade para a mesma pergunta ("este usuário manda aqui?").

---

## 2. Ownership por tabela (auditoria real das RLS)

Legenda: ✅ consistente · ⚠️ inconsistente · 🔴 risco de vazamento

### Operacional

| Tabela | Coluna(s) de ownership | SELECT policy resumida | Status |
|---|---|---|---|
| `service_orders` | `user_id`, `assigned_user_id`, `created_by` (3!) | admin OR partner OR uid em qualquer das 3 | ⚠️ 3 colunas redundantes mantidas em sincronia por trigger `normalize_order_owner` |
| `payment_orders` | idem SO | idem SO | ⚠️ idem |
| `financial_records` | `user_id`, `assigned_user_id`, `created_by`, `technician_id` | admin/partner OR uid em 3 colunas | ⚠️ + duplica identidade do técnico via `technician_id` |
| `documents` | `uploaded_by` + `row_in_scope()` | usa `check_permission` com scope own/team/all | ✅ mais limpo, mas depende de scope correto |
| `clients` | `user_id`, `created_by` | admin OR uid; SELECT = qualquer authenticated | 🔴 **SELECT = `auth.uid() IS NOT NULL`** — qualquer técnico vê todos os clientes |
| `technicians` | `user_id` | usa `has_permission` em 5 módulos OR admin/partner OR self | ⚠️ qualquer um com `view` em SO/PO/financial vê todos os técnicos (provavelmente intencional, mas amplo) |
| `notifications` | `user_id` | self OR admin | ✅ |
| `discrepancies` | — | SELECT = qualquer authenticated | 🔴 técnico vê discrepâncias de todos |
| `financial_entries` | `created_by` | SELECT = admin/partner | ✅ |
| `profit_rules` / `_items` / `_distributions` | `created_by` | admin all, SELECT = admin/partner | ✅ |
| `service_order_distributions` | — | admin all, SELECT = admin/partner | ⚠️ técnico não vê o próprio breakdown |

### Frota

| Tabela | Coluna | SELECT | Status |
|---|---|---|---|
| `drivers` | `created_by` | admin/partner/technician (todos) | 🔴 técnico vê todos os motoristas |
| `vehicles` (não listada mas referida) | `assigned_technician_id` | via assignments | ⚠️ |
| `fleet_trips` | `created_by`, `driver_id` | admin/partner OR técnico se for o driver/criador | ✅ |
| `fleet_trip_points` | via `trip.created_by` | join | ✅ |
| `fleet_fuel_logs` | `created_by` | admin/partner OR self | ✅ |
| `mileage_logs` | `driver_user_id` | admin/partner OR self | ✅ |
| `fuel_receipts` | — | admin/partner | ✅ |
| `vehicle_assignments` | via `vehicle.assigned_technician_id` | admin/partner OR self | ✅ |

### Identidade / RBAC

| Tabela | SELECT | Status |
|---|---|---|
| `app_users` | admin OR partner OR self | ⚠️ partner vê todos — ok hoje, mas amarra "partner = co-admin" |
| `memberships` | admin OR self (via app_users join) | ✅ |
| `user_roles` | self OR admin | ✅ |
| `user_permissions` | self OR admin | ✅ |
| `permissions` / `role_permissions` | qualquer authenticated | ✅ catálogo público |
| `profiles` | `can_manage_all_orders(uid) OR id = uid` | ⚠️ técnico **não vê** profiles dos colegas → quebra qualquer dropdown "atribuir a outro" para não-admins |
| `partner_clients` | admin OR self | ✅ |
| `technician_clients` | admin OR self via `get_my_technician_id()` | ✅ |
| `user_settings` | self OR admin | ✅ |
| `user_usage` | self OR admin | ✅ |
| `backend_event_logs` | admin only | ✅ |
| `invites` | admin only | ✅ |

### Resumo dos vazamentos confirmados
- 🔴 `clients.SELECT` aberto a qualquer authenticated.
- 🔴 `discrepancies.SELECT` aberto a qualquer authenticated.
- 🔴 `drivers.SELECT` aberto a admin/partner/**qualquer technician**.
- ⚠️ `service_order_distributions` invisível para o próprio técnico (oposto: bloqueio excessivo).

---

## 3. Conflitos arquiteturais detectados

1. **Triplo ownership em SO/PO/FR**: `user_id` + `assigned_user_id` + `created_by`. Mantidos em sincronia por trigger, mas qualquer UPDATE que esqueça uma coluna desfaz a invariante. Frontend trata como se fossem coisas diferentes em alguns hooks.
2. **Duas fontes de role** (`user_roles` global vs `memberships` por workspace). Frontend hoje lê **apenas** `user_roles` (`useRole`). Funções `effective_role` existem mas ninguém chama. Risco: quando começarmos a usar `memberships`, telas e RLS divergem.
3. **Owner de workspace em 3 lugares** (`workspaces.owner_user_id`, `memberships.role='admin'`, `user_roles.role='admin'`).
4. **`technician_id` duplica identidade**: `financial_records.technician_id` + `technician_id` em SO/PO. Resolvido por triggers (`enforce_technician_id_consistency`, `set_financial_record_technician`), mas depende deles estarem ativos.
5. **`auth_user_id` vs `app_users.id`**: convenção mista. RLS de `memberships` precisa do JOIN; qualquer hook frontend que esqueça isso quebra.
6. **`partner` ≈ admin**: ~todas as policies tratam `admin OR partner` como equivalentes. Não há real separação de poder; "partner" é só "admin sem botão de delete".
7. **`has_permission` vs `check_permission` vs `can_do`**: 3 funções DB resolvem permissão, com semânticas levemente diferentes (`has_permission` retorna bool, `check_permission` retorna scope, `can_do` é wrapper). Policies escolhem aleatoriamente qual usar.
8. **`is_user_active` whitelista o owner por email** — funciona, mas acopla regra de negócio a uma string. Se alguém renomear a conta, owner some.
9. **`provision_workspace_on_signup`** cria workspace + membership admin para todo signup novo → cada usuário "vira workspace" no signup. Foi exatamente o problema que o usuário pediu para corrigir e ainda está ativo.
10. **`workspace_id` esparso**: existe em `app_users`, `technicians`, `documents`, `service_orders`, `invites`, `memberships`. **Não existe** em `payment_orders`, `financial_records`, `clients`, `profit_*`, `fleet_*`, `discrepancies`. Logo, qualquer RLS por workspace hoje seria impossível sem schema migration.

---

## 4. Bugs estruturais observáveis (mapeados a causa)

| Sintoma | Causa provável |
|---|---|
| Técnico vê dados de outros (clientes, motoristas, discrepâncias) | RLS aberta nessas 3 tabelas (§2) |
| Técnico não vê o próprio breakdown de distribuição | `sod` SELECT só admin/partner |
| Dropdowns "atribuir a usuário" vazios para não-admin | `profiles.SELECT` exige `can_manage_all_orders` |
| Atribuição "desaparece" após salvar | Trigger `normalize_order_owner` força `user_id = assigned_user_id = auth.uid()` para quem não é admin/partner. Frontend escolhe outro tech → trigger sobrescreve silenciosamente |
| Status SO não sincroniza | `sync_so_status_from_po` depende de `group_id` OR (`week`+plate normalizada). Se PO entra sem `group_id` e plate está só em SO → não casa |
| Autofill de técnico quebra | `enforce_technician_id_consistency` zera `technician_id` se não bate com `assigned_user_id`. Edição que só muda técnico sem mexer no assigned vira NULL |
| Listas vazias após selecionar workspace | Frontend assume `workspace_id` em tabelas que não têm a coluna → query sem WHERE devolve nada via RLS |
| Componentes só funcionam para admin | Padrão repetido nos hooks que filtram por `created_by = auth.uid()` em vez de usar a policy |
| Banido continua "aparecendo" em listas | `is_user_active` está nos `has_role`/`can_manage_all_orders` mas **as listas de usuários (UsersPage) puxam de `app_users` direto** sem filtrar `banned_until` |

---

## 5. Plano de estabilização em fases

Princípio: cada fase é **reversível**, **não muda contrato visual** e mantém `user_roles` como fonte de role até a Fase 4.

### Fase A — Tapar vazamentos críticos (baixo risco, alto impacto)
**Escopo:** restringir SELECT em `clients`, `discrepancies`, `drivers`. Abrir SELECT de `service_order_distributions` para o técnico dono da SO.
- Risco: telas que dependiam de "ver tudo" sem ser admin podem perder linhas. Mitigação: manter admin/partner com acesso total; técnico só vê o que tem relação direta (próprio cliente via `technician_clients`, próprio motorista via `created_by`, própria discrepância via SO).
- Impacto frontend: **nenhum se a UI já respeita escopo**; potencial de listas menores para técnicos (que é o efeito desejado).
- Downtime: zero. Migrations idempotentes.

### Fase B — Consolidar ownership de orders (médio risco)
**Escopo:** manter as 3 colunas (compat) mas tratar **`user_id` como única fonte de verdade**. Trigger passa a derivar `assigned_user_id` e `created_by` apenas se nulos; nunca sobrescreve `user_id` válido escolhido pelo admin.
- Risco: regressão na atribuição automática para técnicos. Mitigação: testes manuais com 1 técnico + 1 admin antes de promover.
- Impacto frontend: hooks que leem `assigned_user_id` continuam funcionando.

### Fase C — Visibilidade de profiles para dropdowns (baixo risco)
**Escopo:** ampliar `prof_select_role_user_id` para permitir que qualquer authenticated **veja {id, full_name, display_code, email}** via uma view `profiles_public` (sensitive fields ficam fora). Política da tabela base permanece restrita.
- Risco: exposição de nomes/emails entre membros. Mitigação: view sem `phone`, `avatar_url` opcional.
- Impacto frontend: dropdowns "atribuir a" voltam a funcionar para não-admin.

### Fase D — Filtrar usuários banidos nas listagens de UI (baixo risco)
**Escopo:** garantir que toda query de listagem de usuários (UsersPage, useAssignableUsers, dropdowns) filtre via uma view `app_users_active` que faz JOIN com `auth.users` e exclui `banned_until > now()`. Owner sempre visível.
- Risco: nenhum.
- Impacto frontend: troca de fonte (`app_users` → `app_users_active`) em ~3 hooks.

### Fase E — Unificar resolvers de permissão (médio risco)
**Escopo:** depreciar `has_permission` (bool sem scope); todas as policies passam a usar `check_permission` via `row_in_scope`/`can_do`. `has_permission` vira wrapper de `can_do` para compat.
- Risco: comportamentos sutis de scope mudam onde policies usavam `has_permission` (que ignora scope). Mitigação: migrar tabela por tabela, com QA por módulo.

### Fase F — Migrar RBAC para memberships (alto risco — Fase 3 já planejada)
Já existe `mem://auth/rbac-phase3-plan`. Pré-requisito: **Fases A–E concluídas + dual-write `user_roles ↔ memberships`** (Fase 2). Só então `has_role`/`check_permission` passam a ler `memberships` com fallback.

### Fase G — Encerrar "usuário = workspace" (baixo risco depois de F)
**Escopo:** desativar `provision_workspace_on_signup` (signup público já está bloqueado para não-owners hoje, então remover é seguro). Remover dependência de `workspaces.owner_user_id` em código que pergunta "quem manda" — passar a usar `effective_role`.

---

## 6. Matriz de risco

| Fase | Risco DB | Risco Frontend | Downtime | Reversível? |
|---|---|---|---|---|
| A | Baixo | Listas menores p/ técnico (esperado) | 0 | Sim (rollback de policy) |
| B | Médio | Atribuição muda comportamento | 0 | Sim |
| C | Baixo | Dropdowns ganham itens | 0 | Sim (drop view) |
| D | Baixo | Hooks trocam fonte | 0 | Sim |
| E | Médio | Scope pode ficar mais estrito | 0 | Sim por tabela |
| F | **Alto** | Telas baseadas em role podem mudar | 0 se dual-source | Sim (feature flag em `effective_role`) |
| G | Baixo | Nenhum se F estável | 0 | Sim |

---

## 7. O que NÃO entra neste plano (declarado)

- Não cria multi-tenant real.
- Não mexe em `auth.users` schema.
- Não remove `user_roles` (mantido como fallback).
- Não muda UI nem rotas.
- Não altera edge functions de invite/admin-create-user.

---

## 8. Próximo passo sugerido

Aprovar **Fase A isolada** (tapar 3 vazamentos + abrir distribuição para o técnico dono). É a única que tem ganho de segurança imediato sem tocar em ownership/role. As demais fases ficam pendentes para aprovação individual.
