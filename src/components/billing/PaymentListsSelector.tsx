import { useState, useMemo } from "react";
import { Plus, ChevronDown, X, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePaymentLists, type PaymentList } from "@/hooks/usePaymentLists";

interface Props {
  value: string[];                          // list ids
  onChange: (next: string[], lists: PaymentList[]) => void;
  label?: string;
}

/**
 * Multi-select for payment lists (technician + week buckets).
 * Visually mirrors the group selector in Profit Distribution.
 */
export function PaymentListsSelector({ value, onChange, label = "Listas vinculadas" }: Props) {
  const { data: lists = [], isLoading } = usePaymentLists();
  const [search, setSearch] = useState("");

  const byId = useMemo(() => new Map(lists.map(l => [l.id, l])), [lists]);
  const selected = useMemo(() => value.map(id => byId.get(id)).filter(Boolean) as PaymentList[], [value, byId]);

  const unselected = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lists
      .filter(l => !value.includes(l.id))
      .filter(l => !q || l.label.toLowerCase().includes(q) || l.technician_name.toLowerCase().includes(q) || `s${l.week}`.includes(q));
  }, [lists, value, search]);

  const toggle = (id: string) => {
    const has = value.includes(id);
    const next = has ? value.filter(x => x !== id) : [...value, id];
    onChange(next, next.map(i => byId.get(i)).filter(Boolean) as PaymentList[]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> {label}
        </span>
        <Badge variant="secondary" className="text-[10px]">
          {selected.length} lista{selected.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(l => (
            <Badge key={l.id} variant="outline" className="text-[10px] gap-1 pr-1">
              <span className="font-mono">S{l.week}</span>
              <span>{l.technician_name}</span>
              <span className="text-muted-foreground">({l.os_count || l.payment_order_ids.length} OS)</span>
              <button
                className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5"
                onClick={() => toggle(l.id)}
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
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
        <PopoverContent className="w-[380px] p-2" align="start">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por técnico ou semana..."
            className="h-7 text-xs mb-2"
          />
          <div className="max-h-[260px] overflow-y-auto space-y-0.5">
            {isLoading && (
              <p className="text-[10px] text-muted-foreground text-center py-4">A carregar…</p>
            )}
            {!isLoading && unselected.length === 0 && (
              <p className="text-[10px] text-muted-foreground text-center py-4">Nenhuma lista disponível</p>
            )}
            {unselected.map(l => (
              <label
                key={l.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors text-xs"
              >
                <Checkbox checked={false} onCheckedChange={() => toggle(l.id)} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    <span className="font-mono text-[10px] mr-1.5">S{l.week}/{String(l.year).slice(2)}</span>
                    {l.technician_name}
                  </div>
                  <div className="text-muted-foreground text-[10px]">
                    {l.os_count || l.payment_order_ids.length} OS · {new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(l.total)}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
