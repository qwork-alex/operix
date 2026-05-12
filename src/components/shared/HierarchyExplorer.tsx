import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ChevronRight,
  FolderTree,
  Calendar,
  Settings,
  Folder,
  BarChart3,
  Building2,
  Wrench,
  User,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Hierarchical operational explorer (Phase 1A).
 *
 * Levels: Year → Client → Operational Unit → Week → Technician
 *
 * Each node exposes:
 *   - 👉 (chevron) → expand/collapse next level
 *   - 👁 (eye)    → set this node as the active "view context" (filters tables)
 *
 * Pure presentation: state of opened nodes + active context is persisted in
 * localStorage under the given `storageKey` so that switching between SO/PO
 * pages keeps the user's last view.
 */

export type HierarchyRecord = {
  id: string;
  created_at?: string | null;
  client_name?: string | null;
  operational_unit?: string | null;
  week?: string | null;
  list_name?: string | null; // PO uses list_name as week fallback
  technician_name?: string | null;
  assigned_user_id?: string | null;
  user_id?: string | null;
};

export type HierarchyContext = {
  level: "all" | "year" | "client" | "unit" | "week" | "technician";
  year?: string;
  client?: string;
  unit?: string;
  week?: string;
  technician?: string;
};

const EMPTY_CTX: HierarchyContext = { level: "all" };

// Per-level fallback labels — never collapse a row into a generic "—".
// These are what the user sees in the tree AND what is matched in filters.
export const HIERARCHY_FALLBACK = {
  year: "Sem Data",
  client: "Sem Cliente",
  unit: "Sem Unidade Operacional",
  week: "Sem Semana",
  technician: "Sem Técnico",
} as const;

function getYear(r: HierarchyRecord): string {
  if (!r.created_at) return HIERARCHY_FALLBACK.year;
  const d = new Date(r.created_at);
  return Number.isNaN(d.getTime()) ? HIERARCHY_FALLBACK.year : String(d.getFullYear());
}
function getWeek(r: HierarchyRecord): string {
  return (r.week || r.list_name || "").trim() || HIERARCHY_FALLBACK.week;
}
function getClient(r: HierarchyRecord): string {
  return (r.client_name || "").trim() || HIERARCHY_FALLBACK.client;
}
function getUnit(r: HierarchyRecord): string {
  return (r.operational_unit || "").trim() || HIERARCHY_FALLBACK.unit;
}
function getTech(r: HierarchyRecord): string {
  return (r.technician_name || "").trim() || HIERARCHY_FALLBACK.technician;
}

const FALLBACK_VALUES = new Set<string>(Object.values(HIERARCHY_FALLBACK));

/** Apply a HierarchyContext to a list of records. */
export function applyHierarchyContext<T extends HierarchyRecord>(
  records: T[],
  ctx: HierarchyContext,
): T[] {
  if (ctx.level === "all") return records;
  return records.filter((r) => {
    if (ctx.year && getYear(r) !== ctx.year) return false;
    if (ctx.client && getClient(r) !== ctx.client) return false;
    if (ctx.unit && getUnit(r) !== ctx.unit) return false;
    if (ctx.week && getWeek(r) !== ctx.week) return false;
    if (ctx.technician && getTech(r) !== ctx.technician) return false;
    return true;
  });
}

type TreeNode = {
  key: string;
  label: string;
  count: number;
  ctx: HierarchyContext;
  children?: TreeNode[];
  disabled?: boolean;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
};

function groupBy<T>(items: T[], keyFn: (i: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = keyFn(it);
    const arr = map.get(k);
    if (arr) arr.push(it);
    else map.set(k, [it]);
  }
  return map;
}

function sortKeys(keys: string[], opts?: { numericDesc?: boolean }) {
  return [...keys].sort((a, b) => {
    if (FALLBACK_VALUES.has(a) && !FALLBACK_VALUES.has(b)) return 1;
    if (FALLBACK_VALUES.has(b) && !FALLBACK_VALUES.has(a)) return -1;
    if (opts?.numericDesc) {
      const an = Number(a);
      const bn = Number(b);
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return bn - an;
    }
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

function buildTree(records: HierarchyRecord[]): TreeNode[] {
  const byYear = groupBy(records, getYear);
  return sortKeys([...byYear.keys()], { numericDesc: true }).map((year) => {
    const yearRows = byYear.get(year)!;
    const byClient = groupBy(yearRows, getClient);
    const operationalChildren: TreeNode[] = sortKeys([...byClient.keys()]).map((client) => {
        const clientRows = byClient.get(client)!;
        const byUnit = groupBy(clientRows, getUnit);
        return {
          key: `y:${year}|c:${client}`,
          label: client,
          count: clientRows.length,
          icon: Building2,
          ctx: { level: "client", year, client } as HierarchyContext,
          children: sortKeys([...byUnit.keys()]).map((unit) => {
            const unitRows = byUnit.get(unit)!;
            const byTech = groupBy(unitRows, getTech);
            return {
              key: `y:${year}|c:${client}|u:${unit}`,
              label: unit,
              count: unitRows.length,
              icon: Wrench,
              ctx: { level: "unit", year, client, unit } as HierarchyContext,
              children: sortKeys([...byTech.keys()]).map((tech) => {
                const techRows = byTech.get(tech)!;
                const byWeek = groupBy(techRows, getWeek);
                return {
                  key: `y:${year}|c:${client}|u:${unit}|t:${tech}`,
                  label: tech,
                  count: techRows.length,
                  icon: User,
                  ctx: { level: "technician", year, client, unit, technician: tech } as HierarchyContext,
                  children: sortKeys([...byWeek.keys()]).map((week) => ({
                    key: `y:${year}|c:${client}|u:${unit}|t:${tech}|w:${week}`,
                    label: week,
                    count: byWeek.get(week)!.length,
                    icon: CalendarDays,
                    ctx: {
                      level: "week",
                      year,
                      client,
                      unit,
                      technician: tech,
                      week,
                    } as HierarchyContext,
                  })),
                };
              }),
            };
          }),
        };
      });
    return {
      key: `y:${year}`,
      label: year,
      count: yearRows.length,
      icon: Calendar,
      ctx: { level: "year", year } as HierarchyContext,
      children: [
        {
          key: `y:${year}|sec:operacional`,
          label: "Operacional",
          count: yearRows.length,
          icon: Settings,
          ctx: { level: "year", year } as HierarchyContext,
          children: operationalChildren,
        },
        {
          key: `y:${year}|sec:documentos`,
          label: "Documentos",
          count: 0,
          icon: Folder,
          ctx: { level: "year", year } as HierarchyContext,
          disabled: true,
          hint: "Em breve",
        } as TreeNode,
        {
          key: `y:${year}|sec:relatorios`,
          label: "Relatórios",
          count: 0,
          icon: BarChart3,
          ctx: { level: "year", year } as HierarchyContext,
          disabled: true,
          hint: "Em breve",
        } as TreeNode,
      ],
    };
  });
}

function ctxLabel(ctx: HierarchyContext): string {
  if (ctx.level === "all") return "Tudo";
  const parts: string[] = [];
  if (ctx.year) parts.push(ctx.year);
  if (ctx.client) parts.push(ctx.client);
  if (ctx.unit) parts.push(ctx.unit);
  if (ctx.week) parts.push(ctx.week);
  if (ctx.technician) parts.push(ctx.technician);
  return parts.join(" › ");
}

interface RowProps {
  node: TreeNode;
  depth: number;
  open: Set<string>;
  toggle: (k: string) => void;
  active: HierarchyContext;
  onView: (ctx: HierarchyContext) => void;
}

function Row({ node, depth, open, toggle, active, onView }: RowProps) {
  const isOpen = open.has(node.key);
  const hasChildren = !!node.children?.length;
  const isDisabled = !!node.disabled;
  const isActive = !isDisabled &&
    active.level === node.ctx.level &&
    active.year === node.ctx.year &&
    active.client === node.ctx.client &&
    active.unit === node.ctx.unit &&
    active.week === node.ctx.week &&
    active.technician === node.ctx.technician;

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-sm pr-1 text-xs transition-colors",
          isDisabled
            ? "opacity-60"
            : "hover:bg-sidebar-accent/50",
          isActive && "bg-sidebar-accent text-primary",
        )}
        style={{ paddingLeft: depth * 10 + 4 }}
      >
        <button
          type="button"
          onClick={() => hasChildren && !isDisabled && toggle(node.key)}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm",
            hasChildren && !isDisabled ? "hover:bg-sidebar-accent" : "opacity-30",
          )}
          aria-label={isOpen ? "Recolher" : "Expandir"}
          disabled={isDisabled || !hasChildren}
        >
          <ChevronRight
            className={cn(
              "h-3 w-3 transition-transform",
              isOpen && hasChildren && "rotate-90",
            )}
          />
        </button>

        <span className={cn("flex-1 truncate py-1", isDisabled && "italic text-muted-foreground")} title={node.label}>
          {node.label}
        </span>

        {node.hint ? (
          <span className="rounded-sm bg-muted/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
            {node.hint}
          </span>
        ) : (
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {node.count}
          </span>
        )}

        {!isDisabled && (
          <button
            type="button"
            onClick={() => onView(node.ctx)}
            className={cn(
              "ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity",
              "hover:bg-primary/15 hover:text-primary group-hover:opacity-100",
              isActive && "opacity-100 text-primary",
            )}
            title="Visualizar nas tabelas abaixo"
            aria-label="Visualizar"
          >
            <Eye className="h-3 w-3" />
          </button>
        )}
      </div>

      {isOpen && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <Row
              key={child.key}
              node={child}
              depth={depth + 1}
              open={open}
              toggle={toggle}
              active={active}
              onView={onView}
            />
          ))}
        </div>
      )}
    </>
  );
}

interface Props {
  records: HierarchyRecord[];
  storageKey: string;
  context: HierarchyContext;
  onContextChange: (ctx: HierarchyContext) => void;
  title?: string;
  /** Optional override for the empty state. Falls back to a smart contextual message. */
  emptyMessage?: string;
}

export function HierarchyExplorer({
  records,
  storageKey,
  context,
  onContextChange,
  title = "Navegação",
  emptyMessage,
}: Props) {
  const [open, setOpen] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`${storageKey}.open`);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  // Persist opened nodes
  useEffect(() => {
    try {
      localStorage.setItem(`${storageKey}.open`, JSON.stringify([...open]));
    } catch {
      /* ignore */
    }
  }, [open, storageKey]);

  // Persist context
  useEffect(() => {
    try {
      localStorage.setItem(`${storageKey}.ctx`, JSON.stringify(context));
    } catch {
      /* ignore */
    }
  }, [context, storageKey]);

  const tree = useMemo(() => buildTree(records), [records]);

  const toggle = useCallback((k: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const total = records.length;

  // Smart, context-aware empty state.
  const smartEmpty = (() => {
    if (emptyMessage) return emptyMessage;
    if (records.length === 0) return "Nenhum registro salvo ainda.";
    if (context.level === "technician") return "Nenhum registro deste técnico.";
    if (context.level === "week") return "Nenhum registro nesta semana.";
    if (context.level === "unit") return "Nenhum registro nesta unidade operacional.";
    if (context.level === "client") return "Nenhum registro deste cliente.";
    if (context.level === "year") return "Nenhum registro neste período.";
    return "Sem dados para organizar.";
  })();

  return (
    <aside className="flex h-full w-full flex-col rounded-lg border border-border/50 bg-card/40 backdrop-blur">
      <header className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <FolderTree className="h-3.5 w-3.5" />
          <span>{title}</span>
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">{total}</span>
      </header>

      {/* Active context pill */}
      <div className="flex items-center gap-1 border-b border-border/50 px-3 py-1.5">
        <button
          type="button"
          onClick={() => onContextChange(EMPTY_CTX)}
          className={cn(
            "flex items-center gap-1 rounded-sm px-2 py-1 text-[11px] transition-colors",
            context.level === "all"
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-sidebar-accent",
          )}
          title="Limpar filtro hierárquico"
        >
          <Eye className="h-3 w-3" />
          <span className="truncate">{ctxLabel(context)}</span>
          {context.level !== "all" && <X className="h-3 w-3 opacity-60" />}
        </button>
      </div>

      <div className="flex-1 overflow-auto py-1">
        {tree.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            {smartEmpty}
          </p>
        ) : (
          tree.map((node) => (
            <Row
              key={node.key}
              node={node}
              depth={0}
              open={open}
              toggle={toggle}
              active={context}
              onView={onContextChange}
            />
          ))
        )}
      </div>
    </aside>
  );
}

/** Restores last persisted context for a given storageKey. */
export function loadHierarchyContext(storageKey: string): HierarchyContext {
  try {
    const raw = localStorage.getItem(`${storageKey}.ctx`);
    if (!raw) return EMPTY_CTX;
    const parsed = JSON.parse(raw) as HierarchyContext;
    if (parsed && typeof parsed === "object" && parsed.level) return parsed;
  } catch {
    /* ignore */
  }
  return EMPTY_CTX;
}
