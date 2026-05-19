import { useMemo, useState } from "react";
import { Plus, ChevronDown, X, FileText, Users, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { usePaymentOrdersForBilling, type BillingPaymentOrder } from "@/hooks/usePaymentOrdersForBilling";

interface Props {
  /** Selected payment_order ids. */
  value: string[];
  onChange: (ids: string[], pos: BillingPaymentOrder[]) => void;
  label?: string;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/**
 * Source of truth: payment_orders.
 * Allows selecting individual POs, with quick "select entire week/technician bucket" affordance.
 * NEVER reads from profit_distribution or derived financial tables.
 */
export function PaymentOrdersSelector({ value, onChange, label = "Ordens de pagamento vinculadas" }: Props) {
  const { data: pos = [], isLoading } = usePaymentOrdersForBilling();
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [weekFilter, setWeekFilter] = useState<string>("all");

  const byId = useMemo(() => new Map(pos.map((p) => [p.id, p])), [pos]);
  const selected = useMemo(
    () => value.map((id) => byId.get(id)).filter(Boolean) as BillingPaymentOrder[],
    [value, byId]
  );

  const technicians = useMemo(() => {
    const m = new Map<string, string>();
    pos.forEach((p) => {
      if (p.assigned_user_id) m.set(p.assigned_user_id, p.technician_name);
    });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [pos]);

  const weeks = useMemo(() => {
    const s = new Set<string>();
    pos.forEach((p) => s.add(`${p.year}-${String(p.week).padStart(2, "0")}`));
    return Array.from(s).sort().reverse();
  }, [pos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pos.filter((p) => {
      if (userFilter !== "all" && p.assigned_user_id !== userFilter) return false;
      if (weekFilter !== "all" && `${p.year}-${String(p.week).padStart(2, "0")}` !== weekFilter) return false;
      if (q) {
        const hay = [p.code, p.technician_name, p.list_name ?? "", p.client_name ?? ""].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pos, search, userFilter, weekFilter]);

  // Group filtered by (user, week) — used for bulk "select bucket"
  const buckets = useMemo(() => {
    const m = new Map<string, { user_id: string; technician_name: string; week: number; year: number; ids: string[]; total: number }>();
    filtered.forEach((p) => {
      const k = `${p.assigned_user_id ?? "_"}::${p.year}::${p.week}`;
      let b = m.get(k);
      if (!b) {
        b = { user_id: p.assigned_user_id ?? "", technician_name: p.technician_name, week: p.week, year: p.year, ids: [], total: 0 };
        m.set(k, b);
      }
      b.ids.push(p.id);
      b.total += p.total;
    });
    return Array.from(m.values()).sort((a, b) => (a.year !== b.year ? b.year - a.year : b.week !== a.week ? b.week - a.week : a.technician_name.localeCompare(b.technician_name)));
  }, [filtered]);

  const toggle = (id: string) => {
    const has = value.includes(id);
    const next = has ? value.filter((x) => x !== id) : [...value, id];
    onChange(next, next.map((i) => byId.get(i)).filter(Boolean) as BillingPaymentOrder[]);
  };

  const toggleBucket = (ids: string[]) => {
    const allIn = ids.every((id) => value.includes(id));
    const next = allIn ? value.filter((id) => !ids.includes(id)) : Array.from(new Set([...value, ...ids]));
    onChange(next, next.map((i) => byId.get(i)).filter(Boolean) as BillingPaymentOrder[]);
  };

  const clearAll = () => onChange([], []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> {label}
        </span>
        <Badge variant="secondary" className="text-[10px]">
          {selected.length} OP{selected.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <Badge key={p.id} variant="outline" className="text-[10px] gap-1 pr-1 font-normal">
              <span className="font-mono text-primary">{p.code}</span>
              <span className="text-muted-foreground">·</span>
              <span>{p.technician_name}</span>
              <span className="text-muted-foreground">S{p.week}</span>
              <button
                className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5"
                onClick={() => toggle(p.id)}
                type="button"
                aria-label="Remover"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {selected.length > 1 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-[10px] text-muted-foreground hover:text-destructive underline underline-offset-2"
            >
              limpar todas
            </button>
          )}
        </div>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" type="button">
            <Plus className="h-3.5 w-3.5" />
            Selecionar OPs
            <ChevronDown className="h-3.5 w-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[460px] p-2" align="start">
          {/* Filters */}
          <div className="space-y-1.5 mb-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Procurar por OP, técnico, cliente, lista..."
              className="h-7 text-xs"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="h-7 text-[11px]">
                  <Users className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os técnicos</SelectItem>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={weekFilter} onValueChange={setWeekFilter}>
                <SelectTrigger className="h-7 text-[11px]">
                  <Calendar className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as semanas</SelectItem>
                  {weeks.map((w) => {
                    const [y, ww] = w.split("-");
                    return (
                      <SelectItem key={w} value={w}>S{Number(ww)}/{y.slice(2)}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bucket shortcuts */}
          {buckets.length > 0 && (
            <div className="mb-2 border border-border/50 rounded-md p-1.5 bg-muted/20">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground px-1 mb-1">Agrupamentos</p>
              <div className="flex flex-wrap gap-1">
                {buckets.slice(0, 8).map((b) => {
                  const allIn = b.ids.every((id) => value.includes(id));
                  return (
                    <button
                      key={`${b.user_id}-${b.year}-${b.week}`}
                      type="button"
                      onClick={() => toggleBucket(b.ids)}
                      className={
                        "text-[10px] px-1.5 py-0.5 rounded border transition-colors " +
                        (allIn
                          ? "border-primary/60 bg-primary/15 text-primary"
                          : "border-border/60 hover:border-primary/40 hover:bg-muted/50")
                      }
                      title={`${b.ids.length} OPs · ${fmtMoney(b.total)}`}
                    >
                      <span className="font-mono mr-1">S{b.week}</span>
                      {b.technician_name}
                      <span className="text-muted-foreground ml-1">·{b.ids.length}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="max-h-[280px] overflow-y-auto space-y-0.5">
            {isLoading && (
              <p className="text-[10px] text-muted-foreground text-center py-4">A carregar…</p>
            )}
            {!isLoading && filtered.length === 0 && (
              <p className="text-[10px] text-muted-foreground text-center py-4">Nenhuma OP encontrada</p>
            )}
            {filtered.map((p) => {
              const checked = value.includes(p.id);
              return (
                <label
                  key={p.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors text-xs"
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(p.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-mono text-[10px] text-primary">{p.code}</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="font-medium truncate">{p.technician_name}</span>
                      <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal">S{p.week}/{String(p.year).slice(2)}</Badge>
                    </div>
                    <div className="text-muted-foreground text-[10px] truncate">
                      {p.client_name ?? "—"} · {fmtMoney(p.total)}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
