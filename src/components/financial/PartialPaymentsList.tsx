import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Save, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

/**
 * Lightweight UI: lists every Service Order with status='partial' that was
 * created in the given year AND whose distribution snapshot includes the
 * given participant. Allows the user to enter / edit the partial amount,
 * which is persisted to the new `financial_entries` table.
 *
 * Read paths:
 *  - service_orders        (id, total, status, created_at, distribution_snapshot)
 *  - financial_entries     (sum amount_paid per service_order_id)
 *
 * Write paths:
 *  - financial_entries     (insert / delete only — never touches SO/PO)
 */

interface PartialSO {
  id: string;
  total: number;
  car_name: string | null;
  license_plate: string | null;
  paid: number;
  entryId: string | null;
}

function fetchPartialsForParticipant(
  participantName: string,
  year: string,
) {
  return async (): Promise<PartialSO[]> => {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31T23:59:59`;

    const { data: sos, error } = await supabase
      .from("service_orders")
      .select("id, total, car_name, license_plate, status, created_at, distribution_snapshot")
      .eq("status", "partial")
      .gte("created_at", yearStart)
      .lte("created_at", yearEnd);
    if (error) throw error;

    const filtered = (sos ?? []).filter((so: any) => {
      const snap = so.distribution_snapshot;
      if (!Array.isArray(snap)) return false;
      return snap.some((s: any) => s?.participant_name === participantName);
    });

    if (filtered.length === 0) return [];

    const ids = filtered.map((s: any) => s.id);
    const { data: entries, error: feErr } = await (supabase as any)
      .from("financial_entries")
      .select("id, service_order_id, amount_paid")
      .in("service_order_id", ids);
    if (feErr) throw feErr;

    const paidMap = new Map<string, { sum: number; latestId: string | null }>();
    for (const e of (entries ?? []) as Array<{ id: string; service_order_id: string; amount_paid: number }>) {
      const cur = paidMap.get(e.service_order_id) ?? { sum: 0, latestId: null };
      cur.sum += Number(e.amount_paid || 0);
      cur.latestId = e.id;
      paidMap.set(e.service_order_id, cur);
    }

    return filtered.map((so: any) => {
      const m = paidMap.get(so.id);
      return {
        id: so.id,
        total: Number(so.total || 0),
        car_name: so.car_name,
        license_plate: so.license_plate,
        paid: m?.sum ?? 0,
        entryId: m?.latestId ?? null,
      };
    });
  };
}

export default function PartialPaymentsList({
  participantName,
  year,
  formatCurrency,
}: {
  participantName: string;
  year: string;
  formatCurrency: (v: number) => string;
}) {
  const qc = useQueryClient();
  const queryKey = ["partial-sos", participantName, year];

  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: fetchPartialsForParticipant(participantName, year),
    staleTime: 15_000,
  });

  const upsertEntry = useMutation({
    mutationFn: async ({ soId, amount }: { soId: string; amount: number }) => {
      // Replace strategy: delete prior entries for this SO, insert new one
      const { error: delErr } = await (supabase as any)
        .from("financial_entries")
        .delete()
        .eq("service_order_id", soId);
      if (delErr) throw delErr;

      if (amount > 0) {
        const { error } = await (supabase as any)
          .from("financial_entries")
          .insert({ service_order_id: soId, amount_paid: amount });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["participant-aggregation"] });
      toast.success("Pagamento parcial guardado");
    },
    onError: (e) => toast.error("Erro: " + (e as Error).message),
  });

  if (isLoading) {
    return <div className="text-xs text-muted-foreground py-2">A carregar parciais…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70 py-1.5 px-2 rounded-md bg-muted/20 border border-dashed border-border/40">
        <AlertCircle className="h-3 w-3" />
        Nenhuma OS parcial para {participantName} em {year}.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
        Pagamentos parciais ({items.length})
      </div>
      {items.map((it) => (
        <PartialRow
          key={it.id}
          item={it}
          formatCurrency={formatCurrency}
          onSave={(amount) => upsertEntry.mutate({ soId: it.id, amount })}
          onClear={() => upsertEntry.mutate({ soId: it.id, amount: 0 })}
          saving={upsertEntry.isPending}
        />
      ))}
    </div>
  );
}

function PartialRow({
  item,
  formatCurrency,
  onSave,
  onClear,
  saving,
}: {
  item: PartialSO;
  formatCurrency: (v: number) => string;
  onSave: (amount: number) => void;
  onClear: () => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(String(item.paid || ""));
  const [dirty, setDirty] = useState(false);

  // Reset draft if upstream value changes (e.g. after a save)
  useEffect(() => {
    setDraft(String(item.paid || ""));
    setDirty(false);
  }, [item.paid]);

  const remaining = Math.max(0, item.total - item.paid);
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
    onSave(num);
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
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={handleSave}
                disabled={saving}
              >
                <Save className="h-3.5 w-3.5 text-primary" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Guardar</TooltipContent>
          </Tooltip>
        )}
        {item.paid > 0 && !dirty && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={onClear}
                disabled={saving}
              >
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
