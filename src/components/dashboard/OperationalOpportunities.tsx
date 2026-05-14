import { useMemo, useState } from "react";
import { Target, TrendingUp, Users, FileText, MapPin, Zap, ChevronRight, Sparkles, Activity } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types & priority system                                            */
/* ------------------------------------------------------------------ */
export type OpPriority = "low" | "medium" | "high" | "critical";

export interface OppHailEvent {
  id: string;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number;
  lng: number;
  radius_km: number;
  severity: "low" | "moderate" | "severe" | "extreme";
  status: "forecast" | "ongoing" | "confirmed" | "closed";
  hail_size_mm: number | null;
  probability: number | null;
}

export interface OppOrder {
  id: string;
  city?: string;
  platform?: string;
  plate?: string;
  status?: string;
  lat: number;
  lng: number;
}

export interface OppTeam {
  lat: number;
  lng: number;
  city?: string;
  when?: string;
}

export interface Opportunity {
  id: string;
  hail: OppHailEvent;
  city: string;
  country: string;
  nearbyOrders: OppOrder[];
  nearbyTeams: OppTeam[];
  damageConcentration: number;   // 0..100 — orders × severity heuristic
  economicRelevance: number;     // 0..100 — based on order count + size
  operationalPotential: number;  // 0..100 — combined score
  priority: OpPriority;
  score: number;
}

const PRIORITY_META: Record<OpPriority, { label: string; color: string; glow: string; bg: string }> = {
  low:      { label: "Baixa",    color: "#22d3ee", glow: "#22d3ee55", bg: "#22d3ee18" },
  medium:   { label: "Média",    color: "#eab308", glow: "#eab30855", bg: "#eab30818" },
  high:     { label: "Alta",     color: "#f97316", glow: "#f9731655", bg: "#f9731618" },
  critical: { label: "Crítica",  color: "#ef4444", glow: "#ef444599", bg: "#ef444422" },
};

const SEVERITY_WEIGHT = { low: 1, moderate: 2, severe: 3.5, extreme: 5 } as const;

/* ------------------------------------------------------------------ */
/*  Haversine distance (km)                                            */
/* ------------------------------------------------------------------ */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ------------------------------------------------------------------ */
/*  Compute opportunities                                              */
/* ------------------------------------------------------------------ */
export function computeOpportunities(
  hailEvents: OppHailEvent[],
  orders: OppOrder[],
  teams: OppTeam[],
): Opportunity[] {
  const ORDER_RADIUS = 60;   // km
  const TEAM_RADIUS = 100;   // km

  const opps: Opportunity[] = hailEvents
    .filter((h) => h.status !== "closed")
    .map((h) => {
      const radius = Math.max(ORDER_RADIUS, h.radius_km || 0);
      const nearbyOrders = orders.filter((o) =>
        haversineKm({ lat: h.lat, lng: h.lng }, { lat: o.lat, lng: o.lng }) <= radius,
      );
      const nearbyTeams = teams.filter((tm) =>
        haversineKm({ lat: h.lat, lng: h.lng }, { lat: tm.lat, lng: tm.lng }) <= TEAM_RADIUS,
      );

      const sevW = SEVERITY_WEIGHT[h.severity];
      const sizeMm = h.hail_size_mm ?? 0;
      const sizeFactor = 1 + Math.min(2.5, sizeMm / 20); // 25mm ≈ +1.25x
      const orderFactor = 1 + Math.min(4, nearbyOrders.length * 0.6);

      const damageConcentration = Math.min(100, Math.round(sevW * 12 + sizeMm * 1.2));
      const economicRelevance   = Math.min(100, Math.round(nearbyOrders.length * 8 + sevW * 6));
      const score               = sevW * sizeFactor * orderFactor;
      const operationalPotential = Math.min(100, Math.round(score * 6));

      let priority: OpPriority = "low";
      if (score >= 18) priority = "critical";
      else if (score >= 10) priority = "high";
      else if (score >= 4.5) priority = "medium";

      return {
        id: h.id,
        hail: h,
        city: h.city ?? h.region ?? "Região",
        country: h.country ?? "—",
        nearbyOrders,
        nearbyTeams,
        damageConcentration,
        economicRelevance,
        operationalPotential,
        priority,
        score,
      };
    })
    .filter((o) => o.score > 0.5)
    .sort((a, b) => b.score - a.score);

  return opps;
}

/* ------------------------------------------------------------------ */
/*  Panel                                                              */
/* ------------------------------------------------------------------ */
export function OperationalOpportunities({
  opportunities,
  onSelect,
}: {
  opportunities: Opportunity[];
  onSelect?: (opp: Opportunity) => void;
}) {
  const [filter, setFilter] = useState<"all" | OpPriority>("all");

  const filtered = useMemo(
    () => (filter === "all" ? opportunities : opportunities.filter((o) => o.priority === filter)),
    [opportunities, filter],
  );

  const counts = useMemo(() => {
    const c: Record<OpPriority, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    opportunities.forEach((o) => { c[o.priority]++; });
    return c;
  }, [opportunities]);

  const totalOrders = opportunities.reduce((s, o) => s + o.nearbyOrders.length, 0);
  const totalTeams  = opportunities.reduce((s, o) => s + o.nearbyTeams.length, 0);

  return (
    <div
      className="glass-panel rounded-xl p-5 animate-fade-in mt-4"
      style={{
        background: "linear-gradient(180deg, hsl(220 14% 9% / 0.98), hsl(220 14% 7% / 0.98))",
        border: "1px solid hsl(220 12% 18%)",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <div className="relative">
              <Target className="h-4 w-4 text-orange-400" />
              <Sparkles className="h-2.5 w-2.5 text-yellow-300 absolute -top-1 -right-1.5" />
            </div>
            Oportunidades Operacionais
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Inteligência PDR — eventos climáticos cruzados com demanda, ordens e equipes
          </p>
        </div>

        {/* Aggregate stats */}
        <div className="flex flex-wrap gap-2">
          <Stat icon={<Activity className="h-3 w-3" />} label="Eventos" value={opportunities.length} color="#a855f7" />
          <Stat icon={<FileText className="h-3 w-3" />} label="Ordens próximas" value={totalOrders} color="#22d3ee" />
          <Stat icon={<Users className="h-3 w-3" />} label="Equipes alcançáveis" value={totalTeams} color="#34d399" />
        </div>
      </div>

      {/* Priority filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <FilterChip active={filter === "all"} label={`Todas (${opportunities.length})`} color="#94a3b8" onClick={() => setFilter("all")} />
        {(["critical", "high", "medium", "low"] as OpPriority[]).map((p) => (
          <FilterChip
            key={p}
            active={filter === p}
            label={`${PRIORITY_META[p].label} (${counts[p]})`}
            color={PRIORITY_META[p].color}
            onClick={() => setFilter(p)}
          />
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="py-10 text-center text-xs text-muted-foreground border border-dashed rounded-lg" style={{ borderColor: "hsl(220 12% 20%)" }}>
          Nenhuma oportunidade ativa. O motor reavaliará à medida que novos eventos chegarem.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 12).map((opp) => (
            <OpportunityRow key={opp.id} opp={opp} onClick={() => onSelect?.(opp)} />
          ))}
        </div>
      )}

      {/* Future architecture footer */}
      <div className="mt-4 pt-3 border-t flex items-center justify-between text-[10px] text-muted-foreground" style={{ borderColor: "hsl(220 12% 18%)" }}>
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-purple-400" />
          Pronto para IA preditiva, previsão de demanda e dispatch automático
        </span>
        <span className="opacity-60">{opportunities.length} eventos analisados</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function OpportunityRow({ opp, onClick }: { opp: Opportunity; onClick?: () => void }) {
  const meta = PRIORITY_META[opp.priority];
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg p-3 transition-all hover:translate-x-0.5 group"
      style={{
        background: "hsl(220 14% 10%)",
        border: `1px solid ${meta.color}33`,
        boxShadow: opp.priority === "critical" ? `0 0 14px ${meta.glow}` : "none",
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Left — region + priority */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
            style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}55` }}
          >
            {meta.label}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              {opp.city}
              <span className="text-[10px] text-muted-foreground font-normal">· {opp.country}</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {opp.hail.severity.toUpperCase()} · {opp.hail.hail_size_mm ?? 0}mm · raio {opp.hail.radius_km}km
            </div>
          </div>
        </div>

        {/* Middle — operational metrics */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <Metric icon={<FileText className="h-3 w-3 text-cyan-400" />} value={opp.nearbyOrders.length} label="Ordens" />
          <Metric icon={<Users className="h-3 w-3 text-emerald-400" />} value={opp.nearbyTeams.length} label="Equipes" />
          <Metric icon={<TrendingUp className="h-3 w-3 text-orange-400" />} value={`${opp.operationalPotential}%`} label="Potencial" />
        </div>

        {/* Right — score bars */}
        <div className="flex items-center gap-2 flex-1 min-w-[160px] max-w-[260px]">
          <ScoreBar label="Dano" value={opp.damageConcentration} color="#ef4444" />
          <ScoreBar label="Econ." value={opp.economicRelevance} color="#22d3ee" />
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
        </div>
      </div>
    </button>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      {icon}
      <span className="font-semibold text-foreground">{value}</span>
      <span className="opacity-60">{label}</span>
    </div>
  );
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex justify-between text-[9px] text-muted-foreground mb-0.5">
        <span>{label}</span><span>{value}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(220 12% 16%)" }}>
        <div
          className="h-full transition-all"
          style={{ width: `${value}%`, background: color, boxShadow: `0 0 6px ${color}99` }}
        />
      </div>
    </div>
  );
}

function FilterChip({ active, label, color, onClick }: { active: boolean; label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[10px] px-2.5 py-1 rounded-md border transition-all flex items-center gap-1"
      style={{
        borderColor: active ? color : "hsl(220 12% 22%)",
        background: active ? `${color}22` : "transparent",
        color: active ? color : "hsl(var(--muted-foreground))",
        boxShadow: active ? `0 0 8px ${color}55` : "none",
      }}
    >
      {label}
    </button>
  );
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div
      className="px-2.5 py-1 rounded-md flex items-center gap-1.5 text-[10px]"
      style={{ background: `${color}15`, border: `1px solid ${color}40`, color }}
    >
      {icon}
      <span className="font-semibold">{value}</span>
      <span className="opacity-70">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Heatmap GeoJSON helper — for map integration                       */
/* ------------------------------------------------------------------ */
export function opportunitiesToHeatmapGeoJSON(opps: Opportunity[]) {
  return {
    type: "FeatureCollection" as const,
    features: opps.map((o) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [o.hail.lng, o.hail.lat] },
      properties: {
        id: o.id,
        weight: Math.min(1, o.score / 25),
        priority: o.priority,
        color: PRIORITY_META[o.priority].color,
        potential: o.operationalPotential,
      },
    })),
  };
}
