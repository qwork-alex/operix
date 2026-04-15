import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export interface FinancialMovement {
  id: string;
  period: string;
  type: "loan" | "manual_entry";
  origin: string;
  amount: number;
  status: "pending" | "paid" | "partial";
}

interface Props {
  movements: FinancialMovement[];
  onChange: (movements: FinancialMovement[]) => void;
  formatCurrency: (v: number) => string;
}

const TYPE_LABELS: Record<string, string> = {
  loan: "Empréstimo",
  manual_entry: "Entrada manual",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  partial: "Parcial",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  partial: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

function EditableCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (!editing) {
    return (
      <div className="px-2 py-1.5 cursor-text text-sm text-foreground hover:bg-muted/40 rounded text-center"
        onClick={() => { setDraft(value); setEditing(true); }}>
        {value || "—"}
      </div>
    );
  }
  const commit = () => { onChange(draft); setEditing(false); };
  return (
    <Input ref={ref} className="h-7 text-sm text-center border-primary/50 bg-background"
      value={draft} onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
    />
  );
}

function EditableAmount({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (!editing) {
    return (
      <div className="px-2 py-1.5 cursor-text text-sm tabular-nums text-foreground hover:bg-muted/40 rounded text-center"
        onClick={() => { setDraft(value ? String(value) : ""); setEditing(true); }}>
        {value || "—"}
      </div>
    );
  }
  const commit = () => { onChange(parseFloat(draft) || 0); setEditing(false); };
  return (
    <Input ref={ref} type="number" className="h-7 text-sm text-center border-primary/50 bg-background"
      value={draft} onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
    />
  );
}

export default function FinancialMovements({ movements, onChange, formatCurrency }: Props) {
  const addMovement = () => {
    const newMov: FinancialMovement = {
      id: `mov_${Date.now()}`,
      period: "",
      type: "loan",
      origin: "",
      amount: 0,
      status: "pending",
    };
    onChange([...movements, newMov]);
  };

  const updateField = (id: string, field: keyof FinancialMovement, value: any) => {
    onChange(movements.map((m) => m.id === id ? { ...m, [field]: value } : m));
  };

  const removeMovement = (id: string) => {
    onChange(movements.filter((m) => m.id !== id));
    toast.success("Movimentação removida");
  };

  const totalLoans = movements.filter((m) => m.type === "loan").reduce((s, m) => s + m.amount, 0);
  const totalEntries = movements.filter((m) => m.type === "manual_entry").reduce((s, m) => s + m.amount, 0);
  const pendingLoans = movements.filter((m) => m.type === "loan" && m.status === "pending").reduce((s, m) => s + m.amount, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addMovement}>
          <Plus className="h-3 w-3 mr-1" /> Adicionar movimentação
        </Button>
        {movements.length > 0 && (
          <div className="flex items-center gap-3 ml-auto text-[10px] text-muted-foreground">
            <span>Empréstimos: <strong className="text-foreground">{formatCurrency(totalLoans)}</strong></span>
            <span>Pendentes: <strong className="text-amber-400">{formatCurrency(pendingLoans)}</strong></span>
            <span>Entradas: <strong className="text-foreground">{formatCurrency(totalEntries)}</strong></span>
          </div>
        )}
      </div>

      {movements.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          Nenhuma movimentação financeira registrada
        </p>
      ) : (
        <div className="relative w-full overflow-auto border border-border/50 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-24">Período</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-32">Tipo</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Origem</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-28">Valor</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-24">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {movements.map((mov) => (
                <tr key={mov.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors group/row">
                  <td className="px-1 py-0.5">
                    <EditableCell value={mov.period} onChange={(v) => updateField(mov.id, "period", v)} />
                  </td>
                  <td className="px-1 py-0.5">
                    <Select value={mov.type} onValueChange={(v) => updateField(mov.id, "type", v)}>
                      <SelectTrigger className="h-7 text-xs border-0 bg-transparent justify-center">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="loan">Empréstimo</SelectItem>
                        <SelectItem value="manual_entry">Entrada manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-1 py-0.5">
                    <EditableCell value={mov.origin} onChange={(v) => updateField(mov.id, "origin", v)} />
                  </td>
                  <td className="px-1 py-0.5">
                    <EditableAmount value={mov.amount} onChange={(v) => updateField(mov.id, "amount", v)} />
                  </td>
                  <td className="px-1 py-0.5 text-center">
                    <Select value={mov.status} onValueChange={(v) => updateField(mov.id, "status", v)}>
                      <SelectTrigger className="h-7 text-xs border-0 bg-transparent justify-center">
                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[mov.status]}`}>
                          {STATUS_LABELS[mov.status]}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pendente</SelectItem>
                        <SelectItem value="paid">Pago</SelectItem>
                        <SelectItem value="partial">Parcial</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-1 py-1">
                    <button className="opacity-0 group-hover/row:opacity-100 transition-opacity text-destructive" onClick={() => removeMovement(mov.id)}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
