import { ChevronRight, X, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HIERARCHY_FALLBACK,
  type HierarchyContext,
} from "@/components/shared/HierarchyExplorer";

/**
 * Phase 1C — Operational context breadcrumb.
 *
 * Displays the active hierarchy node ("2025 › PDR › Nimes › S31 › Tech")
 * above SO/PO operational areas so the user always knows the working scope.
 * When context.level === "all" it shows a subtle "Modo global" indicator.
 */

export interface HierarchyBreadcrumbProps {
  context: HierarchyContext;
  onClear: () => void;
  className?: string;
}

interface Crumb {
  level: HierarchyContext["level"];
  label: string;
  isFallback: boolean;
}

function buildCrumbs(ctx: HierarchyContext): Crumb[] {
  const out: Crumb[] = [];
  const push = (level: Crumb["level"], val: string | undefined, fallback: string) => {
    if (!val) return;
    out.push({ level, label: val, isFallback: val === fallback });
  };
  push("year", ctx.year, HIERARCHY_FALLBACK.year);
  push("client", ctx.client, HIERARCHY_FALLBACK.client);
  push("platform" as any, ctx.platform, HIERARCHY_FALLBACK.platform);
  push("unit", ctx.unit, HIERARCHY_FALLBACK.unit);
  push("week", ctx.week, HIERARCHY_FALLBACK.week);
  push("technician", ctx.technician, HIERARCHY_FALLBACK.technician);
  return out;
}

export function HierarchyBreadcrumb({ context, onClear, className }: HierarchyBreadcrumbProps) {
  const crumbs = buildCrumbs(context);
  const isGlobal = context.level === "all" || crumbs.length === 0;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-border/50 bg-card/40 px-2.5 py-1.5 text-xs backdrop-blur",
        className,
      )}
      role="navigation"
      aria-label="Contexto operacional"
    >
      <Compass className={cn("h-3.5 w-3.5 shrink-0", isGlobal ? "text-muted-foreground" : "text-primary")} />
      {isGlobal ? (
        <span className="text-muted-foreground">Modo global — selecione um nó na árvore para focar.</span>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1">
            {crumbs.map((c, i) => (
              <span key={`${c.level}:${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                <span
                  className={cn(
                    "rounded-sm px-1.5 py-0.5",
                    c.isFallback
                      ? "bg-muted/40 text-muted-foreground italic"
                      : "bg-primary/10 text-primary font-medium",
                  )}
                  title={c.level}
                >
                  {c.label}
                </span>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={onClear}
            className="ml-auto flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            title="Limpar contexto"
          >
            <X className="h-3 w-3" />
            Limpar
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Convert a hierarchy context into pre-fill defaults for OCR / form payloads.
 * Fallback labels (e.g. "Sem Cliente") are intentionally NOT propagated.
 */
export function hierarchyDefaults(ctx: HierarchyContext): {
  year: string | null;
  client: string | null;
  platform: string | null;
  operational_unit: string | null;
  week: string | null;
  technician: string | null;
} {
  const clean = (v: string | undefined, fb: string) =>
    v && v !== fb ? v : null;
  return {
    year: ctx.year && /^\d{4}$/.test(ctx.year) ? ctx.year : null,
    client: clean(ctx.client, HIERARCHY_FALLBACK.client),
    platform: clean(ctx.platform, HIERARCHY_FALLBACK.platform),
    operational_unit: clean(ctx.unit, HIERARCHY_FALLBACK.unit),
    week: clean(ctx.week, HIERARCHY_FALLBACK.week),
    technician: clean(ctx.technician, HIERARCHY_FALLBACK.technician),
  };
}
