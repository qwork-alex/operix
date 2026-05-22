# Plano — Painel Operacional Realtime (SAFE MODE)

Escopo grande. Vou entregar em **5 fases independentes** para você validar entre uma e outra. Cada fase é um commit isolado, reversível, sem tocar tenancy, auth, RBAC, providers, edge functions, migrations destrutivas.

## Fase 1 — KPIs operacionais (topo do dashboard)

**Arquivo:** `src/pages/Index.tsx` + novo `src/components/dashboard/OperationalKPIs.tsx`

Remover os 4 KPICard atuais (Receita, Pagamentos pendentes, Serviços concluídos, Desempenho).

Substituir por 6 cards realtime:


| Card                   | Fonte                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| Plataformas ativas     | `service_orders` distinct `platform` com `status in (in_progress, paused)`           |
| Plataformas encerradas | `service_orders` com `status in (completed, confirmed)` agrupadas por mês corrente   |
| Clientes ativos        | `clients` com OS criadas últimos 30d                                                 |
| Técnicos ativos        | `user_roles role=technician` cruzado com `service_orders.technician_name` últimos 7d |
| Dispatch IA            | `ai_recommendations` `status=pending`                                                |
| Alertas operacionais   | `ai_alerts` `status=open` + `discrepancies` não resolvidas                           |


Visual: mantém `glass-panel` existente, adiciona badge de status (dot pulsante para "live"), micro-animação `animate-fade-in` (já existe). Sem redesign do `KPICard`, criar variante `OperationalKPICard` ao lado.

Realtime: 1 único `supabase.channel('dashboard-kpis')` escutando `service_orders`, `ai_recommendations`, `ai_alerts` → `queryClient.invalidateQueries(['op-kpis'])`. Throttle de 2s para evitar rerender storm.

## Fase 2 — Estado por plataforma (árvore operacional)

**Backend (migration leve, não destrutiva):**

- Adicionar coluna `platform_state text default 'active' check (platform_state in ('active','paused','closed','archived'))` em `service_orders` (nullable preserva compat).
- Sem trigger novo. Sem RLS nova (herda das existentes).

**Frontend:**

- Localizar componente da árvore 2025→Cliente→Plataforma (provavelmente em `ServiceOrdersTable` ou `treeGrouping.ts`) e adicionar:
  - Cor contextual da linha da plataforma (azul/cinza/vermelho/âmbar via classe semântica).
  - Botão toggle (ícone) **só no hover** (`opacity-0 group-hover:opacity-100`).
  - Mutation `update platform_state` com optimistic update.
- Dashboard Fase 1 passa a contar por `platform_state`.

## Fase 3 — Eventos operacionais inteligentes

**Arquivo:** novo `src/components/dashboard/OperationalEvents.tsx`, remove `ServicePieChart` e `RecentActivity` do `Index.tsx`.

Stream unificado de eventos das tabelas já existentes:

- `backend_event_logs` (login, alterações)
- `ai_recommendations`, `ai_insights`, `ai_alerts`
- `automation_executions` (dispatch automático)
- `discrepancies`

Renderiza últimas 30 entradas com ícone, cor semântica, timestamp relativo, link contextual. Realtime via canal único. Virtualizado se >50 itens.

## Fase 4 — Radar PDR (restauração) — **CRÍTICO**

Não vou reescrever. Vou diagnosticar primeiro:

1. Inspecionar `OperationalMap.tsx` (1664 linhas) para identificar:
  - `useEffect` com deps incorretas causando teardown do mapa
  - subscriptions duplicadas (procurar múltiplos `supabase.channel`)
  - polling de meteorologia (intervalos órfãos)
  - race conditions em sources do maplibre
2. Verificar edge function `ingest-hail` (última execução, logs).
3. Verificar tabela `hail_events` (linhas recentes, `is_demo` flag).
4. Fix cirúrgico — sem reescrita, só correções localizadas + cleanup de intervals/channels no unmount.

Entrego relatório do que estava quebrado + patch.

## Fase 5 — Refinos: RevenueChart, Oportunidades, performance

- `RevenueChart`: melhorar legenda/espaçamento (apenas CSS/tokens, sem mudar dados).
- `OperationalOpportunities` já existe — promover para card lateral do dashboard com marketplace ativo (`marketplace_listings` recentes).
- Sweep de performance: `React.memo` nos cards, `useMemo` em agregações pesadas, debounce 250ms em invalidações realtime.

## Fora de escopo (não vou tocar)

- Mapbox/Google/Windy: você pediu só "preparar arquitetura" — vou criar `src/lib/mapProviders.ts` como interface abstrata (não troca o provider atual maplibre).
- Tenancy, auth, RBAC, memberships, automations engine, IA orchestrator, edge functions existentes, policies, triggers.
- Sidebar (já reorganizado em fase anterior).

## Ordem de entrega proposta

Posso entregar **tudo numa única resposta** (5 fases em sequência), ou parar após cada fase para você validar. Dado o risco do radar (Fase 4), **recomendo entregar Fases 1+2+3 juntas e tratar Fase 4 separadamente** depois que eu inspecionar o radar e te mostrar o diagnóstico.

## Pergunta antes de começar

1. Confirmo a coluna `platform_state` em `service_orders`? (Fase 2 depende disso.)
2. Entrego Fases 1+2+3 agora e Fase 4 (radar) em resposta separada com diagnóstico antes do fix? Ou prefere que eu ataque o radar primeiro?

Pode seguir.

IMPORTANTE:

não quero modelar platform_state diretamente em service_orders.

Quero avaliar arquitetura correta de plataformas para evitar dívida técnica futura.

Antes da UI:

mapear origem única do estado operacional e subscriptions realtime existentes.

O radar PDR é feature estratégica core do produto.

Priorizar estabilidade realtime e arquitetura extensível antes de refinamento visual.