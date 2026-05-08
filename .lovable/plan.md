
# Fase A — Endurecimento cirúrgico (sem downtime, sem refactor)

Princípios fixos:
- Nada de workspace, multiempresa ou reescrita.
- Cada mudança é **reversível em 1 migration**.
- Camada de compatibilidade primeiro, mudança de policy depois.
- Módulos críticos protegidos: **login, sessão, admin, service_orders, payment_orders, atribuição de técnico, sync SO↔PO, upload, OCR, validação, bulk actions**. Nenhuma alteração nessa lista nesta fase.

---

## 1. Problemas detectados (da auditoria) — análise individual

### P1 — `clients.SELECT` aberto a qualquer authenticated 🔴
- **Causa real:** policy `clients_select_authenticated` usa `auth.uid() IS NOT NULL`.
- **Risco real:** qualquer técnico/parceiro lê todos os clientes do sistema (PII: nome, email, telefone, endereço).
- **Tabelas afetadas:** `clients`.
- **Queries afetadas:** `useServiceOrders` (join client_name), dropdowns de cliente em SO/PO, `ClientsPage` se existir, `useConfrontoOSOP`.
- **Frontend:** dropdowns de cliente para técnicos podem encolher (esperado) → precisa expor nome+id via view pública.
- **Backend:** triggers `link_payment_order_to_service_order` não dependem de RLS (security definer).
- **Downtime:** 0.
- **Regressão:** média — qualquer hook que assumia "vejo todos" perde linhas.
- **Classificação:** **aplicar em etapas** (precisa view `clients_public_min` antes de fechar SELECT).

### P2 — `discrepancies.SELECT` aberto a qualquer authenticated 🔴
- **Causa:** policy `discrepancies_select_authenticated`.
- **Risco:** técnico vê discrepâncias de outros (valores esperados/recebidos de SO alheias).
- **Tabelas:** `discrepancies`.
- **Queries afetadas:** `useReconciliation`, `PendentesTab`, `HistoricoTab`, `useAgingAlerts`.
- **Frontend:** abas de Confronto para não-admin podem ficar vazias — comportamento desejado.
- **Backend:** trigger `run_discrepancy_sync_trigger` é SECURITY DEFINER, não afetado.
- **Downtime:** 0. **Regressão:** baixa (UI já gateia por role na maioria dos lugares).
- **Classificação:** **seguro aplicar agora** — basta restringir a admin/partner + dono da SO via EXISTS.

### P3 — `drivers.SELECT` aberto a admin/partner/qualquer technician 🔴
- **Causa:** policy `drv_select` permite todo `technician`.
- **Risco:** técnico vê PII de motoristas que não são dele.
- **Tabelas:** `drivers`.
- **Queries afetadas:** `DriversModule`, `TripsModule` (dropdown), `FleetReportsModule`.
- **Frontend:** técnico só deve ver motoristas que ele criou (`created_by = auth.uid()`).
- **Downtime:** 0. **Regressão:** baixa-média (relatórios de frota para técnico).
- **Classificação:** **seguro aplicar agora**.

### P4 — `service_order_distributions.SELECT` invisível para o técnico dono ⚠️
- **Causa:** policy `sod_admin_partner_select`.
- **Risco:** técnico não vê o próprio breakdown de lucro (já reclamado).
- **Tabelas:** `service_order_distributions`.
- **Queries:** `useTechnicianEarnings`, `TechnicianDetailTab`.
- **Frontend:** ganha linhas para técnico — apenas das próprias SOs.
- **Downtime:** 0. **Regressão:** nenhuma (só amplia leitura controlada).
- **Classificação:** **seguro aplicar agora**.

### P5 — `profiles.SELECT` exige `can_manage_all_orders` ⚠️
- **Causa:** policy `prof_select_role_user_id`.
- **Risco:** dropdowns "atribuir a usuário" vazios para técnicos/partners.
- **Tabelas:** `profiles`.
- **Queries:** `useAssignableUsers`, dropdowns de SO/PO.
- **Frontend:** menus de atribuição quebrados para não-admin.
- **Downtime:** 0. **Regressão:** **expõe nomes/emails entre membros** — decisão de produto.
- **Classificação:** **aplicar em etapas** — criar view `profiles_public` (id, full_name, display_code) sem email/phone/avatar; manter policy base restrita.

### P6 — Triplo ownership em SO/PO/FR mantido por trigger frágil ⚠️
- **Causa:** `normalize_order_owner` força `user_id = assigned_user_id` para não-admin → admin que reatribui também é vítima quando há bug em `can_manage_all_orders`.
- **Risco:** atribuição "desaparece" silenciosamente; sync SO↔PO via `assigned_user_id` quebra.
- **Tabelas:** `service_orders`, `payment_orders`, `financial_records`.
- **Queries:** todas as listagens, edição inline, bulk edit, atribuição.
- **Frontend:** comportamento do dropdown "Técnico" instável.
- **Downtime:** 0 se feito com shadow-column + log; **alto** se trocar trigger direto.
- **Regressão:** alta sem validação.
- **Classificação:** **perigoso — depende de validação manual**.

### P7 — `is_user_active` whitelista owner por email string ⚠️
- **Causa:** hardcoded `qwork@qworkgroup.com`.
- **Risco:** rename de email derruba acesso do owner.
- **Classificação:** **seguro aplicar agora** — manter email + adicionar fallback por flag `is_system_owner` em `profiles` (column nova nullable, default null), sem remover o email.

### P8 — `provision_workspace_on_signup` ainda ativo
- **Causa:** trigger cria workspace por usuário no signup.
- **Risco:** "usuário = workspace" persiste.
- **Classificação:** **depende de validação manual** — sair de cena só após Fase F (RBAC por memberships). Nesta fase só **adicionar log** e medir se é disparado.

### P9 — `has_permission` vs `check_permission` vs `can_do` divergem
- **Classificação:** **aplicar em etapas** — fora do escopo da Fase A. Apenas documentar.

---

## 2. Sub-fases incrementais

### FASE A1 — correções sem risco (aplicar primeiro)

Inclui P2, P3, P4, P7 + ambiente de estabilização.

1. **Criar tabela `rls_validation_logs`** (apenas para auditoria temporária):
   ```sql
   CREATE TABLE public.rls_validation_logs (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     phase text NOT NULL,
     check_name text NOT NULL,
     before_count bigint, after_count bigint,
     sample jsonb, created_at timestamptz DEFAULT now()
   );
   ```
   Permite gravar contagens "antes/depois" por usuário-teste.

2. **P2 — discrepancies SELECT restrita**
   - **Antes:** `USING (auth.uid() IS NOT NULL)`
   - **Depois:** `USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR EXISTS(SELECT 1 FROM service_orders so WHERE so.id = discrepancies.service_order_id AND (so.user_id = auth.uid() OR so.assigned_user_id = auth.uid() OR so.created_by = auth.uid())))`
   - **Impacto:** técnico vê apenas discrepâncias das próprias SOs.
   - **Rollback:** `DROP POLICY discrepancies_select_authenticated; CREATE POLICY ... USING (auth.uid() IS NOT NULL);`
   - **Validação:** logar contagem para 1 admin + 1 técnico antes/depois em `rls_validation_logs`.

3. **P3 — drivers SELECT restrita**
   - **Antes:** admin/partner/qualquer technician.
   - **Depois:** admin/partner OR `created_by = auth.uid()`.
   - **Rollback:** recria policy original (1 statement).
   - **Validação:** abrir `DriversModule` como técnico — vê só os dele.

4. **P4 — sod SELECT amplia para dono da SO**
   - **Antes:** admin/partner.
   - **Depois:** admin/partner OR `EXISTS(SELECT 1 FROM service_orders so WHERE so.id = sod.service_order_id AND (so.user_id=auth.uid() OR so.assigned_user_id=auth.uid()))`
   - **Rollback:** trivial.
   - **Validação:** técnico abre `TechnicianDetailTab` e vê próprio breakdown.

5. **P7 — owner fallback por flag**
   - Adiciona coluna `profiles.is_system_owner boolean default false`.
   - Atualiza `is_user_active` para `OR EXISTS(profiles WHERE id=_user_id AND is_system_owner=true) OR <regra atual de email>`.
   - **Rollback:** voltar função à versão anterior.
   - **Validação:** marcar owner atual com flag; logar `SELECT is_user_active(owner_id)` continua true.

**Critério de avanço A1 → A2:** 24h em produção sem incidente em login/sessão/SO/PO.

---

### FASE A2 — correções com validação parcial (depois de A1 estável)

Inclui P1 e P5 (precisam camada de compatibilidade antes de fechar policy).

1. **P5 — view `profiles_public`**
   ```sql
   CREATE VIEW public.profiles_public AS
     SELECT id, full_name, display_code FROM public.profiles;
   GRANT SELECT ON public.profiles_public TO authenticated;
   ```
   - Migrar `useAssignableUsers` para ler de `profiles_public` (sem mexer na policy da tabela base).
   - **Impacto FE:** dropdowns voltam a funcionar para todos.
   - **Rollback:** `DROP VIEW`; reverter hook.
   - **Validação:** logar contagem antes/depois em `rls_validation_logs` para 1 técnico.

2. **P1 — clients SELECT restrita + view mínima**
   ```sql
   CREATE VIEW public.clients_public_min AS
     SELECT id, name, display_code FROM public.clients;
   GRANT SELECT ON public.clients_public_min TO authenticated;
   ```
   - Só **depois** de migrar dropdowns que precisam só de id+nome para `clients_public_min`, fechar policy:
   - **Antes:** `USING (auth.uid() IS NOT NULL)`
   - **Depois:** `USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'partner') OR can_access_client(auth.uid(), id))`
   - **Rollback:** policy antiga + DROP VIEW (2 statements).
   - **Validação:** técnico continua vendo SOs (que carregam `client_name` denormalizado), e vê detalhe completo apenas dos clients onde `technician_clients` existe.

**Critério de avanço A2 → A3:** UI verificada com 3 perfis (admin, partner, technician) sem regressão.

---

### FASE A3 — correções críticas com rollback preparado

Inclui P6 (ownership) e instrumentação de P8.

1. **P8 — instrumentar provision_workspace_on_signup** (não desativar):
   - Adicionar `INSERT INTO backend_event_logs ('auth','PROVISION_TRIGGERED', ...)` no início do trigger.
   - Permite confirmar que signup público está realmente bloqueado antes de remover o trigger numa fase futura.
   - Risco: zero. Rollback: remover INSERT.

2. **P6 — endurecer `apply_order_owner` sem trocar contrato**:
   - Adicionar parâmetro implícito: se `_requested_assigned_user_id` é diferente de `_old_assigned_user_id` E o caller é admin/partner, **respeitar a escolha** sem coalesce que sobrescreva.
   - Atualmente a função já respeita `v_can_manage_all`, mas o `COALESCE(_requested_user_id, _requested_assigned_user_id, _old_user_id, ...)` pode mascarar NULL intencional.
   - **Antes:** ver função atual em `db-functions`.
   - **Depois:** quando `v_can_manage_all` e `_requested_assigned_user_id IS NOT NULL`, usar `_requested_assigned_user_id` direto.
   - **Rollback:** restaurar versão atual (versionar com sufixo `_v1` antes de substituir).
   - **Validação manual obrigatória:** admin reatribui SO para outro técnico → confirmar persistência após reload + após sync de PO.

**Crítico:** A3 só executa após A1 + A2 estáveis em produção por ≥48h.

---

## 3. O que **NÃO** entra na Fase A

- Workspace real / multi-tenant.
- Migração de `user_roles` → `memberships` (Fase F separada).
- Unificação `has_permission`/`check_permission` (Fase E).
- Remoção de `created_by`/`assigned_user_id` (mantidos como compat).
- Qualquer alteração em: login flow, session refresh, edge functions de upload/OCR, bulk actions, `normalize_order_owner` (só `apply_order_owner` é tocada e com versionamento).

---

## 4. Matriz final

| Item | Sub-fase | Risco | Reversível | Validação |
|---|---|---|---|---|
| P2 discrepancies | A1 | Baixo | 1 SQL | Contagem antes/depois |
| P3 drivers | A1 | Baixo | 1 SQL | UI técnico |
| P4 sod | A1 | Nulo | 1 SQL | UI técnico |
| P7 owner flag | A1 | Nulo | 1 SQL | RPC is_user_active |
| P5 profiles_public | A2 | Baixo | DROP VIEW | UI dropdowns |
| P1 clients | A2 | Médio | 2 SQL | UI 3 perfis |
| P8 provision log | A3 | Nulo | 1 SQL | Logs em 7d |
| P6 apply_order_owner | A3 | Médio | Restaurar v1 | QA manual reatribuição |

---

## 5. Próximo passo

Aprovar **somente A1** (5 mudanças isoladas, todas reversíveis em 1 statement, zero impacto em login/sessão/SO/PO/atribuição). Após 24h estáveis, abrir A2.
