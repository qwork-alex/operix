import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAggregationSource } from "@/lib/apiFinance";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Save, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { partialPaymentsStore } from "@/lib/partialPaymentsStore";

/**
 * UI-only partial payments editor.
 *
 * Lists every Service Order with status='partial' that was created in the
 * given year AND whose distribution snapshot includes the given participant.
 *
 * Partial amounts live ONLY in localStorage (partialPaymentsStore). The
 * service_orders table remains immutable. payment_orders / financial_entries
 * are not used.
 */

interface PartialSO {
  id: string;
  total: number;
  car_name: string | null;
  license_plate: string | null;
}

function fetchPartialsForParticipant(participantName: string) {
  return async (): Promise<PartialSO[]> => {
    // NO date filtering — service_orders use `week`, not dates.
    // Year is display-only at the UI level.
    const source = await getAggregationSource();
    const sos = (source.service_orders ?? []).filter((so) => so.status === "partial");

    const filtered = sos.filter((so: any) => {
      const snap = so.distribution_snapshot;
      if (!Array.isArray(snap)) return false;
      return snap.some((s: any) => s?.participant_name === participantName);
    });

    return filtered.map((so: any) => ({
      id: so.id,
      total: Number(so.total || 0),
      car_name: so.car_name,
      license_plate: so.license_plate,
    }));
  };
}

export default function PartialPaymentsList({
  participantName,
  year,
  formatCurrency,
}: {
  participantName: string;
  /** Display-only label. Does NOT filter — service_orders have no date. */
  year: string;
  formatCurrency: (v: number) => string;
}) {
  const queryKey = ["partial-sos", participantName];

  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: fetchPartialsForParticipant(participantName),
    staleTime: 15_000,
  });

  if (isLoading) {
    return <div className="text-xs text-muted-foreground py-2">A carregar parciais…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70 py-1.5 px-2 rounded-md bg-muted/20 border border-dashed border-border/40">
        <AlertCircle className="h-3 w-3" />
        Nenhuma OS parcial para {participantName} ({year}).
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
        Pagamentos parciais ({items.length})
      </div>
      {items.map((it) => (
        <PartialRow key={it.id} item={it} formatCurrency={formatCurrency} />
      ))}
    </div>
  );
}

function PartialRow({
  item,
  formatCurrency,
}: {
  item: PartialSO;
  formatCurrency: (v: number) => string;
}) {
  const [paid, setPaid] = useState<number>(() => partialPaymentsStore.get(item.id));
  const [draft, setDraft] = useState<string>(() =>
    partialPaymentsStore.get(item.id) ? String(partialPaymentsStore.get(item.id)) : "",
  );
  const [dirty, setDirty] = useState(false);

  // Stay in sync with cross-tab/store changes
  useEffect(() => {
    return partialPaymentsStore.subscribe(() => {
      const v = partialPaymentsStore.get(item.id);
      setPaid(v);
      setDraft(v ? String(v) : "");
      setDirty(false);
    });
  }, [item.id]);

  const remaining = Math.max(0, item.total - paid);
  const label = item.car_name || item.license_plate || "Ordem";

  const handleSave = () => {
    const num = parseFloat(draft);
    if (Number.isNaN(num) || num < 0) {
      toast.error("Valor inválido");
      return;
    }
    if (num > item.total) {
      toast.error(`Valor excede o total (${formatCurrency(item.total)})`);
      return;
    }
    partialPaymentsStore.set(item.id, num);
    toast.success("Pagamento parcial guardado");
  };

  const handleClear = () => {
    partialPaymentsStore.clear(item.id);
    toast.success("Pagamento parcial removido");
  };

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-2 py-1.5 rounded-md border border-border/40 bg-muted/10 hover:bg-muted/20 transition-colors">
      <div className="min-w-0">
        <div className="text-xs font-medium text-foreground truncate">{label}</div>
        {item.license_plate && item.car_name && (
          <div className="text-[10px] text-muted-foreground truncate">{item.license_plate}</div>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums">
        Total {formatCurrency(item.total)}
      </span>
      <Input
        type="number"
        step="0.01"
        min="0"
        max={item.total}
        className="h-7 w-24 text-xs text-right"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        placeholder="0,00"
      />
      <span className={`text-[10px] tabular-nums ${remaining > 0 ? "text-amber-400" : "text-emerald-400"}`}>
        Falta {formatCurrency(remaining)}
      </span>
      <div className="flex items-center gap-0.5">
        {dirty && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSave}>
                <Save className="h-3.5 w-3.5 text-primary" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Guardar</TooltipContent>
          </Tooltip>
        )}
        {paid > 0 && !dirty && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleClear}>
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Limpar</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
