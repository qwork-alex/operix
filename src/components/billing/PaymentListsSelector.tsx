import { useMemo, useState } from "react";
import { Plus, ChevronDown, X, ListChecks, Users, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { usePaymentListsConsolidated, type BillingPaymentList } from "@/hooks/usePaymentListsConsolidated";

interface Props {
  /** Selected list ids (= list_name). */
  value: string[];
  onChange: (ids: string[], lists: BillingPaymentList[]) => void;
  label?: string;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/**
 * Lists selector — financial billing works at the LIST level only (never OP-by-OP).
 * Source of truth: payment_orders (grouped by list_name in `usePaymentListsConsolidated`).
 */
export function PaymentListsSelector({ value, onChange, label = "Listas vinculadas" }: Props) {
  const { data: lists = [], isLoading } = usePaymentListsConsolidated();
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");

  const byId = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);
  const selected = useMemo(
    () => value.map((id) => byId.get(id)).filter(Boolean) as BillingPaymentList[],
    [value, byId]
  );

  const technicians = useMemo(() => {
    const m = new Map<string, string>();
    lists.forEach((l) => {
      if (l.assigned_user_id) m.set(l.assigned_user_id, l.technician_name);
    });
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [lists]);

  const years = useMemo(() => {
    const s = new Set<number>();
    lists.forEach((l) => s.add(l.year));
    return Array.from(s).sort((a, b) => b - a);
  }, [lists]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lists.filter((l) => {
      if (userFilter !== "all" && l.assigned_user_id !== userFilter) return false;
      if (yearFilter !== "all" && String(l.year) !== yearFilter) return false;
      if (q) {
        const hay = [l.list_name, l.technician_name, l.client_name ?? "", l.city ?? ""].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [lists, search, userFilter, yearFilter]);

  const toggle = (id: string) => {
    const has = value.includes(id);
    const next = has ? value.filter((x) => x !== id) : [...value, id];
    onChange(next, next.map((i) => byId.get(i)).filter(Boolean) as BillingPaymentList[]);
  };

  const clearAll = () => onChange([], []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium flex items-center gap-1.5">
          <ListChecks className="h-3.5 w-3.5" /> {label}
        </span>
        <Badge variant="secondary" className="text-[10px]">
          {selected.length} lista{selected.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((l) => (
            <Badge key={l.id} variant="outline" className="text-[10px] gap-1 pr-1 font-normal">
              <span className="font-mono text-primary">{l.list_name}</span>
              <span className="text-muted-foreground">·</span>
              <span>{l.technician_name}</span>
              {l.client_name && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{l.client_name}</span>
                </>
              )}
              <span className="text-muted-foreground">{fmtMoney(l.total)}</span>
              <button
                className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5"
                onClick={() => toggle(l.id)}
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
            Selecionar listas
            <ChevronDown className="h-3.5 w-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[480px] p-2 flex flex-col"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {/* Filters */}
          <div className="space-y-1.5 mb-2 shrink-0">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Procurar por lista, técnico ou cliente..."
              className="h-7 text-xs"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="h-7 text-[11px]">
                  <Users className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  <SelectItem value="all">Todos os técnicos</SelectItem>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="h-7 text-[11px]">
                  <Calendar className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os anos</SelectItem>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Scrollable list — fixed height + native scroll, isolated from parent scroll */}
          <div
            className="overflow-y-auto overscroll-contain space-y-0.5 pr-1"
            style={{ maxHeight: 340, minHeight: 80 }}
          >
            {isLoading && (
              <p className="text-[10px] text-muted-foreground text-center py-4">A carregar…</p>
            )}
            {!isLoading && filtered.length === 0 && (
              <p className="text-[10px] text-muted-foreground text-center py-4">
                Nenhuma lista encontrada
              </p>
            )}
            {filtered.map((l) => {
              const checked = value.includes(l.id);
              return (
                <label
                  key={l.id}
                  className="flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer hover:bg-muted/50 transition-colors text-xs"
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(l.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-mono text-[11px] text-primary font-semibold">{l.list_name}</span>
                      <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal">
                        S{l.week}/{String(l.year).slice(2)}
                      </Badge>
                      <span className="ml-auto tabular-nums font-medium text-[11px]">{fmtMoney(l.total)}</span>
                    </div>
                    <div className="text-muted-foreground text-[10px] truncate mt-0.5">
                      {l.technician_name}
                      {l.client_name ? ` · ${l.client_name}` : ""}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground shrink-0">
            <span>{filtered.length} lista{filtered.length !== 1 ? "s" : ""} disponíveis</span>
            <span>{selected.length} selecionada{selected.length !== 1 ? "s" : ""}</span>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
