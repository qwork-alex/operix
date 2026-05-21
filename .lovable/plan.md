# Automation Engine — Plano de implementação

Engine central de automações operacionais, isolado por workspace, sem tocar em tenancy/auth/RBAC. Reutiliza a infraestrutura já existente (`audit_log`, `notifications`, `backend_event_logs`, RLS via `is_workspace_member`).

## Arquitetura

```text
  EVENTO no DB                EDGE FUNCTION                 TABELAS
  (trigger SQL)               run-automation-engine         automation_rules
        │                            │                       automation_executions
        ▼                            ▼                       automation_dead_letter
  automation_queue  ─────►  fetch pending, match rules,
  (insert + NOTIFY)         exec actions (notification,
                            audit-log, status update,
                            retry com backoff)
                                     │
                                     ▼
                              audit_log + notifications
```

- **Triggers SQL leves** só fazem `INSERT` em `automation_queue` (não executam nada — zero risco de loop bloqueante).
- **Edge function** consome a fila (cron de 1 min + invocação manual), avalia condições, executa actions, regista cada passo em `automation_executions`. Erros após N tentativas vão para `automation_dead_letter`.
- **Anti-recursão**: cada evento carrega `source_correlation_id`; o engine recusa eventos cuja origem foi o próprio engine, e limita profundidade a 3.
- **Tenant-safe**: `workspace_id` obrigatório em todas as tabelas, RLS via `is_workspace_member`, edge function valida `workspace_id` antes de cada action.

## Schema (migration)

- `automation_rules` — `id`, `workspace_id`, `name`, `description`, `trigger_type`, `trigger_config jsonb`, `conditions jsonb`, `actions jsonb`, `delay_seconds`, `max_retries`, `retry_backoff_seconds`, `enabled bool`, `safe_mode bool` (dry-run), `created_by`, timestamps.
- `automation_queue` — `id`, `workspace_id`, `rule_id` (nullable até match), `event_type`, `entity_type`, `entity_id`, `payload jsonb`, `source_correlation_id`, `depth int`, `scheduled_at`, `status` (pending/processing/done/failed/dead).
- `automation_executions` — `id`, `workspace_id`, `rule_id`, `queue_id`, `started_at`, `finished_at`, `status`, `attempt int`, `actions_log jsonb[]`, `error text`, `dry_run bool`.
- `automation_dead_letter` — `id`, `workspace_id`, `queue_id`, `rule_id`, `last_error text`, `attempts int`, `payload jsonb`, `created_at`.

RLS:
- SELECT/INSERT/UPDATE/DELETE em `automation_rules` para membros do workspace com role admin/socio (reutiliza `is_workspace_member` + `effective_role`).
- `automation_executions` / `automation_dead_letter` / `automation_queue` — SELECT-only para membros; INSERT/UPDATE só via SECURITY DEFINER (edge function via service role).

## Triggers SQL (apenas enfileiram)

Pequenos `AFTER INSERT/UPDATE` em `service_orders`, `payment_orders`, `invoices`, `fleet_fuel_logs`, `marketplace_listings`, `auth_users_view`. Cada um faz:
```sql
INSERT INTO automation_queue (workspace_id, event_type, entity_type, entity_id, payload, source_correlation_id, depth)
VALUES (NEW.workspace_id, 'service_order.created', 'service_order', NEW.id, to_jsonb(NEW), NULL, 0);
```
Triggers ignoram eventos cuja `source_correlation_id` é prefixada `engine:` → anti-recursão.

## Edge function `run-automation-engine`

Cron a cada minuto via `pg_cron` + endpoint manual.
- Carrega lote de até 100 itens `pending` ordenados por `scheduled_at`.
- Para cada item: marca `processing`, faz match contra `automation_rules` (workspace + trigger_type + condições JSON-logic simples), executa actions, regista `automation_executions`.
- Retry com backoff exponencial até `max_retries`. Após esgotar → `automation_dead_letter`.
- `safe_mode = true` registra a execução mas não emite efeitos (dry-run).

### Tipos de action suportados (v1)
- `notify` — cria registo em `notifications`.
- `update_status` — update validado por whitelist de colunas seguras (status, prioridade, observação).
- `audit` — escreve em `audit_log` com `origin = 'automation'`.
- `webhook` — POST a URL configurada (com timeout 5s).
- `assign_user` — set de `assigned_user_id` em entidade.

Cross-workspace bloqueado: action recebe `workspace_id` do queue item e valida que a entidade alvo pertence ao mesmo workspace.

## UI

Nova página `/automations` (admin/sócio only) com 3 tabs:

1. **Regras** — lista de `automation_rules`, toggle on/off, duplicar, exportar JSON, importar JSON, abrir builder.
2. **Builder visual** — formulário com:
   - Trigger (dropdown dos event_types disponíveis)
   - Condições (lista de `field op value`)
   - Ações (lista ordenada com tipo + config)
   - Delay, retries, safe_mode
3. **Execuções** — feed paginado de `automation_executions` com filtros (regra, status, range), expandir para ver `actions_log` e erros. Botão "Re-tentar" para dead-letter.

Painel de monitorização no topo: KPIs (execuções 24h, sucessos, falhas, dead-letter, fila pendente).

## Integrações

- **Auditoria**: cada execução escreve em `audit_log` (operation `AUTOMATION`).
- **Notificações**: action `notify` usa pipeline existente.
- **Permissões**: a UI usa `useCan('automacao', 'gerir')` (mapeamento adicionado ao catálogo já presente em `UserPermissionsDialog`). Edge function valida via service role + workspace.

## Performance & segurança

- Fila assíncrona → frontend nunca bloqueia.
- Idempotência: chave única `(rule_id, queue_id, attempt)` em `automation_executions`.
- Anti-loop: depth máx. 3, source_correlation_id rejeitado se prefixo `engine:`.
- Timeout por action: 5s. Limite global por execução: 30s.
- Tenant isolation: WHERE workspace_id obrigatório em toda query do engine.

## O que NÃO muda (SAFE MODE)

- Nenhuma alteração em `auth.*`, `memberships`, `user_roles`, `effective_role`, providers, RLS de tabelas existentes.
- Nenhum trigger novo em tabelas Supabase reservadas.
- UI existente intacta; só adiciona rota `/automations` e entrada de sidebar gated.

## Entregáveis

1. Migration: 4 tabelas + RLS + função `enqueue_automation_event` + triggers nas tabelas operacionais.
2. Edge function `run-automation-engine` + cron schedule (1 min).
3. Hooks: `useAutomationRules`, `useAutomationExecutions`, `useAutomationQueueStats`.
4. Páginas: `AutomationsPage` (3 tabs) + builder.
5. Catálogo de permissões atualizado (`automacao.gerir`, `automacao.ver`).

## Fora do escopo desta fase

- Builder gráfico drag-and-drop estilo n8n (entregamos formulário estruturado; nó visual é fase 2).
- Conectores externos além de webhook genérico.
- Versionamento de regras (mantemos `updated_at`; histórico completo é fase 2).
