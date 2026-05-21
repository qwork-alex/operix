import { useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { ChevronRight, Eye, Power } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HIERARCHY_FALLBACK,
  type HierarchyContext,
  type HierarchyRecord,
} from "@/components/shared/HierarchyExplorer";

// --- Platform active state (local-only, no schema impact) ---
const PLATFORM_ACTIVE_KEY = "hierarchy.platform_active.v1";
function readActiveMap(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(PLATFORM_ACTIVE_KEY) || "{}"); } catch { return {}; }
}
function writeActiveMap(m: Record<string, boolean>) {
  try { localStorage.setItem(PLATFORM_ACTIVE_KEY, JSON.stringify(m)); } catch { /* ignore */ }
}

/**
 * Phase 1B — Hierarchical grouped view wrapping existing tables.
 *
 * Renders nested collapsible groups (Year → Client → Unit → Week → Technician)
 * with per-group status, counters and totals. The existing table component is
 * rendered ONLY at the deepest (leaf = Technician) group, preserving all its
 * editing/saving/permission logic untouched.
 */

export type AggregatedStatus = "paid" | "partial" | "pending" | "none";

export interface HierarchicalOrdersViewProps<R extends HierarchyRecord> {
  records: R[];
  storageKey: string; // e.g. "hierarchy.service_orders.tbl"
  /** Renders the actual editable table for a leaf group. */
  renderLeaf: (subset: R[]) => ReactNode;
  /** Format a number as a currency string (locale-aware). */
  formatCurrency: (n: number) => string;
  /** Sync the lateral explorer when 👁 is clicked on a group. */
  onView?: (ctx: HierarchyContext) => void;
  /** Currently active context — used to highlight matching group rows. */
  activeContext?: HierarchyContext;
  /** Optional override: how to read total / amount paid / status from a record. */
  getTotal?: (r: R) => number;
  getPaid?: (r: R) => number;
  getStatus?: (r: R) => AggregatedStatus;
}

const KEY_OPEN_SUFFIX = ".tblOpen";

const STATUS_STYLE: Record<AggregatedStatus, string> = {
  paid: "text-emerald-400",
  partial: "text-amber-400",
  pending: "text-red-400",
  none: "text-muted-foreground",
};

const STATUS_LABEL: Record<AggregatedStatus, string> = {
  paid: "🟢 Pago",
  partial: "🟡 Parcial",
  pending: "🔴 Pendente",
  none: "— Sem dados",
};

function defaultStatus(r: HierarchyRecord & { status?: string | null; amount_paid?: number | null; total?: number | null }): AggregatedStatus {
  const s = (r.status || "").toLowerCase();
  if (s === "paid") return "paid";
  if (s === "partial") return "partial";
  if (s === "pending") return "pending";
  // Derive from amounts
  const total = Number(r.total) || 0;
  const paid = Number(r.amount_paid) || 0;
  if (total > 0 && paid >= total) return "paid";
  if (paid > 0) return "partial";
  if (total > 0) return "pending";
  return "none";
}

function aggregateStatus(records: HierarchyRecord[], getStatus: (r: HierarchyRecord) => AggregatedStatus): AggregatedStatus {
  if (!records.length) return "none";
  const statuses = records.map(getStatus);
  if (statuses.every(s => s === "paid")) return "paid";
  if (statuses.every(s => s === "pending" || s === "none")) return "pending";
  return "partial";
}

const getYear = (r: HierarchyRecord) => {
  if (!r.created_at) return HIERARCHY_FALLBACK.year;
  const d = new Date(r.created_at);
  return Number.isNaN(d.getTime()) ? HIERARCHY_FALLBACK.year : String(d.getFullYear());
};
const getClient = (r: HierarchyRecord) => (r.client_name || "").trim() || HIERARCHY_FALLBACK.client;
const getUnit = (r: HierarchyRecord) => (r.operational_unit || "").trim() || HIERARCHY_FALLBACK.unit;
const getWeek = (r: HierarchyRecord) => (r.week || r.list_name || "").trim() || HIERARCHY_FALLBACK.week;
const getTech = (r: HierarchyRecord) => (r.technician_name || "").trim() || HIERARCHY_FALLBACK.technician;

const FALLBACK_VALUES = new Set<string>(Object.values(HIERARCHY_FALLBACK));

function sortKeys(keys: string[], opts?: { numericDesc?: boolean }) {
  return [...keys].sort((a, b) => {
    if (FALLBACK_VALUES.has(a) && !FALLBACK_VALUES.has(b)) return 1;
    if (FALLBACK_VALUES.has(b) && !FALLBACK_VALUES.has(a)) return -1;
    if (opts?.numericDesc) {
      const an = Number(a), bn = Number(b);
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return bn - an;
    }
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

function groupBy<T>(items: T[], keyFn: (i: T) => string) {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = keyFn(it);
    const arr = map.get(k);
    if (arr) arr.push(it); else map.set(k, [it]);
  }
  return map;
}

export function HierarchicalOrdersView<R extends HierarchyRecord>({
  records,
  storageKey,
  renderLeaf,
  formatCurrency,
  onView,
  activeContext,
  getTotal,
  getPaid,
  getStatus,
}: HierarchicalOrdersViewProps<R>) {
  const [open, setOpen] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`${storageKey}${KEY_OPEN_SUFFIX}`);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`${storageKey}${KEY_OPEN_SUFFIX}`, JSON.stringify([...open]));
    } catch { /* ignore */ }
  }, [open, storageKey]);

  const toggle = useCallback((k: string) => {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, []);

  const totalOf = useCallback((r: R) => {
    if (getTotal) return getTotal(r);
    return Number((r as any).total) || 0;
  }, [getTotal]);
  const paidOf = useCallback((r: R) => {
    if (getPaid) return getPaid(r);
    return Number((r as any).amount_paid) || 0;
  }, [getPaid]);
  const statusOf = useCallback((r: R) => (getStatus ? getStatus(r) : defaultStatus(r as any)), [getStatus]);

  const tree = useMemo(() => {
    const byYear = groupBy(records, getYear);
    return sortKeys([...byYear.keys()], { numericDesc: true }).map(year => {
      const yearRows = byYear.get(year)!;
      const byClient = groupBy(yearRows, getClient);
      return {
        key: `y:${year}`,
        label: year,
        rows: yearRows,
        ctx: { level: "year", year } as HierarchyContext,
        children: sortKeys([...byClient.keys()]).map(client => {
          const clientRows = byClient.get(client)!;
          const byUnit = groupBy(clientRows, getUnit);
          return {
            key: `y:${year}|c:${client}`,
            label: client,
            rows: clientRows,
            ctx: { level: "client", year, client } as HierarchyContext,
            children: sortKeys([...byUnit.keys()]).map(unit => {
              const unitRows = byUnit.get(unit)!;
              const byWeek = groupBy(unitRows, getWeek);
              return {
                key: `y:${year}|c:${client}|u:${unit}`,
                label: unit,
                rows: unitRows,
                ctx: { level: "unit", year, client, unit } as HierarchyContext,
                children: sortKeys([...byWeek.keys()]).map(week => {
                  const weekRows = byWeek.get(week)!;
                  const byTech = groupBy(weekRows, getTech);
                  return {
                    key: `y:${year}|c:${client}|u:${unit}|w:${week}`,
                    label: week,
                    rows: weekRows,
                    ctx: { level: "week", year, client, unit, week } as HierarchyContext,
                    children: sortKeys([...byTech.keys()]).map(tech => ({
                      key: `y:${year}|c:${client}|u:${unit}|w:${week}|t:${tech}`,
                      label: tech,
                      rows: byTech.get(tech)!,
                      ctx: { level: "technician", year, client, unit, week, technician: tech } as HierarchyContext,
                      children: undefined as undefined,
                    })),
                  };
                }),
              };
            }),
          };
        }),
      };
    });
  }, [records]);

  const isCtxActive = (ctx: HierarchyContext) => {
    if (!activeContext) return false;
    return (
      activeContext.level === ctx.level &&
      activeContext.year === ctx.year &&
      activeContext.client === ctx.client &&
      activeContext.unit === ctx.unit &&
      activeContext.week === ctx.week &&
      activeContext.technician === ctx.technician
    );
  };

  type Node = (typeof tree)[number];
  const renderNode = (node: any, depth: number): ReactNode => {
    const isOpen = open.has(node.key);
    const isLeaf = !node.children || node.children.length === 0;
    const groupTotal = node.rows.reduce((s: number, r: R) => s + totalOf(r), 0);
    const groupPaid = node.rows.reduce((s: number, r: R) => s + paidOf(r), 0);
    const groupPending = Math.max(0, groupTotal - groupPaid);
    const groupStatus = aggregateStatus(node.rows, statusOf as any);
    const active = isCtxActive(node.ctx);

    return (
      <div key={node.key} className="space-y-1">
        <div
          className={cn(
            "group flex items-center gap-2 rounded-md border border-border/40 bg-secondary/30 px-2 py-1.5 transition-colors",
            "hover:bg-secondary/50",
            active && "ring-1 ring-primary/50 bg-primary/5",
          )}
          style={{ marginLeft: depth * 12 }}
        >
          <button
            type="button"
            onClick={() => toggle(node.key)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm hover:bg-background/40"
            aria-label={isOpen ? "Recolher" : "Expandir"}
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-90")} />
          </button>

          <span className="flex-1 truncate text-xs font-medium" title={node.label}>
            {node.label}
          </span>

          <span className="text-[10px] tabular-nums text-muted-foreground">
            {node.rows.length} {node.rows.length === 1 ? "registro" : "registros"}
          </span>

          <span className="hidden sm:inline text-[10px] tabular-nums text-muted-foreground">
            Bruto: <span className="text-foreground font-medium">{formatCurrency(groupTotal)}</span>
          </span>
          <span className="hidden md:inline text-[10px] tabular-nums text-emerald-400">
            Pago: {formatCurrency(groupPaid)}
          </span>
          <span className="hidden md:inline text-[10px] tabular-nums text-red-400">
            Pendente: {formatCurrency(groupPending)}
          </span>

          <span className={cn("text-[10px] font-medium", STATUS_STYLE[groupStatus])}>
            {STATUS_LABEL[groupStatus]}
          </span>

          {onView && (
            <button
              type="button"
              onClick={() => onView(node.ctx)}
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity",
                "hover:bg-primary/15 hover:text-primary group-hover:opacity-100",
                active && "opacity-100 text-primary",
              )}
              title="Visualizar este contexto"
              aria-label="Visualizar"
            >
              <Eye className="h-3 w-3" />
            </button>
          )}
        </div>

        {isOpen && (
          <div className="space-y-1">
            {isLeaf
              ? <div style={{ marginLeft: (depth + 1) * 12 }}>{renderLeaf(node.rows as R[])}</div>
              : node.children!.map((c: any) => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!records.length) {
    return null;
  }

  return <div className="space-y-1.5">{tree.map(n => renderNode(n, 0))}</div>;
}
