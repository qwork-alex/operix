---
name: Automation Engine
description: Workspace-scoped automation engine — rules (triggers/conditions/actions), async queue, retries, dead-letter, dry-run safe_mode, anti-recursion. Edge function run-automation-engine drains queue every minute.
type: feature
---

Engine de automações operacional, isolado por workspace, sem dependências em RBAC core.

**Tabelas**
- `automation_rules` — config (trigger_type, conditions[], actions[], delay, retries, safe_mode, enabled).
- `automation_queue` — fila assíncrona; INSERT only via `enqueue_automation_event()` SECURITY DEFINER.
- `automation_executions` — log de cada execução (status: success|failed|skipped|dry_run, actions_log, error, attempt).
- `automation_dead_letter` — items que esgotaram `max_retries`.

**RLS**
- Rules: SELECT membros do workspace; INSERT/UPDATE/DELETE só admin ou partner.
- Queue/Executions/Dead-letter: SELECT membros; sem escrita direta (motor usa service role).

**Triggers SQL leves** em `service_orders`, `payment_orders`, `fleet_fuel_logs` → só enfileiram via `enqueue_automation_event`. Triggers ignoram `source_correlation_id` com prefixo `engine:` e profundidade > 3. `enqueue_automation_event` curto-circuita quando não há regra ativa para o evento.

**Edge function** `run-automation-engine`
- Cron pg_cron a cada minuto + endpoint manual (`runAutomationEngineNow()` no front).
- Batch 100, timeout por action 5s, total 30s.
- Retry com backoff exponencial (`retry_backoff_seconds * 2^attempt`).
- Action types: `notify`, `audit`, `update_status` (whitelist colunas), `assign_user`, `webhook`. Todas com `eq workspace_id` para isolamento tenant.

**UI** `/automations` (gated `settings.edit`)
- 3 tabs: Regras (toggle, duplicar, export/import JSON, editar, eliminar), Execuções (feed com filtros + actions_log expandível), Dead-letter.
- KPIs: 24h total/sucessos/falhas/dry-run/pendentes/dead.
- Botão "Executar agora" invoca a edge function.

**Anti-recursão**
- depth máx. 3.
- correlation `engine:*` recusado.
- enqueue só se houver regra ativa que combine.

**SAFE MODE garantido**: nada tocado em auth, memberships, user_roles, effective_role, providers ou RLS de tabelas existentes.
