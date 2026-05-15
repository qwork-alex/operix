# Fase 1 — Rearquitetura do Motor Climático-Operacional

Plataforma climática operacional modular, estável e viva. Sem efeito "dashboard bonito": núcleo de decisão real, layers apenas renderizam, tudo escalável para Command Center multi-monitor.

## Princípios travados

1. **Single source of truth**: um `WeatherEventEngine` consolida radar, hail, reports, forecasts e estado temporal. Layers nunca decidem lógica — apenas leem snapshots normalizados e desenham.
2. **Mapa imperativo, não reativo**: o componente React do mapa monta uma vez. Atualizações vão por refs + APIs MapLibre (`setData`, `setPaintProperty`, `setTiles`). Zero re-render React por frame.
3. **Hail engine operacional**: cada célula tem direção, velocidade, intensidade, derivada (crescendo/perdendo), ETA por cidade, raio de impacto, score operacional.
4. **PDR Intel = motor de decisão**: ranking ponderado de oportunidades, não heatmap decorativo.
5. **Cartografia cinematográfica**: hierarquia oceano → país → região → cidade → vila com glow controlado e labels refinadas.
6. **Timeline premium**: scrub suave, autoplay, velocidades, ghost trails.
7. **Pronto para Command Center**: fullscreen, auto-cycling, auto-focus em severos, alertas sonoros, dispatch mode — arquitetura preparada desde já.
8. **Higiene de GPU**: cleanup rigoroso, FPS/memory monitor, anti-thrashing.
9. **Prioridade**: estabilidade > fidelidade > fluidez > inteligência > arquitetura. Features novas depois.
10. **Validação cruzada**: cada PR comparado a Windy / RainViewer / Zoom Earth / RadarScope antes de fechar.

## Arquitetura alvo

```text
src/components/dashboard/operational-map/
├── OperationalMap.tsx          // shell React (monta 1x), error boundary, controles
├── core/
│   ├── MapEngine.ts            // init MapLibre, WebGL probe, retry, lifecycle
│   ├── LayerRegistry.ts        // mount/unmount/visibility isolados, ordem estável
│   ├── TemporalEngine.ts       // clock global rAF, frames, interpolação, playback
│   ├── safeOps.ts              // setData/setPaintProperty seguros
│   ├── PerfMonitor.ts          // FPS, drawCalls, memória, tile thrashing
│   └── CommandBus.ts           // eventos: focus(event), alert(severity), dispatch(team→event)
├── engine/
│   ├── WeatherEventEngine.ts   // SOURCE OF TRUTH — consolida tudo, emite snapshots
│   ├── HailEngine.ts           // direção, velocidade, derivada, ETA, raio, score
│   ├── ConfidenceEngine.ts     // score meteorológico + comunitário
│   ├── PdrDecisionEngine.ts    // ranking operacional ponderado
│   └── ForecastEngine.ts       // hotspots futuros, probabilidade
├── data/
│   ├── useRadarFrames.ts
│   ├── useHailIngest.ts
│   ├── useCommunityReports.ts  // realtime
│   ├── useOrdersGeo.ts
│   ├── useTeamsGeo.ts
│   └── useCityIndex.ts         // catálogo de cidades p/ ETA
├── layers/
│   ├── radarLayer.ts
│   ├── hailForecastLayer.ts
│   ├── hailActiveLayer.ts      // inclui ghost trail
│   ├── hailConfirmedLayer.ts
│   ├── stormLayer.ts
│   ├── ordersLayer.ts
│   ├── operationsLayer.ts
│   ├── teamsLayer.ts
│   ├── pdrIntelLayer.ts
│   └── reportsLayer.ts
├── ui/
│   ├── LayerToggleBar.tsx
│   ├── MapLegend.tsx
│   ├── TimelineControl.tsx     // scrub, play, 0.5x/1x/2x/4x, replay
│   ├── HailReportButton.tsx
│   ├── OpportunityRanking.tsx  // saída do PdrDecisionEngine
│   ├── DiagnosticBadge.tsx     // provider, frames, FPS, mem, layers
│   └── CommandCenterShell.tsx  // fullscreen, auto-cycle, auto-focus
└── style/
    └── premiumDark.ts          // oceano gradiente, fronteiras hierárquicas, halos
```

### Contratos

```ts
// SOURCE OF TRUTH — emite snapshots imutáveis
interface WeatherSnapshot {
  t: number;                    // tempo do clock
  radar: RadarFrame[];
  hail: HailCell[];             // já enriquecidas pela HailEngine
  reports: CommunityReport[];   // já com confidence
  forecast: ForecastHotspot[];
  opportunities: Opportunity[]; // já rankeadas
}
class WeatherEventEngine {
  subscribe(fn: (snap: WeatherSnapshot) => void): Unsubscribe;
  setTime(t: number): void;
  current(): WeatherSnapshot;
}

// LAYER — só renderiza, recebe slice do snapshot
interface MapLayer<K extends keyof WeatherSnapshot> {
  id: string;
  category: LayerCategory;
  select(snap: WeatherSnapshot): WeatherSnapshot[K];
  mount(map: Map): void;
  unmount(map: Map): void;
  apply(slice: WeatherSnapshot[K], t: number): void;  // imperativo
  setVisible(v: boolean): void;
}
```

### HailCell enriquecida

```ts
interface HailCell {
  id: string;
  lat: number; lng: number;
  velocityKts: number;          // intensidade meteorológica
  bearingDeg: number;           // direção
  speedKmh: number;             // deslocamento
  derivative: "growing" | "steady" | "decaying";
  radiusKm: number;
  hailSizeMm: number | null;
  severity: Severity;
  status: "forecast" | "active" | "confirmed";
  etaToCities: Array<{ cityId: string; eta: number; distanceKm: number }>;
  operationalScore: number;     // 0..100, alimenta PDR
  trail: Array<{ t: number; lat: number; lng: number }>; // ghost
}
```

### PdrDecisionEngine — ranking ponderado

Score = soma normalizada de:
- severidade climática (peso 0.25)
- demanda prevista da região (0.20)
- densidade de veículos / renda média (0.15)
- distância das equipes disponíveis (0.15)
- trânsito estimado (0.05)
- histórico de conversão da região (0.10)
- potencial financeiro (ticket médio × volume) (0.10)

Saída: `Opportunity[]` ordenada, com breakdown por fator (explicabilidade) → exibido no painel atual `OperationalOpportunities`.

## Estilo cartográfico (premiumDark.ts)

- **Oceano**: gradiente radial `#06223f` centro → `#0a2e55` borda, leve textura via raster overlay opacidade 0.04.
- **Países**: linha `#3aa0ff` α0.35, `line-blur 1.2`, halo via duplicate layer α0.12 width×3.
- **Regiões**: `#a78bfa` α0.22.
- **Cidades**: label `#e6f2ff`, `text-halo-color #0b1f3d`, `text-halo-blur 1.5`, weight por população.
- **Vilas**: `#9fb3c8`, halo 0.8.
- **Hierarquia por zoom**: cada nível aparece em range definido para evitar poluição.

## Timeline premium (TemporalEngine + TimelineControl)

- Clock global em rAF, `t ∈ [t0, t1]`.
- Frames discretos (radar, hail) + interpolação contínua (posição de células ativas, opacidade de fade).
- Controles: scrub, play/pause, 0.5x/1x/2x/4x, replay, "live".
- Ghost trail: layer dedicada com últimos N pontos da `HailCell.trail`, opacidade decrescente.
- Throttling adaptativo: se FPS < 30, reduz frequência de interpolação.

## Command Center (preparação)

- `CommandCenterShell` envolve o mapa quando `?mode=command`.
- Hooks expostos: `focusEvent(id)`, `cycleEvents(intervalMs)`, `onSeverityAlert(cb)`.
- `CommandBus` desacopla UI de motor → futuro dispatch automático e WhatsApp/push só assinam o bus.

## Performance & GPU

- `PerfMonitor`: FPS rolling avg, JS heap (quando disponível), tiles em vôo, layers montadas.
- Diff hash em `setData` para evitar upload redundante à GPU.
- Cleanup contratual: `unmount` remove sources + layers + listeners + intervals + rAF.
- Detector de "tile thrashing": se mesma URL pedida >3x em 5s, pausa playback.
- Lazy mount: layer só sobe na primeira ativação.

## Mudanças de banco

- `hail_reports`: adicionar `photo_thumb_url text`.
- Nova tabela `hail_report_confirmations(id, report_id, user_id, created_at)` + RLS.
- Trigger `recompute_hail_confidence()` recalcula `confidence_score` e `status` no insert/delete.
- Catálogo `weather_cities(id, name, country, lat, lng, population)` para ETA (seed PT/FR/ES).

## Pipeline "Relatar Granizo" v2

Compressão client-side (canvas → webp 1024px q0.8) + thumbnail (256px q0.7) → upload para `hail-reports/full/` e `hail-reports/thumbs/` → `photo_url` + `photo_thumb_url` persistidos → preview no dialog → popup do mapa usa thumb → clique abre modal expandido.

## Roadmap incremental (PRs pequenos, sem regressão)

| PR | Escopo | Critério de pronto |
|----|--------|--------------------|
| PR1 | Scaffold pasta + `MapEngine` + `LayerRegistry` + `TemporalEngine` + `safeOps` + `PerfMonitor` stub. `OperationalMap` continua funcional, delega init. | Mapa abre, FPS visível, nada quebrou |
| PR2 | `WeatherEventEngine` + migração de radar e hail (forecast/active/confirmed) para layers isoladas | Paridade visual com hoje, eventos > 0 |
| PR3 | `HailEngine` enriquecido (direção, velocidade, ETA, score) + ghost trail | Células se movem com vetor real |
| PR4 | Migrar orders/ops/teams/pdr/reports → toggles funcionais | Cada botão liga/desliga sem efeito colateral |
| PR5 | `PdrDecisionEngine` + ranking explicável no painel | Top-5 com breakdown de fatores |
| PR6 | `TimelineControl` premium (scrub, velocidades, replay) | Comparação Windy/RainViewer aprovada |
| PR7 | Relatar granizo v2 (compressão, thumb, preview, modal) + `ConfidenceEngine` + trigger SQL | Foto carrega, score atualiza ao confirmar |
| PR8 | `premiumDark.ts` (oceano, fronteiras, labels, halos) | Comparação Zoom Earth aprovada |
| PR9 | `CommandCenterShell` + `CommandBus` + auto-focus/auto-cycle | `?mode=command` funcional em fullscreen |
| PR10 | Performance pass final + memory diagnostics + anti-thrashing | 60 FPS sustentados com 200+ eventos |

Cada PR fecha com checklist visual lado-a-lado contra Windy/RainViewer/Zoom Earth/RadarScope.

## Fora desta fase

- Provedores meteorológicos pagos (continua RainViewer + ingest atual).
- IA preditiva avançada e dispatch automático real (arquitetura preparada via `CommandBus`).
- WhatsApp/push/email (assinarão o bus depois).

## Riscos e mitigações

- **Regressão visual durante migração** → PRs pequenos + screenshots comparativos.
- **GPU pressure no playback** → throttle adaptativo + tile diff hash.
- **Drift entre engine e layer** → snapshots imutáveis, layers stateless.
- **Layers órfãs em HMR** → `LayerRegistry` mantém inventário e força cleanup no dispose.
