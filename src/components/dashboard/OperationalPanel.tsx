import { useMemo, useState, useEffect } from "react";
import {
  X, AlertTriangle, Wind, Clock, Gauge, Radar, Zap, Users, FileText,
  Activity, Maximize2, Minimize2, Shrink, MapPin, Shield, Radio, CheckCircle2, Eye, CloudRain,
} from "lucide-react";

/* ---------- Shared types (kept in sync with OperationalMap) ---------- */
const HAIL_COLORS = {
  low: "#eab308", moderate: "#f97316", severe: "#ef4444", extreme: "#a855f7",
} as const;
type HailSeverity = keyof typeof HAIL_COLORS;
type HailStatus = "forecast" | "ongoing" | "confirmed" | "closed";

export interface PanelHailEvent {
  id: string;
  source: string;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number;
  lng: number;
  radius_km: number;
  severity: HailSeverity;
  status: HailStatus;
  hail_size_mm: number | null;
  probability: number | null;
  intensity: number | null;
  storm_speed_kmh: number | null;
  storm_direction_deg: number | null;
  forecast_time: string | null;
  observed_time: string | null;
  expires_at: string | null;
  is_demo: boolean;
  metadata?: Record<string, any> | null;
}

export interface PanelTeam { lat: number; lng: number; city?: string; when?: string; }
export interface PanelOrder {
  id: string; city?: string; platform?: string; plate?: string; status?: string;
  lat: number; lng: number;
}

const STATUS_LABEL: Record<HailStatus, string> = {
  forecast: "Monitorando", ongoing: "Em andamento", confirmed: "Confirmado", closed: "Encerrado",
};
const SEVERITY_LABEL: Record<HailSeverity, string> = {
  low: "Baixo risco", moderate: "Moderado", severe: "Severo", extreme: "Extremo",
};
const STATUS_DOT: Record<HailStatus, string> = {
  forecast: "bg-amber-400 animate-pulse",
  ongoing: "bg-orange-500 animate-pulse",
  confirmed: "bg-red-500 animate-pulse",
  closed: "bg-zinc-500",
};

/* ---------- Geo helpers ---------- */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180;
  const la2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

/* ---------- Sizing modes ---------- */
type Mode = "compact" | "medium" | "fullscreen";

export interface PanelHailReport {
  id: string;
  severity?: string;
  status?: string;
  hail_size_mm?: number | null;
  photo_url?: string | null;
  observed_at?: string | null;
  notes?: string | null;
  confidence_score?: number | null;
}

export function OperationalPanel({
  event,
  teams,
  orders,
  reports = [],
  onClose,
}: {
  event: PanelHailEvent;
  teams: PanelTeam[];
  orders: PanelOrder[];
  reports?: PanelHailReport[];
  onClose: () => void;
}) {
  const color = HAIL_COLORS[event.severity];
  const [mode, setMode] = useState<Mode>("medium");

  // ESC closes / collapses fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mode === "fullscreen") setMode("medium");
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, onClose]);

  /* ---- nearby compute (impact radius = max(radius_km, 80)) ---- */
  const RADIUS = Math.max(event.radius_km || 0, 80);
  const center = { lat: event.lat, lng: event.lng };

  const nearbyTeams = useMemo(() => {
    return teams
      .map((t) => ({ ...t, dist: haversineKm(center, t) }))
      .filter((t) => t.dist <= RADIUS)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 8);
  }, [teams, event.id]);

  const nearbyOrders = useMemo(() => {
    return orders
      .map((o) => ({ ...o, dist: haversineKm(center, o) }))
      .filter((o) => o.dist <= RADIUS)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 12);
  }, [orders, event.id]);

  const openOrders = nearbyOrders.filter((o) =>
    /(progress|andamento|aberta|open)/i.test(o.status || "")
  );
  const regionsCovered = new Set(nearbyOrders.map((o) => o.city).filter(Boolean)).size;
  const capacity = Math.max(0, Math.min(100, Math.round(
    (nearbyTeams.length * 25) - (openOrders.length * 8)
  )));
  const capacityTone =
    capacity >= 70 ? "#22c55e" : capacity >= 40 ? "#eab308" : "#ef4444";

  /* ---- timeline events ---- */
  const timeline = useMemo(() => {
    const items: { time: string | null; label: string; tone: string; done: boolean }[] = [
      { time: event.forecast_time, label: "Previsão emitida", tone: "#eab308", done: !!event.forecast_time },
      { time: event.observed_time, label: "Observação confirmada", tone: "#f97316", done: !!event.observed_time },
      { time: event.status === "closed" ? event.expires_at : null, label: "Evento encerrado", tone: "#64748b", done: event.status === "closed" },
      { time: event.expires_at, label: "Expiração prevista", tone: color, done: false },
    ];
    return items;
  }, [event, color]);

  /* ---- container chrome by mode ---- */
  const wrapperClass =
    mode === "fullscreen"
      ? "fixed inset-0 z-50 m-0 rounded-none animate-fade-in border"
      : "mt-4 rounded-xl animate-fade-in border relative";
  const innerPad = mode === "compact" ? "p-3" : "p-4";

  return (
    <div
      className={wrapperClass}
      style={{
        background: mode === "fullscreen"
          ? "linear-gradient(135deg, rgba(8,12,22,0.98), rgba(15,23,42,0.96))"
          : "linear-gradient(135deg, rgba(15,23,42,0.85), rgba(15,23,42,0.6))",
        borderColor: `${color}55`,
        boxShadow: `0 0 28px ${color}33, inset 0 0 1px ${color}66`,
        backdropFilter: "blur(10px)",
      }}
    >
      <div className={`${innerPad} relative h-full overflow-auto`}>
        {/* ---- Top bar ---- */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: `${color}22`,
              border: `1px solid ${color}66`,
              boxShadow: `0 0 14px ${color}55`,
            }}
          >
            <AlertTriangle className="h-5 w-5" style={{ color }} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-semibold text-foreground truncate">
                {event.city || "—"}
                {event.region ? `, ${event.region}` : ""}
                {event.country ? ` · ${event.country}` : ""}
              </h4>
              {event.is_demo && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-300">DEMO</span>
              )}
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground uppercase tracking-wider">
                Centro de Comando
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px] flex-wrap">
              <span className="flex items-center gap-1.5" style={{ color }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                {SEVERITY_LABEL[event.severity]}
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[event.status]}`} />
                {STATUS_LABEL[event.status]}
              </span>
              <span className="text-muted-foreground/70 flex items-center gap-1">
                <Radio className="h-3 w-3" /> {event.source}
              </span>
            </div>
          </div>

          {/* ---- Mode controls ---- */}
          <div className="flex items-center gap-1 shrink-0">
            <ModeBtn active={mode === "compact"} onClick={() => setMode("compact")} title="Compacto">
              <Shrink className="h-3.5 w-3.5" />
            </ModeBtn>
            <ModeBtn active={mode === "medium"} onClick={() => setMode("medium")} title="Médio">
              <Minimize2 className="h-3.5 w-3.5" />
            </ModeBtn>
            <ModeBtn active={mode === "fullscreen"} onClick={() => setMode("fullscreen")} title="Tela cheia">
              <Maximize2 className="h-3.5 w-3.5" />
            </ModeBtn>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground transition"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ---- Compact: just KPI strip ---- */}
        {mode === "compact" ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Metric icon={<Gauge className="h-3 w-3" />} label="Granizo" value={event.hail_size_mm ? `${event.hail_size_mm} mm` : "—"} />
            <Metric icon={<AlertTriangle className="h-3 w-3" />} label="Probab." value={event.probability != null ? `${Math.round(event.probability * 100)}%` : "—"} />
            <Metric icon={<Users className="h-3 w-3" />} label="Equipes" value={String(nearbyTeams.length)} />
            <Metric icon={<FileText className="h-3 w-3" />} label="Ordens" value={String(openOrders.length)} />
          </div>
        ) : (
          <>
            {/* ---- Section: Meteorological ---- */}
            <SectionTitle icon={<Eye className="h-3.5 w-3.5" style={{ color }} />}>
              Informações meteorológicas
            </SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <Metric icon={<Gauge className="h-3 w-3" />} label="Tamanho est." value={event.hail_size_mm ? `${event.hail_size_mm} mm` : "—"} accent={color} />
              <Metric icon={<AlertTriangle className="h-3 w-3" />} label="Probabilidade" value={event.probability != null ? `${Math.round(event.probability * 100)}%` : "—"} accent={color} />
              <Metric icon={<Zap className="h-3 w-3" />} label="Intensidade" value={event.intensity != null ? `${Math.round(event.intensity)}/100` : "—"} accent={color} />
              <Metric icon={<Wind className="h-3 w-3" />} label="Velocidade" value={event.storm_speed_kmh ? `${event.storm_speed_kmh} km/h` : "—"} />
              <Metric icon={<Clock className="h-3 w-3" />} label="Previsto" value={fmtTime(event.forecast_time)} />
              <Metric icon={<Clock className="h-3 w-3" />} label="Observado" value={fmtTime(event.observed_time)} />
              <Metric icon={<Clock className="h-3 w-3" />} label="Expira" value={fmtTime(event.expires_at)} />
              <Metric icon={<Radar className="h-3 w-3" />} label="Raio" value={`${event.radius_km} km`} />
            </div>

            {/* ---- Section: Premium operational intelligence (Phase 5) ---- */}
            <IntelligenceBlock metadata={event.metadata} color={color} />

            {/* ---- Section: Demand forecast (Phase 6) ---- */}
            <DemandBlock metadata={event.metadata} color={color} />

            {/* ---- Section: Operational ---- */}
            <SectionTitle icon={<Activity className="h-3.5 w-3.5 text-cyan-400" />}>
              Inteligência operacional
            </SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <BigMetric label="Técnicos próximos" value={nearbyTeams.length} icon={<Users className="h-4 w-4" />} accent="#22d3ee" />
              <BigMetric label="Ordens abertas" value={openOrders.length} icon={<FileText className="h-4 w-4" />} accent="#a855f7" />
              <BigMetric label="Regiões atendidas" value={regionsCovered} icon={<MapPin className="h-4 w-4" />} accent="#f59e0b" />
              <CapacityCard value={capacity} tone={capacityTone} />
            </div>

            {/* ---- Lists ---- */}
            <div className={`grid gap-3 mb-4 ${mode === "fullscreen" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
              <ListCard
                title="Técnicos próximos"
                icon={<Users className="h-3.5 w-3.5 text-cyan-400" />}
                empty="Nenhum técnico no raio de impacto."
              >
                {nearbyTeams.map((t, i) => (
                  <li key={i} className="flex items-center justify-between text-[11px] py-1 px-2 rounded hover:bg-white/[0.03]">
                    <span className="flex items-center gap-1.5 truncate">
                      <Shield className="h-3 w-3 text-cyan-400/70" />
                      <span className="truncate">{t.city || "Check-in"}</span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">{Math.round(t.dist)} km</span>
                  </li>
                ))}
              </ListCard>

              <ListCard
                title="Ordens na zona"
                icon={<FileText className="h-3.5 w-3.5 text-purple-400" />}
                empty="Nenhuma ordem na zona de impacto."
              >
                {nearbyOrders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between text-[11px] py-1 px-2 rounded hover:bg-white/[0.03]">
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-400/80" />
                      <span className="truncate">{o.city || "—"} · {o.plate || o.platform || ""}</span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">{Math.round(o.dist)} km</span>
                  </li>
                ))}
              </ListCard>
            </div>

            {/* ---- Real community reports (Fase 2) ---- */}
            {reports.length > 0 && (
              <>
                <SectionTitle icon={<CloudRain className="h-3.5 w-3.5 text-red-400" />}>
                  Relatos reais ({reports.length})
                </SectionTitle>
                <div className="mb-4 rounded-lg border border-red-400/20 bg-red-400/[0.04] p-2">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {reports
                      .filter((r) => !!r.photo_url)
                      .slice(0, 8)
                      .map((r) => (
                        <a
                          key={r.id}
                          href={r.photo_url!}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 h-14 w-14 rounded border border-white/10 bg-black/40 overflow-hidden"
                          title={fmtTime(r.observed_at ?? null)}
                        >
                          <img
                            src={r.photo_url!}
                            alt="relato granizo"
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        </a>
                      ))}
                  </div>
                  <ul className="mt-2 space-y-1 max-h-40 overflow-auto">
                    {reports.slice(0, 12).map((r) => {
                      const sev = (r.severity ?? "low") as HailSeverity;
                      const tone = HAIL_COLORS[sev] ?? HAIL_COLORS.low;
                      return (
                        <li key={r.id} className="text-[11px] flex items-start gap-2 px-2 py-1 rounded hover:bg-white/[0.03]">
                          <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full shrink-0" style={{ background: tone }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate">
                                {SEVERITY_LABEL[sev]}
                                {r.hail_size_mm ? ` · ${r.hail_size_mm} mm` : ""}
                              </span>
                              <span className="text-muted-foreground tabular-nums">{fmtTime(r.observed_at ?? null)}</span>
                            </div>
                            {r.notes && (
                              <div className="text-muted-foreground/80 text-[10px] truncate">{r.notes}</div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </>
            )}

            {/* ---- Timeline ---- */}
            <SectionTitle icon={<Clock className="h-3.5 w-3.5 text-amber-400" />}>
              Linha do tempo
            </SectionTitle>
            <ol className="relative border-l border-white/10 ml-2 pl-4 space-y-2">
              {timeline.map((it, i) => (
                <li key={i} className="relative">
                  <span
                    className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-background"
                    style={{ background: it.done ? it.tone : "transparent", borderColor: it.tone, border: `1.5px solid ${it.tone}` }}
                  />
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className={`flex items-center gap-1.5 ${it.done ? "text-foreground" : "text-muted-foreground"}`}>
                      {it.done && <CheckCircle2 className="h-3 w-3" style={{ color: it.tone }} />}
                      {it.label}
                    </span>
                    <span className="text-muted-foreground tabular-nums">{fmtTime(it.time)}</span>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- subcomponents ---------- */

function ModeBtn({
  active, onClick, title, children,
}: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-md transition border"
      style={{
        background: active ? "rgba(255,255,255,0.06)" : "transparent",
        borderColor: active ? "rgba(255,255,255,0.18)" : "transparent",
        color: active ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
      }}
    >
      {children}
    </button>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-2 mt-1">
      {icon}{children}
    </div>
  );
}

function Metric({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div
      className="rounded-lg px-2.5 py-1.5 bg-white/[0.03] border border-white/5 transition hover:bg-white/[0.05]"
      style={accent ? { boxShadow: `inset 0 0 0 1px ${accent}22` } : undefined}
    >
      <div className="text-[10px] text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="text-xs font-medium text-foreground mt-0.5">{value}</div>
    </div>
  );
}

function BigMetric({
  label, value, icon, accent,
}: { label: string; value: number; icon: React.ReactNode; accent: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2 border transition hover:bg-white/[0.04]"
      style={{
        background: "rgba(255,255,255,0.02)",
        borderColor: `${accent}33`,
        boxShadow: `inset 0 0 0 1px ${accent}11`,
      }}
    >
      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
        <span style={{ color: accent }}>{icon}</span>{label}
      </div>
      <div className="text-lg font-semibold mt-0.5 tabular-nums" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

function CapacityCard({ value, tone }: { value: number; tone: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2 border"
      style={{
        background: "rgba(255,255,255,0.02)",
        borderColor: `${tone}44`,
        boxShadow: `inset 0 0 0 1px ${tone}11`,
      }}
    >
      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
        <Activity className="h-3 w-3" style={{ color: tone }} /> Capacidade operacional
      </div>
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${value}%`, background: tone, boxShadow: `0 0 8px ${tone}99` }}
          />
        </div>
        <span className="text-xs font-semibold tabular-nums" style={{ color: tone }}>{value}%</span>
      </div>
    </div>
  );
}

function ListCard({
  title, icon, empty, children,
}: { title: string; icon: React.ReactNode; empty: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  const isEmpty = !arr || arr.length === 0 || (arr.length === 1 && !arr[0]);
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}{title}
      </div>
      <ul className="max-h-44 overflow-auto p-1.5">
        {isEmpty ? (
          <li className="text-[11px] text-muted-foreground/70 px-2 py-2">{empty}</li>
        ) : children}
      </ul>
    </div>
  );
}

/* ---------- Phase 5: premium intelligence block ---------- */
type RiskBand = "low" | "moderate" | "high" | "extreme";
type OpportunityBand = "baixa" | "moderada" | "alta" | "extrema";
interface IntelligenceData {
  impactScore?: number;
  opportunity?: OpportunityBand;
  opportunityScore?: number;
  operationalRisk?: RiskBand;
  financialRisk?: RiskBand;
  logisticsRisk?: RiskBand;
  automotiveRisk?: RiskBand;
  urbanDensity?: number;
  automotiveExposure?: number;
  estimatedVehiclesAffected?: number;
  criticality?: "rotina" | "atenção" | "prioritário" | "crítico";
  trend?: "rising" | "stable" | "falling";
  windowHours?: number;
  narrative?: string;
  premium?: boolean;
}

const RISK_TONE: Record<RiskBand, string> = {
  low: "#22c55e", moderate: "#eab308", high: "#f97316", extreme: "#ef4444",
};
const RISK_LABEL: Record<RiskBand, string> = {
  low: "Baixo", moderate: "Moderado", high: "Alto", extreme: "Extremo",
};
const OPP_TONE: Record<OpportunityBand, string> = {
  baixa: "#64748b", moderada: "#eab308", alta: "#22d3ee", extrema: "#a855f7",
};

function IntelligenceBlock({
  metadata, color,
}: { metadata: Record<string, any> | null | undefined; color: string }) {
  const intel: IntelligenceData | null = (metadata as any)?.intelligence ?? null;
  if (!intel || typeof intel.impactScore !== "number") return null;

  const impact = Math.round(intel.impactScore);
  const opp = intel.opportunity ?? "baixa";
  const oppScore = Math.round(intel.opportunityScore ?? 0);
  const trendArrow = intel.trend === "rising" ? "↑" : intel.trend === "falling" ? "↓" : "→";
  const trendTone = intel.trend === "rising" ? "#f97316" : intel.trend === "falling" ? "#64748b" : "#94a3b8";

  return (
    <>
      <SectionTitle icon={<Zap className="h-3.5 w-3.5" style={{ color }} />}>
        Inteligência premium
        {intel.premium && (
          <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider"
            style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>
            Relevante
          </span>
        )}
      </SectionTitle>

      {intel.narrative && (
        <p className="text-[11px] text-foreground/90 leading-relaxed mb-3 px-2 py-2 rounded-md border border-white/5 bg-white/[0.02]">
          {intel.narrative}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <ScoreCard label="Impact Score" value={impact} tone={color} suffix="/100" />
        <ScoreCard label="Oportunidade" value={oppScore} tone={OPP_TONE[opp]} suffix={` · ${opp}`} />
        <ScoreCard label="Criticidade" value={intel.criticality ?? "—"} tone={color} />
        <ScoreCard label="Tendência" value={`${trendArrow} ${intel.windowHours ?? "—"}h`} tone={trendTone} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <RiskChip label="Operacional" band={intel.operationalRisk ?? "low"} />
        <RiskChip label="Financeiro" band={intel.financialRisk ?? "low"} />
        <RiskChip label="Logístico" band={intel.logisticsRisk ?? "low"} />
        <RiskChip label="Automotivo" band={intel.automotiveRisk ?? "low"} />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <MicroStat label="Densidade urbana" value={`${Math.round((intel.urbanDensity ?? 0) * 100)}%`} />
        <MicroStat label="Exposição auto" value={`${Math.round((intel.automotiveExposure ?? 0) * 100)}%`} />
        <MicroStat label="Veíc. estimados" value={(intel.estimatedVehiclesAffected ?? 0).toLocaleString()} />
      </div>
    </>
  );
}

function ScoreCard({ label, value, tone, suffix }: { label: string; value: number | string; tone: string; suffix?: string }) {
  return (
    <div className="rounded-lg border bg-white/[0.02] px-2.5 py-2"
      style={{ borderColor: `${tone}33`, boxShadow: `inset 0 0 0 1px ${tone}11` }}>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[15px] font-semibold tabular-nums leading-tight" style={{ color: tone }}>
        {value}{suffix && <span className="text-[10px] text-muted-foreground ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

function RiskChip({ label, band }: { label: string; band: RiskBand }) {
  const tone = RISK_TONE[band];
  return (
    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-md border bg-white/[0.02]"
      style={{ borderColor: `${tone}33` }}>
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: tone }}>
        {RISK_LABEL[band]}
      </span>
    </div>
  );
}

function MicroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-1.5 rounded-md border border-white/5 bg-white/[0.02]">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[12px] font-medium tabular-nums">{value}</div>
    </div>
  );
}

