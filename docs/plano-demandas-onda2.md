# Plano — Demandas prioritárias (onda 2)

Fonte: `demandas_sistema.pdf` (raiz do repo, 24 págs). Contexto: sistema construído no Lovable
e migrado para esta VPS (Postgres + MinIO + Express/JWT). A causa-raiz comum da maioria dos
bugs é código frontend que ainda chama o Supabase (desativado) ou edge functions que não
existem mais — o código-fonte delas está preservado em `supabase/functions/` e deve ser
**portado** para rotas Express em `backend/src/routes/`, não reescrito do zero.

Chaves de API legadas: `keys.txt` (raiz, git-ignored). Ao usar uma chave, mover para `.env`
(somente backend — nunca expor secret via `VITE_*`).

---

## Fase 0 — Diagnóstico e infraestrutura ✅ CONCLUÍDA (2026-07-13)

Resultados: as 4 chaves de clima/rota do `keys.txt` estão **válidas** e foram movidas
para `.env` + `docker-compose.yml` + `.env.example` (`TOMORROW_API_KEY`,
`OPENROUTE_API_KEY`, `NASA_API_KEY`, `METEOSTAT_RAPIDAPI_KEY`). Inventário completo em
`docs/inventario-supabase-onda2.md` (139 chamadas from/rpc, 14 invokes, 3 arquivos
realtime; tabelas faltantes têm DDL em `supabase/migrations/`). Imagens de referência
extraídas em `docs/referencias-onda2/` (fatura premium: `fatura-premium-ref-0[1-3].jpg`).

Escopo original:

1. **Inventário Supabase**: mapear todo `supabase.from(...)`, `functions.invoke(...)` e
   `channel(...)` nos módulos afetados (hooks: 32 arquivos; financial, confronto, profit,
   accounting, dashboard, service-orders, billing).
2. **Validar chaves do `keys.txt`** com curl (Tomorrow.io, Meteostat/RapidAPI, NASA,
   OpenRoute): descobrir cedo o que expirou para pedir chave nova com antecedência.
   Mover as válidas que serão usadas para `.env`.
3. **Padrão de proxy**: toda API externa com secret passa pelo backend
   (ex.: `/api/weather/*`, `/api/route/*`).
4. Extrair as imagens de referência do PDF (págs. 16–18: modelo premium de fatura;
   pág. 3–5, 9, 13, 22–24: screenshots dos bugs) — instalar `poppler-utils` ou extrair
   via `pdfjs-dist`.

## Fase 1 — Ordens de Serviço ✅ CONCLUÍDA (2026-07-13)

Entregue: model `Platform` + rota `/api/platforms`; `usePlatforms.ts` em REST;
update/delete inline da tabela de OS em REST (PATCH parcial); combos preservam
cliente/técnico atuais (resolução por nome para OS vindas de OCR); exclusão anual via
`DELETE /api/service-orders/by-year/:year`. Containers recompilados e rotas testadas.

Escopo original (3 bugs, prioridade máxima — operação diária):

Backend `backend/src/routes/serviceOrders.ts` já existe; trabalho majoritariamente de
ligação frontend↔backend.

| Bug | Sintoma | Causa provável | Correção |
|---|---|---|---|
| 01 | Toggle de plataforma dá `Failed to fetch` | Chamada a endpoint Supabase inexistente | Criar/usar rota REST de update de plataforma; atualizar o componente (`src/components/platform`, `service-orders`) |
| 02 | Edição apaga Cliente/Técnico e combos vazios | Combos ainda buscam opções no Supabase; valor atual não é pré-selecionado | Carregar clientes + membros via REST (`useAssignableUsers` já migrado — reutilizar padrão); pré-selecionar valores existentes |
| 03 | Alterações não salvam | Persistência ainda via Supabase | PATCH na rota `serviceOrders`; invalidar caches (React Query) para refletir em Produção e módulos relacionados |

**Critério de aceite**: editar OS mantém cliente/técnico, salva, sobrevive a refresh e
reflete em Produção.

## Fase 2 — Financeiro ✅ CONCLUÍDA (2026-07-13)

Entregue: tabelas novas no Postgres via Prisma (`financial_records`, `reconciliations`,
`profit_rules`/`profit_rule_items`, `service_order_distributions`, `financial_events`,
`financial_integrity_issues`/`_snapshots`); rotas `/api/finance/*` (confronto, motor de
reconciliação portado da edge function `run-reconciliation`, regras de lucro transacionais
com snapshot imutável, participação derivada dos snapshots, timeline de auditoria,
verificação de integridade portada da RPC `run_financial_integrity_check`, AI insights) e
`/api/financial-records`; `/api/extract/receipt` portado. Frontend: todos os hooks das abas
(Confronto, Distribution, Détail, Participation, Audit, Intégrité, Comptabilité) migrados
para `apiRequest()` com timeout — sem loading infinito. Rotas testadas com dados reais
(5 OS × 30 OP → 35 reconciliações inseridas). Pendências conhecidas: espelho de
combustível na Comptabilité retorna vazio até a migração da Frota (fora da onda 2);
sino de alertas usa `useNotifications` (Supabase, app-wide) e fica vazio até migrar
notificações; diffs de participação (aba Audit) retornam lista vazia (camada de revisões
do ledger não portada).

Escopo original — Abas em loading infinito: Confrontation OS x OP, Distribution des bénéfices, Détail,
Participation, Audit, Intégrité (só Comptabilité abre). Loading infinito = queries Supabase
que nunca resolvem.

1. Inventariar, por aba, quais tabelas/RPCs/functions ela consumia.
2. Portar a lógica das edge functions preservadas: `detect-discrepancies`,
   `run-reconciliation`, `financial-ai-insights` → rotas agregadas no backend
   (ex.: `/api/finance/confrontation`, `/api/finance/distribution`, `/api/finance/detail`,
   `/api/finance/audit`, `/api/finance/integrity`).
3. Migrar os hooks do frontend para `apiRequest()`; adicionar timeout + estado de erro
   (nunca mais loading infinito silencioso).
4. Motor Confrontation OS x OP: comparar OS criadas × OP importadas (previsto × recebido,
   não pagos, divergências) com alertas automáticos — as rotas `serviceOrders` e
   `paymentOrders` já fornecem os dados de entrada.

**Critério de aceite**: todas as abas abrem, carregam dados reais de OS/OP/Contabilidade
ou mostram erro claro.

## Fase 3 — Faturas (4 bugs)

| Bug | Trabalho |
|---|---|
| 01 Vinculação de listas | Endpoint que lista as listas de OP/Produção com filtros (cliente, técnico, ano, semana, OP); seleção preenche a fatura (nome L0xxxxx); cobrir também o fluxo de fatura importada via OCR |
| 02 Dados bancários bloqueados | Persistir configuração do workspace (IBAN, BIC/SWIFT, banco, dados da empresa) no Postgres; desbloquear a UI; reutilizar automaticamente nas próximas faturas |
| 03 Personalização bloqueada | Persistir template padrão: logotipo (MinIO), layout, idioma, seções visíveis, campos |
| 04 Fatura premium | Redesign do PDF gerado seguindo as imagens de referência (págs. 16–18 do PDF); portar/evoluir `generate-invoice-pdf` (edge function preservada); `jspdf`/`pdf-lib` já estão no projeto |

**Ordem interna**: 02 → 03 → 01 → 04 (o design final consome dados bancários e template).

## Fase 4 — Radar de Granizo / PDR (2 bugs)

Interface, mapa e filtros existem; os dados pararam porque a ingestão rodava na edge
function `ingest-hail` (Tomorrow.io) e `calculate-route` (OpenRouteService) — ambas
preservadas no repo, com chaves correspondentes no `keys.txt`.

1. Portar `ingest-hail` para o backend + job agendado (cron/worker) para ingestão contínua.
2. Criar `/api/weather/*` e `/api/route/*` como proxies; mover `TOMORROW_APIKEY` e
   `OPEN_ROUTE` para `.env` (validadas na Fase 0).
3. Reconectar providers do frontend (`src/lib/providers/weather/`: MeteoAlarm e NOAA são
   gratuitos/sem chave — verificar se ainda respondem) e o fluxo
   eventos → `OperationalEventBus` → mapa/stream.
4. Motor de oportunidades: cruzar eventos × clientes × equipes × OS (dados já migrados)
   para gerar oportunidades com região, prioridade, distância das equipes.
5. Corrigir estilo do mapa: oceano/rios aparecem pretos → tema/tiles do mapa
   (`src/components/dashboard/OperationalMap.tsx` / `ActiveMap.tsx`).

**Critério de aceite**: eventos de granizo aparecem no mapa com severidade/estado,
oportunidades são geradas automaticamente, oceano na cor original.

## Fase 5 — Integração Stripe na VPS (do orçamento onda 2: STR-01 a STR-04)

O código de billing já existe (`backend/src/routes/billing.ts`, `billingOperations.ts`;
compose já repassa `STRIPE_SANDBOX_API_KEY`, `STRIPE_LIVE_API_KEY`,
`STRIPE_WEBHOOK_SECRET`, portal URLs). O trabalho é de configuração + validação:

1. **STR-01** — Configurar variáveis de ambiente e chaves Stripe no `.env` (chaves test
   disponíveis no `keys.txt`; live keys a obter com o usuário) + rebuild do frontend
   (`VITE_PAYMENTS_CLIENT_TOKEN`).
2. **STR-02** — Atualizar o webhook no Dashboard Stripe para o endpoint da VPS
   (`https://operix-pro.com/api/...`) e registrar o novo `STRIPE_WEBHOOK_SECRET`.
3. **STR-03** — Verificar/criar Products & Prices (lookup_keys esperados pelo código) e
   configurar o Customer Portal.
4. **STR-04** — Testes end-to-end em sandbox: checkout, recebimento de webhook,
   portal do cliente e cancelamento.

**Critério de aceite**: assinatura de teste completa em sandbox — checkout → webhook
processado → assinatura ativa no sistema → cancelamento refletido.

---

## Riscos e pendências

- **Chaves expiradas**: qualquer chave inválida do `keys.txt` precisa ser renovada pelo
  usuário — por isso a validação está na Fase 0.
- **Regras de negócio do Financeiro**: se alguma regra de cálculo não estiver nas edge
  functions preservadas nem no frontend, será preciso confirmar com o usuário.
- **Realtime**: `RealtimeHub.ts` ainda aponta para Supabase; radar e dashboards que
  dependiam de realtime precisarão de polling ou WebSocket próprio (decidir na Fase 4).
- **Stripe**: chaves em `keys.txt` são de modo test — suficientes para o sandbox da
  Fase 5; chaves live e acesso ao Dashboard Stripe serão necessários para ativar em
  produção (STR-02 exige ação no Dashboard).

## Sequência sugerida

Fase 0 ✅ → Fase 1 ✅ → Fase 2 ✅ → Fase 3 (2–4 dias) → Fase 4 (3–5 dias) → Fase 5 (1–2 dias).
As fases 3, 4 e 5 são independentes entre si e podem ser reordenadas conforme a urgência.
