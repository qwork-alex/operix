# Refatoração controlada — Arquitetura de usuários (sem quebrar o motor atual)

## Princípio absoluto

**Nada do sistema de IDs existente será alterado.** Reutilizamos 100% do que já está em produção:

- `profiles.id` (UUID) — referência primária, **inalterada**
- `profiles.display_code` — formato `S#####` (sócios/admins/workspace owners)
- `technicians.display_code` — formato `T#####`
- `clients.display_code` — formato `C#####`
- Sequences `technician_display_seq`, `client_display_seq`, `partner_display_seq` — **inalteradas**
- Triggers `set_technician_display_code`, `set_client_display_code`, `set_partner_display_code` — **inalterados**
- Tabelas `memberships`, `invites`, `user_roles`, `workspaces` — schemas preservados; só adicionamos colunas opcionais

Nenhum ID antigo é regenerado. Nenhum relacionamento existente é alterado. OS, OP, faturamento, financeiro, automações, Stripe, RLS atuais permanecem intactos.

## O que muda (apenas extensões)

### 1. Banco — extensões mínimas

Adições retro-compatíveis (tudo `IF NOT EXISTS`, nada destrutivo):

- `profiles.display_code` — preencher para **todos** os perfis que ainda não têm um, usando o tipo correto conforme o `user_roles.role` do usuário (`admin/socio` → `S#####`; `tecnico` → `T#####` (puxa de `technicians.display_code` se já existir); `cliente` → `C#####`). Sequências existentes continuam sendo a fonte; nenhum código novo é inventado.
- Função `public.find_profile_by_display_code(_code text)` (SECURITY DEFINER, somente leitura) — resolve `T00001 | S00001 | C00001` → `profiles.id`.
- Tabela `workspace_invites` (nova, **paralela** à `invites` legada que continua intacta):
  ```
  id UUID PK default gen_random_uuid()
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
  target_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
  role app_role NOT NULL          -- reutiliza enum existente
  status TEXT NOT NULL DEFAULT 'pending'  -- pending | accepted | rejected | cancelled
  created_by UUID NOT NULL REFERENCES profiles(id)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  responded_at TIMESTAMPTZ
  UNIQUE (workspace_id, target_profile_id, status) WHERE status = 'pending'
  ```
  Com RLS:
  - workspace owner/admin pode `SELECT/INSERT/UPDATE` convites do próprio workspace
  - target_profile_id (o próprio usuário convidado) pode `SELECT` e `UPDATE` (aceitar/rejeitar) os convites dele
- RPC `accept_workspace_invite(_invite_id uuid)` — cria `memberships` row com status `active` se aceito; tudo via SECURITY DEFINER com checagem de identidade.
- RPC `create_workspace_invite_by_code(_workspace_id uuid, _display_code text, _role app_role)` — resolve display_code → profile_id e insere convite.

`memberships` já é many-to-many (user_id × workspace_id), então **multi-workspace já é suportado nativamente** — não precisamos alterar nada lá.

### 2. Auth (`src/pages/Auth.tsx`)

Trocar o switch atual de 2 opções por 3 abas, mantendo o visual dark/glass atual:

```
[ Entrar ] [ Criar Técnico ] [ Criar Workspace ]
```

- **Criar Técnico**: form nome + email + senha → `supabase.auth.signUp` com `user_metadata.intended_role = 'tecnico'`. O trigger existente `handle_new_user` (vamos estender minimamente para ler esse flag) cria a row em `technicians` e atribui `T#####` automaticamente. **Sem workspace** — o técnico fica independente até receber convites.
- **Criar Workspace**: fluxo atual preservado, nenhuma alteração.
- **Entrar**: inalterado.

### 3. Perfil (`src/pages/ProfilePage.tsx`)

Adicionar bloco "Meu ID":
- Mostra `profiles.display_code` (ex.: `T00001`)
- Botão copiar (clipboard) com feedback toast
- Texto auxiliar: "Compartilhe seu ID para ser adicionado a workspaces"

### 4. Usuários (`/users` — provavelmente `src/pages/ModulePages.tsx` ou similar)

Adicionar duas abas no topo da tela atual de usuários, **sem mudar a tabela/listagem existente abaixo**:

```
[ Criar usuário ] [ Adicionar usuário existente ]
```

- **Criar usuário**: o formulário/fluxo atual de admin-create-user permanece intacto.
- **Adicionar usuário existente**: input "Digite ID do usuário (ex.: T00001)" + select de role + botão "Enviar convite" → chama `create_workspace_invite_by_code`.
- Lista de convites pendentes do workspace embaixo, com ação "Cancelar".

### 5. Tela de convites recebidos (técnico/usuário independente)

Pequeno banner/dropdown no TopBar quando o usuário tem convites pendentes — abre modal listando workspaces que o convidaram com botões "Aceitar" / "Recusar".

## O que NÃO muda

- Visual dark premium, glass-panel, mobile-first, AgentPanel, sidebar — preservados.
- `user_roles`, `memberships`, `workspaces`, `technicians`, `clients`, `profiles` — schemas existentes intactos (só adições opcionais).
- Tabela `invites` legada (email-based, com `short_code`) — continua funcionando em paralelo.
- Stripe, billing, OS, OP, financeiro, automações, RLS atuais — zero alterações.
- Geração de IDs — continua usando as sequences atuais. Nenhum ID antigo é tocado.

## Ordem de execução

1. **Migration única** (idempotente): backfill `profiles.display_code`, criar `workspace_invites` + RLS + RPCs + extensão mínima do trigger `handle_new_user` para ler `intended_role = 'tecnico'`.
2. Após aprovação da migration, frontend:
   - `src/pages/Auth.tsx` — 3 abas
   - `src/pages/ProfilePage.tsx` — bloco "Meu ID"
   - Página `/users` — duas abas (Criar / Adicionar existente) + lista de convites pendentes
   - `src/components/layout/TopBar.tsx` — indicador de convites recebidos + modal aceitar/recusar
3. Hook novo `src/hooks/useWorkspaceInvites.ts` (TanStack Query) cobrindo: listar enviados, listar recebidos, criar por código, aceitar, recusar, cancelar.

## Resultado esperado

- Técnico pode existir sozinho (sem workspace).
- Workspace pode adicionar técnico/sócio/cliente já existente via `T#####`, `S#####`, `C#####`.
- Técnico pode pertencer a múltiplos workspaces (já era suportado por `memberships`; agora exposto na UI).
- Login passa a ter 3 caminhos.
- Zero quebra: todos os IDs, relacionamentos, telas, OS/OP/financeiro/Stripe continuam funcionando exatamente como hoje.

Quer aprovar e seguir com a migration?
