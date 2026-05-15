# Fase 1 — Rearquitetura do Motor Climático-Operacional

Objetivo: transformar o `OperationalMap` monolítico numa plataforma modular, estável e viva, sem perder funcionalidades já entregues (radar animado, granizo, PDR, oportunidades, relatos comunitários).

## Diagnóstico atual

- `OperationalMap.tsx` concentra: estilo do mapa, fetch de providers, parser meteorológico, layers (radar/granizo/PDR/operações/equipes/relatos), animação temporal, estado de UI, interações.
- Cada nova feature reescreve parcialmente as outras → regressões em ordens/operações/PDR.
- Eventos de granizo às vezes ficam em zero porque o parser e o ingest competem com camadas visuais.
- Relatar granizo: upload existe mas preview/thumb quebram.
- Visual cartográfico: oceano cinza, fronteiras sem hierarquia.

## Arquitetura alvo

```text
src/components/dashboard/operational-map/
├── OperationalMap.tsx          // shell: container, error boundary, controles
├── core/
│   ├── MapEngine.ts            // init MapLibre, WebGL probe, style, retry, lifecycle
│   ├── LayerRegistry.ts        // registra/ativa/desativa layers de forma isolada
│   ├── TemporalEngine.ts       // clock global, frames, interpolação, playback
│   └── safeSetData.ts          // helpers seguros (já existe inline)
├── layers/
│   ├── radarLayer.ts
│   ├── hailForecastLayer.ts    // previsão
│   ├── hailActiveLayer.ts      // ativo
│   ├── hailConfirmedLayer.ts   // confirmado + relatos comunitários
│   ├── stormLayer.ts
│   ├── ordersLayer.ts
│   ├── operationsLayer.ts      // zonas/cobertura
│   ├── teamsLayer.ts
│   ├── pdrIntelLayer.ts        // heatmap de oportunidades
│   └── reportsLayer.ts
├── data/
│   ├── useHailEvents.ts        // forecast/active/confirmed normalizados
│   ├── useRadarFrames.ts       // RainViewer
│   ├── useOrdersGeo.ts
│   ├── useTeamsGeo.ts
│   └── useCommunityReports.ts  // hail_reports + realtime
├── intel/
│   ├── confidenceEngine.ts     // score: meteorológico + comunitário
│   └── opportunityEngine.ts    // já existe em OperationalOpportunities
├── ui/
│   ├── LayerToggleBar.tsx      // botões: Radar/Granizo/Ordens/Operações/PDR…
│   ├── MapLegend.tsx
│   ├── TimelineControl.tsx     // playback + scrubber
│   ├── HailReportButton.tsx
│   └── DiagnosticBadge.tsx
└── style/
    └── premiumDark.ts          // estilo cartográfico premium (oceano/fronteiras/texto)
```

Cada layer expõe um contrato uniforme:

```ts
interface MapLayer<T = unknown> {
  id: string;
  category: "radar" | "hail" | "orders" | "ops" | "teams" | "pdr" | "reports";
  mount(map: Map): void;        // cria sources + layers, idempotente
  unmount(map: Map): void;      // remove sem afetar outros
  update(data: T): void;        // setData seguro
  setVisible(v: boolean): void;
  onTick?(t: number): void;     // chamado pelo TemporalEngine
}
```

`LayerRegistry` garante:
- mount/unmount idempotente,
- isolamento de erros (try/catch por layer),
- ordem de empilhamento estável (radar abaixo, intel acima),
- toggle não destrói estado dos outros.

## Entregas por bloco

### 1. Camadas independentes
- Extrair cada bloco do `OperationalMap` para arquivos em `layers/`.
- `LayerRegistry` substitui os `addSource/addLayer` espalhados.
- Botões da toolbar passam a chamar `registry.toggle(category)`.

### 2. Motor de eventos restaurado
- `useHailEvents` consolida 3 streams: `forecast`, `active`, `confirmed`.
- Parser normaliza severidade, tamanho mm, raio, status, probabilidade.
- Edge function `ingest-hail` permanece; o cliente passa a filtrar/derivar localmente sem perder dados.
- Garantir que mesmo sem provider pago, mocks/seed do RainViewer + relatos gerem eventos visíveis.

### 3. Funcionalidades originais
- Forecast: hotspots com halo pulsante + probabilidade.
- Ativo: células em deslocamento (vetor + trail).
- Confirmado: ocorrências + relatos comunitários com foto.
- PDR Intel: heatmap derivado de `computeOpportunities` (já existe).

### 4. Botões funcionais
- Toolbar única (`LayerToggleBar`) com estado persistido em `useState` + localStorage.
- Cada botão → `registry.toggle("orders" | "ops" | "pdr" | …)`.
- Ordens: clusters por status/prioridade.
- Operações: zonas (turf buffer das equipes) + capacidade.

### 5. Motor temporal real
- `TemporalEngine` com `requestAnimationFrame`, clock 0..1 entre frames.
- Radar: troca de tiles + `raster-fade-duration` já implementado, agora com scrubber e play/pause.
- Hail ativo: interpolação linear de posição entre frames consecutivos.
- TimelineControl visível na base do mapa.

### 6. Relatar granizo — pipeline completo
- Compressão client-side (canvas → webp ~1024px, q=0.8).
- Geração de thumbnail (256px) salvo em `hail-reports/thumbs/`.
- Preview no dialog antes do envio.
- Tooltip no popup do mapa com thumbnail; clique abre modal expandido.
- Persistir `photo_thumb_url` em `hail_reports`.

### 7. Confiança comunitária
- `confidenceEngine.ts`:
  - base 0.2
  - +0.3 se foto
  - +0.15 por cada confirmação adicional (cap 0.6)
  - +0.2 se há radar/storm cell no raio de 15 km nos últimos 60 min
- Status derivado: `partial` < 0.5, `confirmed` ≥ 0.5, `validated` ≥ 0.85.
- Coluna `corroboration_count` já existe; adicionar trigger para recomputar `confidence_score` e `status` ao inserir confirmações.

### 8. Visual cartográfico premium
- `premiumDark.ts` aplica overrides ao estilo CARTO:
  - oceano: gradiente `#06223f → #0a2e55`
  - fronteiras país: `#3aa0ff` α0.35 + glow
  - regiões: `#a78bfa` α0.25
  - cidades: `#e6f2ff`, halo azul
  - vilas: `#9fb3c8`
- Labels com `text-halo-color` e `text-halo-blur` para glow sutil.

### 9. Performance
- `useMemo` em GeoJSON pesados.
- Layers lazy: só `mount` quando ativadas pela primeira vez.
- Diff em `setData` (hash simples) para evitar re-uploads à GPU.
- `requestIdleCallback` para parsers não-críticos.

### 10. Padrão de qualidade
- ErrorBoundary por categoria de layer.
- Diagnostic badge mostra: provider, frames, layers ativas, último sync, FPS.
- Smoke test manual: ativar/desativar cada layer N vezes sem crash.

## Estratégia de execução (incremental, sem regressão)

1. **PR1 — Scaffold**: criar pasta `operational-map/`, `MapEngine`, `LayerRegistry`, `TemporalEngine`, `premiumDark`. `OperationalMap.tsx` continua funcionando, apenas delega init ao `MapEngine`.
2. **PR2 — Migrar layers radar + hail**: mover para `layers/`, toolbar plugada no registry. Validar paridade visual.
3. **PR3 — Migrar orders/ops/teams/pdr/reports**: cada botão volta a funcionar.
4. **PR4 — TemporalEngine + TimelineControl**: scrubber + interpolação.
5. **PR5 — Relatar granizo v2**: compressão, thumb, preview, popup expandido.
6. **PR6 — Confidence engine + trigger SQL**.
7. **PR7 — Visual premium cartográfico**.
8. **PR8 — Performance pass + diagnostic badge final**.

Cada PR mantém o app rodando; nada é removido antes do substituto estar verde.

## Mudanças de banco previstas

- `hail_reports`: adicionar `photo_thumb_url text`, `confidence_score` recomputado por trigger.
- Nova tabela `hail_report_confirmations (id, report_id, user_id, created_at)` com RLS (insert por authenticated, select público).
- Trigger `recompute_hail_confidence()` atualiza `confidence_score` e `status` no insert/delete de confirmações.

## O que NÃO entra nesta fase

- Provedores meteorológicos pagos (mantemos RainViewer + ingest atual).
- IA preditiva / dispatch automático (arquitetura preparada, implementação depois).
- WhatsApp/push/email (planejado, não construído agora).

## Riscos

- Migração das layers pode esconder regressões visuais pontuais → mitigado por PRs pequenos com validação visual.
- TemporalEngine pode aumentar uso de GPU → throttling adaptativo conforme FPS.
