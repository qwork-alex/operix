# Inventário Supabase — Fase 0 (onda 2)

Gerado em 2026-07-13. Levantamento de todo o código frontend que ainda depende do
Supabase (desativado), cruzado com o que já existe no backend próprio (Prisma/Express).

**Totais:** 139 chamadas `supabase.from()/rpc()`, 14 `functions.invoke()`,
3 arquivos com realtime (`RealtimeHub.ts`, `RuntimeHealthMonitor.ts`, `VirtualEngineer.ts`).

## Situação do banco (Prisma)

**Já existem no Postgres:** users, app_users, profiles, user_roles, workspaces,
memberships, billing_* (profiles, clients, suppliers, invoices, attachments),
platform_invoices, platform_bank_accounts, clients, service_orders, payment_orders,
production_orders, production_photos, workspace_invites, documents, backend_event_logs.

**Faltam no Postgres** (todas têm DDL preservado em `supabase/migrations/`):

| Tabela | Fase | Migration de origem |
|---|---|---|
| platforms | 1 (OS) | `20260522082132_*.sql` |
| financial_records | 2 | `20260320182156_*.sql` |
| service_order_distributions | 2 | `20260413201811_*.sql` |
| profit_rules / profit_rule_items | 2 | `20260413201811_*.sql` |
| discrepancies | 2 | `20260320182156_*.sql` |
| reconciliations | 2 | `20260513225919_*.sql` |
| hail_events | 4 | `20260514224827_*.sql` |
| hail_reports | 4 | `20260515063020_*.sql` |
| operational_events | 4 | `20260522105858_*.sql` |
| ai_alerts / ai_recommendations | dashboard | `20260521202858_*.sql` |
| vehicles, drivers, fleet_* | fora da onda 2 | várias |

## Fase 1 — Ordens de Serviço

| Arquivo | Dependência Supabase | Ação |
|---|---|---|
| `src/hooks/usePlatforms.ts` | tabela `platforms` | **BUG 01**: criar model + rota `/api/platforms`; migrar hook |
| `src/pages/ServiceOrdersPage.tsx` (4 chamadas) | `service_orders` | Migrar para rota `serviceOrders` existente |
| `src/components/service-orders/ServiceOrdersTable.tsx` | `service_orders` | **BUGs 02/03**: migrar edição/persistência para REST |

## Fase 2 — Financeiro

| Arquivo | Dependência Supabase | Ação |
|---|---|---|
| `src/hooks/useConfrontoOSOP.ts` (5) | `service_orders`, `payment_orders` | Rota agregada `/api/finance/confrontation` (dados já migrados) |
| `src/hooks/useReconciliation.ts` (6 + invoke `run-reconciliation`) | `reconciliations`, `discrepancies` | Criar tabelas + portar function `run-reconciliation` |
| `src/components/profit/ProfitDistribution.tsx` (7) | `profit_rules`, `profit_rule_items`, `service_order_distributions` | Criar tabelas + rota `/api/finance/distribution` |
| `src/components/financial/TechnicianDetailTab.tsx` (6) | `financial_records` | Criar tabela + rota `/api/finance/detail` |
| `src/components/accounting/FinancialAIAssistant.tsx` | invoke `financial-ai-insights` | Portar function (usa OPENAI/GEMINI já no .env) |
| `src/components/accounting/ImportReceiptDialog.tsx` | invoke `extract-receipt` | Portar para `/api/extract/*` (padrão já existe) |
| `src/hooks/useCompliance.ts` (5) | RPCs `compute_*` | Abas Audit/Intégrité — portar lógica das RPCs (ver migrations) |

## Fase 3 — Faturas

| Arquivo | Dependência Supabase | Ação |
|---|---|---|
| `src/components/billing/ImportInvoiceDialog.tsx` | invoke `extract-invoice` | Portar para `/api/extract/invoice` |
| `src/components/billing/ReportsScreen.tsx` (2) | `billing_invoices`, `billing_payments` | Rota REST (tabelas já existem) |
| — | function `generate-invoice-pdf` | Base para o redesign premium (BUG 04) |
| — | function `send-invoice-email` | Reaproveitar SMTP já configurado no backend |

## Fase 4 — Radar de Granizo / PDR

| Arquivo | Dependência Supabase | Ação |
|---|---|---|
| `src/components/dashboard/OperationalEventsStream.tsx` (6) | `hail_events`, `operational_events` | Criar tabelas + rota `/api/hail/*` |
| `src/hooks/useOperationalSignals.ts` (5) | `operational_events` | Migrar para REST |
| `src/hooks/useOperationalKpis.ts` (4) | agregações | Rota de KPIs |
| `src/lib/operationalBus/OperationalEventBus.ts` | realtime | Substituir por polling ou WebSocket próprio |
| `src/components/dashboard/HailReportDialog.tsx` | `hail_reports` | Criar tabela + rota |
| — | function `ingest-hail` (Tomorrow.io) | Portar + job agendado — chave já validada no .env |
| — | function `calculate-route` (OpenRoute) | Portar para `/api/route` — chave já validada no .env |

## Fora da onda 2 (registrar, não fazer agora)

- **Fleet** (o maior bloco: ~60 chamadas em 10 arquivos — vehicles, drivers, trips,
  fuel, assignments, documents + invoke `extract-fleet-document` e `calculate-route`)
- `src/pages/ModulePages.tsx` (16 chamadas variadas + invoke `reset-system`)
- Dashboard geral: `useDashboardData.ts`, `ai_alerts`, `ai_recommendations`,
  `automation_executions`
- Segurança/compliance: `securityLog.ts`, `deviceFingerprint.ts`, RPCs `register_device`,
  `revoke_*`, `request_data_export`, `user_privacy_settings`, `user_consents`
- `useAIOrchestrator.ts` (invokes `ai-orchestrator`, `ai-action`), `companySearch.ts`
  (invoke `company-lookup`), `useTechnicianSubscription.ts`, `JoinPage.tsx` (invites —
  conferir se já coberto por `workspace_invites`)
- Realtime: `RealtimeHub.ts`, `RuntimeHealthMonitor.ts`, `VirtualEngineer.ts`

## Padrão de proxy para APIs externas (decisão de arquitetura)

Toda API externa que exige secret é consumida **somente pelo backend**; o frontend fala
apenas com `/api/*` via `apiRequest()`:

- Rotas: `backend/src/routes/<dominio>.ts` (ex.: `weather.ts`, `route.ts`) montadas em
  `/api`, protegidas pelo middleware de auth JWT existente.
- Chaves: `.env` da raiz → repassadas ao container no bloco `environment` do serviço
  `api` no `docker-compose.yml` (padrão `NOME: ${NOME:-}`) → placeholder no `.env.example`.
- Nunca criar `VITE_*` para secrets (variáveis `VITE_*` são embutidas no bundle público).
- Respostas de APIs externas devem ter timeout e cache curto no backend quando fizer
  sentido (ex.: tiles/eventos de clima) para não estourar rate limits.
- Chaves já validadas e disponíveis no `.env` (2026-07-13): `TOMORROW_API_KEY`,
  `OPENROUTE_API_KEY`, `NASA_API_KEY`, `METEOSTAT_RAPIDAPI_KEY`.
