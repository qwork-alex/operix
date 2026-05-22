/**
 * AIControlCenter — fixed operational AI control button.
 *
 * Replaces the floating robot / presence layer with a static, professional
 * surface that lives in the TopBar between notifications and the user
 * profile. Behaves like an engineer/copilot: shows operational signals,
 * priority badges, and opens the full AgentPanel on demand.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Info, ChevronRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAI } from "@/agents/ai";
import { useOperationalSignals, type SignalLevel } from "@/hooks/useOperationalSignals";

const AgentPanel = lazy(() => import("@/components/agent/AgentPanel"));

const LEVEL_META: Record<SignalLevel, { dot: string; text: string; icon: typeof Info }> = {
  ok:    { dot: "bg-emerald-400", text: "text-emerald-400", icon: Activity },
  info:  { dot: "bg-sky-400",     text: "text-sky-400",     icon: Info },
  warn:  { dot: "bg-amber-400",   text: "text-amber-400",   icon: AlertTriangle },
  error: { dot: "bg-rose-500",    text: "text-rose-400",    icon: AlertTriangle },
};

/** Minimal, automotive-inspired robot head — pure SVG, single subtle pulse on the eye. */
function RobotHead({ level }: { level: SignalLevel }) {
  const eye =
    level === "error" ? "hsl(0 85% 60%)" :
    level === "warn"  ? "hsl(38 95% 60%)" :
    level === "info"  ? "hsl(205 95% 65%)" :
                        "hsl(155 80% 55%)";
  return (
    <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden="true">
      <defs>
        <linearGradient id="ai-helm" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(220 12% 28%)" />
          <stop offset="100%" stopColor="hsl(220 14% 14%)" />
        </linearGradient>
      </defs>
      {/* Helmet silhouette */}
      <path
        d="M6 12 Q6 5 16 5 Q26 5 26 12 L26 22 Q26 26 22 26 L10 26 Q6 26 6 22 Z"
        fill="url(#ai-helm)"
        stroke="hsl(220 10% 38%)"
        strokeWidth="0.75"
      />
      {/* Visor */}
      <rect x="9" y="12" width="14" height="6" rx="1.5"
        fill="hsl(220 25% 8%)"
        stroke="hsl(220 15% 30%)"
        strokeWidth="0.5"
      />
      {/* Single eye / sensor */}
      <circle cx="16" cy="15" r="1.4" fill={eye}>
        <animate attributeName="opacity" values="1;0.55;1" dur="2.6s" repeatCount="indefinite" />
      </circle>
      {/* Chin vent */}
      <rect x="12" y="22" width="8" height="1" rx="0.5" fill="hsl(220 12% 22%)" />
    </svg>
  );
}

export function AIControlCenter() {
  const { snapshot, open } = useAI();
  const { signals } = useOperationalSignals();
  const [menuOpen, setMenuOpen] = useState(false);

  const worst: SignalLevel = useMemo(() => {
    const order: SignalLevel[] = ["error", "warn", "info", "ok"];
    for (const lvl of order) if (signals.some((s) => s.level === lvl)) return lvl;
    return "ok";
  }, [signals]);

  const counts = useMemo(() => {
    return {
      error: signals.filter((s) => s.level === "error").length,
      warn:  signals.filter((s) => s.level === "warn").length,
      info:  signals.filter((s) => s.level === "info").length,
    };
  }, [signals]);

  const badge = counts.error + counts.warn;
  const meta = LEVEL_META[worst];

  // When the AgentPanel emits its own open events, mirror via context.
  useEffect(() => {
    const h = () => open();
    window.addEventListener("qwork:agent:open-request", h);
    return () => window.removeEventListener("qwork:agent:open-request", h);
  }, [open]);

  const expanded = snapshot.mode === "expanded";

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Centro de controlo AI"
            title="Centro de controlo AI"
            className="relative text-muted-foreground hover:text-foreground"
          >
            <RobotHead level={worst} />
            {badge > 0 && (
              <span
                className={cn(
                  "absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-background",
                  worst === "error" ? "bg-rose-500" : "bg-amber-400",
                )}
              >
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="bg-card border-border w-80 p-0">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2">
              <RobotHead level={worst} />
              <div className="leading-tight">
                <p className="text-sm font-semibold text-foreground">AI Control Center</p>
                <p className={cn("text-[10px] uppercase tracking-wider", meta.text)}>
                  {worst === "ok" ? "Operacional" :
                   worst === "info" ? "Informativo" :
                   worst === "warn" ? "Atenção requerida" :
                                       "Crítico"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="rounded border border-rose-500/30 bg-rose-500/10 text-rose-400 px-1.5 py-0.5">{counts.error}</span>
              <span className="rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 px-1.5 py-0.5">{counts.warn}</span>
              <span className="rounded border border-sky-500/30 bg-sky-500/10 text-sky-400 px-1.5 py-0.5">{counts.info}</span>
            </div>
          </div>
          <DropdownMenuSeparator />

          <ScrollArea className="max-h-[320px]">
            {signals.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Nenhum sinal operacional. Pipeline estável.
              </div>
            ) : (
              <ul className="py-1">
                {signals.slice(0, 12).map((s) => {
                  const lm = LEVEL_META[s.level];
                  const Icon = lm.icon;
                  return (
                    <li
                      key={s.id}
                      className="flex items-start gap-2 px-3 py-2 hover:bg-muted/30 transition-colors"
                    >
                      <span className={cn("mt-1 h-1.5 w-1.5 rounded-full shrink-0", lm.dot)} />
                      <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", lm.text)} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">{s.title}</p>
                        {s.detail && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2">{s.detail}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>

          <DropdownMenuSeparator />
          <div className="p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-xs"
              onClick={() => {
                setMenuOpen(false);
                open();
              }}
            >
              <span>Abrir copiloto operacional</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {expanded && (
        <Suspense fallback={null}>
          <AgentPanel onClose={() => window.dispatchEvent(new CustomEvent("qwork:agent:close-request"))} />
        </Suspense>
      )}
    </>
  );
}

export default AIControlCenter;
