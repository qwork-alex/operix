
# Camada Central de Contexto de Identidade — Plano Cirúrgico

Princípios fixos (mantidos da Fase A):
- **Camada paralela**: `get_user_context()` é criada **ao lado** do que existe. Nada é substituído nesta fase.
- **Zero downtime**: nenhum trigger, RLS ou função existente é alterado.
- **Reversível em 1 migration**: basta `DROP FUNCTION` + `DROP VIEW`.
- **Módulos protegidos não tocados**: login, sessão, admin, SO, PO, atribuição, sync SO↔PO, upload, OCR, validação, bulk actions.

---

## 1. O problema real (auditoria objetiva)

Hoje a identidade do usuário é resolvida em **5+ lugares diferentes**, cada um com regra própria:

| Local | O que resolve | Risco |
|---|---|---|
| `useAuth` (FE) | `auth.uid` + `profile` básico | Não sabe role, não sabe membership |
| `useRole` (FE) | role via `user_roles` | Ignora memberships, ignora banido |
| `useImpersonation` | troca `effectiveUserId` | Cada hook tem que lembrar de usar |
| `usePermission/useCan` | chama `check_permission` linha-a-linha | N+1 silencioso |
| `useWorkspace` | workspace via `app_users.workspace_id` | Não cruza com `memberships` |
| RLS (`has_role`, `can_manage_all_orders`, `effective_role`, `is_user_active`, `current_user_workspace_ids`) | cada uma faz seu próprio JOIN | Divergem entre si |

**Consequência:** uma query em `useServiceOrders` pode dizer "sou técnico" enquanto o RLS diz "sou admin via owner-flag", e o trigger `apply_order_owner` ainda decide outra coisa. É exatamente daí que vêm os bugs de atribuição/visibilidade.

---

## 2. O que vai ser criado (FASE 1 — camada paralela)

Tudo abaixo é **novo**. Nenhum objeto existente é alterado.

### 2.1. Função `public.get_user_context(_workspace_id uuid default null)`

`SECURITY DEFINER`, `STABLE`, `search_path=public`. Retorna **uma linha JSONB** (não TABLE) para evitar joins perigosos e ser cacheável no FE em uma única chamada.

Campos retornados (chaves estáveis, contrato congelado):
```
{
  "auth_user_id":       uuid,            -- auth.uid()
  "app_user_id":        uuid | null,     -- app_users.id
  "email":              text,
  "is_active":          boolean,         -- is_user_active(auth.uid())
  "is_system_owner":    boolean,         -- profiles.is_system_owner OR email==owner
  "primary_role":       text,            -- 'admin'|'socio'|'tecnico'|'cliente' (display)
  "primary_db_role":    text,            -- 'admin'|'partner'|'technician'|'client'
  "secondary_roles":    text[],          -- futuro: memberships extras
  "current_workspace_id": uuid | null,   -- _workspace_id ou app_users.workspace_id
  "workspace_ids":      uuid[],          -- todos workspaces do usuário (memberships ativos)
  "membership_role":    text | null,     -- role no workspace atual via memberships
  "effective_role":     text,            -- effective_role() — fonte de verdade RBAC
  "can_manage_all":     boolean,         -- admin OU partner E ativo
  "can_view_all_workspace": boolean,     -- has_global_view()
  "ownership": {
    "technician_id":    uuid | null,     -- get_my_technician_id()
    "owns_filter_uids": uuid[]           -- [auth_user_id] (futuro: + delegados)
  },
  "flags": {
    "is_admin":         boolean,
    "is_partner":       boolean,
    "is_technician":    boolean,
    "is_client":        boolean,
    "is_impersonating": false            -- FE preenche; backend sempre false
  },
  "computed_at":        timestamptz
}
```

Implementação (resumo):
- Reusa funções existentes (`is_user_active`, `has_role`, `effective_role`, `has_global_view`, `get_my_technician_id`, `current_user_workspace_ids`).
- **Não cria nova tabela**, não muda enum, não muda nenhuma policy.
- Sem JOIN entre `auth.users` e `public.*` no body — apenas chamadas de helpers já SECURITY DEFINER (sem risco de recursão RLS).

### 2.2. View `public.v_user_context_self`

`SELECT public.get_user_context() AS ctx;`
RLS aberta para `authenticated` (o resultado já é só do próprio usuário, garantido pela função).
Permite ao FE fazer `supabase.from('v_user_context_self').select('ctx').single()` em vez de RPC.

### 2.3. Hook FE `useUserContext()` (apenas wrapper)

- Tanstack Query com `queryKey=['user-context', auth_uid, impersonatedUid]`.
- `staleTime: 5min`, `refetchOnWindowFocus: false`.
- `useAuth` continua existindo. `useRole` continua existindo. **Nada é removido.**
- `useUserContext` é exposto como **opcional** — quem quiser migrar, migra. Até a FASE 2 ninguém é forçado.

### 2.4. Documentação `.lovable/memory/auth/user-context-layer.md`

Contrato JSON, exemplos de uso, lista de hooks/queries a migrar (FASE 2/3).

---

## 3. Queries / hooks atuais que dependem de identidade

Mapeadas por categoria — base do plano de migração FASE 2.

| # | Local | Hoje usa | Risco se RLS mudar |
|---|---|---|---|
| 1 | `useAuth` | `auth.getSession`, `profiles` | Baixo |
| 2 | `useRole` | `user_roles` direto | Médio (ignora ban + membership) |
| 3 | `useImpersonation` | localStorage + `effectiveUserId` | Médio |
| 4 | `usePermission` / `useCan` / `<Can/>` | RPC `check_permission` por chamada | Alto (N+1) |
| 5 | `useWorkspace` | `app_users.workspace_id` | Médio |
| 6 | `useAssignableUsers` | `profiles` direto | Alto (já quebra para técnico) |
| 7 | `useServiceOrders` | filtra por `assigned_user_id`/`user_id` no FE | Alto |
| 8 | `usePaymentOrders` | idem | Alto |
| 9 | `useTechnicianEarnings` | resolve `technician_id` via `technicians` | Médio |
| 10 | `useReconciliation` / `useAgingAlerts` | `discrepancies` + assume admin | Médio |
| 11 | `useNotifications` | `auth.uid()` direto | Baixo |
| 12 | `useDashboardData` | mistura SO/PO/financial sem role-aware | Alto |
| 13 | `getCurrentUser` em `lib/authUser.ts` | duplica `useAuth` | Baixo (consolidar depois) |
| 14 | `applyScope` (`src/lib/applyScope.ts`) | recebe `teamIds` que ninguém preenche | Alto (silenciosamente vira `own`) |

**Padrões anti-pattern detectados a serem migrados:**
- `auth.uid()` direto no client → trocar por `ctx.auth_user_id`.
- `useRole().isAdmin` para decisões de dado → trocar por `ctx.flags.is_admin && ctx.is_active`.
- Filtro `created_by=auth.uid()` no FE → confiar no RLS já endurecido (Fase A) e usar `ctx.ownership.owns_filter_uids` quando precisar listar "meus".
- `useAssignableUsers` lendo `profiles` → migrar para `profiles_public` (FASE A2).

---

## 4. Plano de migração progressiva

### FASE 1 — Camada paralela (esta migration)
- Criar `get_user_context()` + view + hook + doc.
- **Nada mais.** App continua 100% igual.
- Validação: chamar como admin, sócio, técnico, banido, sem role, owner. Logar resultado em `rls_validation_logs` (`phase='user_context_v1'`).

### FASE 2 — Migração de leitores (não-críticos primeiro)
Ordem proposta, **um PR por item**:
1. `useNotifications` (risco zero) → trocar `auth.uid()` por `ctx.auth_user_id`.
2. `useDashboardData` → usar `ctx.flags` para decidir agregações.
3. `useAssignableUsers` → usar `ctx.can_manage_all` + `profiles_public` (já planejado em A2).
4. `useTechnicianEarnings` → usar `ctx.ownership.technician_id`.
5. `usePermission/useCan` → pré-carregar permissões a partir de `ctx` (eliminar N+1).
6. `useRole` permanece, mas internamente passa a ler `ctx.primary_db_role` (compat layer).

### FASE 3 — Remoção de dependências antigas
Só depois de FASE 2 estável ≥7 dias:
- Remover `getCurrentUser` duplicado em `lib/authUser.ts`.
- Marcar `useRole` como deprecated (ainda funciona, só re-exporta de `useUserContext`).
- Remover `applyScope` se não tiver mais consumidores reais.

**Nada disso entra agora.** Esta migration faz APENAS a Fase 1.

---

## 5. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Função pesada chamada em loop | Cache no Tanstack Query 5min + view `v_user_context_self` permite `select` único. |
| Recursão RLS | Função é `SECURITY DEFINER` e só chama helpers já `SECURITY DEFINER`. Não consulta nada com RLS aberta. |
| Drift entre `effective_role` e `primary_role` | `primary_role` deriva de `effective_role()` — fonte única. |
| Quebrar login | Login não chama `get_user_context`. Só chamado **depois** de sessão estabelecida. |
| Quebrar admin | Admin continua passando por `has_role` + `is_user_active`. Nada muda. |
| Multiworkspace futuro | `_workspace_id` parâmetro já existe; quando `memberships` virarem fonte (Fase F do roadmap), basta trocar internals da função sem mudar contrato. |

---

## 6. Validação obrigatória pós-aplicação

Para cada perfil, gravar resultado em `rls_validation_logs`:
- Admin (owner `qwork@qworkgroup.com`)
- Admin não-owner
- Sócio
- Técnico com SOs atribuídas
- Técnico sem nenhuma atribuição
- Usuário banido (`banned_until > now()`)
- Usuário sem `user_roles`

Critério de sucesso: `ctx.is_active`, `ctx.primary_role`, `ctx.can_manage_all` e `ctx.flags.*` devem bater com o comportamento real do RLS hoje. Qualquer divergência **bloqueia** a Fase 2.

---

## 7. O que **NÃO** entra nesta fase

- Substituir `useAuth`, `useRole`, `useWorkspace`, `useImpersonation`.
- Mudar qualquer policy RLS.
- Mudar `apply_order_owner`, `normalize_order_owner` (Fase A3).
- Mudar `provision_workspace_on_signup` (Fase F).
- Tocar em queries de SO/PO/financial/upload.
- Criar workspace real / multi-tenant.

---

## 8. Próximo passo

Aprovar **somente a Fase 1**: criar `get_user_context()` + view + hook + doc + validação em `rls_validation_logs`. Após 24h estáveis, abrir PR-1 da Fase 2 (`useNotifications`).
