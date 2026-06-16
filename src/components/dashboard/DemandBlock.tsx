/**
 * DemandBlock — Phase 6 demand-forecast UI, fully isolated.
 *
 * Loaded LAZILY by OperationalPanel via React.lazy + Suspense so the
 * bootstrap path (App → AuthProvider → AppShell → Dashboard) never depends
 * on demand-engine code. If the chunk fails to load OR the metadata is
 * malformed, the panel still renders — only this block is suppressed.
 *
 * This module MUST NOT import providers, hooks, or anything that touches
 * session/network state.
 */
import { Zap } from "lucide-react";

type DemandBand = "irrelevante" | "baixo" | "moderado" | "alto" | "extremo";
type SaturationBand = "baixo" | "moderado" | "alto" | "crítico";

interface DemandData {
  demandScore?: number;
  band?: DemandBand;
  attention?: boolean;
  expectedOrderUplift?: number;
  windowHoursToPeak?: number;
  peakDurationHours?: number;
  saturationRisk?: SaturationBand;
  regionalPressure?: number;
  estimatedOrders?: number;
  estimatedRevenueEur?: number;
  confidence?: number;
  narrative?: string;
  reasoning?: string[];
}

const DEMAND_TONE: Record<DemandBand, string> = {
  irrelevante: "#64748b",
  baixo: "#94a3b8",
  moderado: "#eab308",
  alto: "#f97316",
  extremo: "#ef4444",
};
const SAT_TONE: Record<SaturationBand, string> = {
  baixo: "#22c55e", moderado: "#eab308", alto: "#f97316", crítico: "#ef4444",
};

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/60 mb-2 mt-3">
      {icon}
      {children}
    </div>
  );
}

function ScoreCard({ label, value, tone, suffix }: { label: string; value: number | string; tone: string; suffix?: string }) {
  return (
    <div
      className="rounded-md border px-2 py-1.5"
      style={{ borderColor: `${tone}33`, background: `${tone}10` }}
    >
      <div className="text-[9px] uppercase tracking-wider text-foreground/50">{label}</div>
      <div className="text-sm font-semibold" style={{ color: tone }}>
        {value}
        {suffix && <span className="text-[10px] font-normal text-foreground/60">{suffix}</span>}
      </div>
    </div>
  );
}

function MicroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/[0.05] bg-white/[0.02] px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-foreground/50">{label}</div>
      <div className="text-xs font-medium text-foreground/85">{value}</div>
    </div>
  );
}

export default function DemandBlock({
  metadata, color,
}: { metadata: Record<string, any> | null | undefined; color: string }) {
  try {
    const d: DemandData | null = (metadata as any)?.demand ?? null;
    if (!d || typeof d.demandScore !== "number") return null;

    const score = Math.round(d.demandScore);
    const band = d.band ?? "irrelevante";
    const tone = DEMAND_TONE[band] ?? DEMAND_TONE.irrelevante;
    const satTone = SAT_TONE[d.saturationRisk ?? "baixo"] ?? SAT_TONE.baixo;
    const conf = Math.round((d.confidence ?? 0) * 100);
    const revK = ((d.estimatedRevenueEur ?? 0) / 1000).toFixed(0);

    return (
      <>
        <SectionTitle icon={<Zap className="h-3.5 w-3.5" style={{ color: tone }} />}>
          Previsão de demanda
          {d.attention && (
            <span
              className="ml-2 text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse"
              style={{
                background: `${tone}33`,
                color: tone,
                border: `1px solid ${tone}88`,
                boxShadow: `0 0 12px ${tone}66`,
              }}
            >
              ⚠ Atenção operacional
            </span>
          )}
        </SectionTitle>

        {d.narrative && (
          <p
            className="text-[11px] text-foreground/90 leading-relaxed mb-3 px-2 py-2 rounded-md border bg-white/[0.02]"
            style={{
              borderColor: d.attention ? `${tone}55` : "rgba(255,255,255,0.05)",
              boxShadow: d.attention ? `inset 0 0 0 1px ${tone}22` : undefined,
            }}
          >
            {d.narrative}
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <ScoreCard label="DemandScore" value={score} tone={tone} suffix={` · ${band}`} />
          <ScoreCard label="Uplift" value={`×${(d.expectedOrderUplift ?? 1).toFixed(1)}`} tone={tone} />
          <ScoreCard label="Pico em" value={`${d.windowHoursToPeak ?? "—"}h`} tone={color} />
          <ScoreCard label="Duração" value={`${d.peakDurationHours ?? "—"}h`} tone={color} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <MicroStat label="Ordens estimadas" value={(d.estimatedOrders ?? 0).toLocaleString()} />
          <MicroStat label="Receita estimada" value={`€${revK}k`} />
          <MicroStat label="Saturação" value={d.saturationRisk ?? "baixo"} />
          <MicroStat label="Confiança" value={`${conf}%`} />
        </div>

        <div
          className="h-1.5 rounded-full overflow-hidden mb-3"
          style={{ background: "rgba(255,255,255,0.05)" }}
          title={`Pressão regional ${Math.round((d.regionalPressure ?? 0) * 100)}%`}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, Math.round((d.regionalPressure ?? 0) * 100))}%`,
              background: satTone,
              boxShadow: `0 0 8px ${satTone}88`,
            }}
          />
        </div>
      </>
    );
  } catch (e) {
    void e;
    return null;
  }
}
