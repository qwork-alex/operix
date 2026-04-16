import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

/* ── period normalization (shared logic) ── */
const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTH_MAP: Record<string, number> = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

export function normalizePeriod(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  const slashNum = t.match(/^(\d{1,2})\s*[\/\-]\s*(\d{2,4})$/);
  if (slashNum) {
    const m = parseInt(slashNum[1]);
    let y = slashNum[2];
    if (y.length === 4) y = y.slice(2);
    if (m >= 1 && m <= 12) return `${MONTH_LABELS[m - 1]}/${y}`;
  }
  const textNum = t.match(/^([a-zçã]+)\s*[\/\-\s]\s*(\d{2,4})$/);
  if (textNum) {
    const m = MONTH_MAP[textNum[1]];
    let y = textNum[2];
    if (y.length === 4) y = y.slice(2);
    if (m) return `${MONTH_LABELS[m - 1]}/${y}`;
  }
  return null;
}

export function getYearFromPeriod(period: string): string | null {
  const m = period.match(/\/(\d{2})$/);
  return m ? `20${m[1]}` : null;
}

export interface FinancialMovement {
  id: string;
  period: string;
  type: "loan" | "manual_entry";
  origin: string;
  amount: number;
  paidAmount: number;
  status: "pending" | "paid" | "partial";
}

interface Props {
  movements: FinancialMovement[];
  onChange: (movements: FinancialMovement[]) => void;
  formatCurrency: (v: number) => string;
  constrainToYear?: string; // e.g. "2024" — blocks periods outside this year
}

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

function EditablePeriodCell({ value, onChange, constrainToYear }: { value: string; onChange: (v: string) => void; constrainToYear?: string }) {
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
  const commit = () => {
    const norm = normalizePeriod(draft);
    if (!norm) {
      toast.error("Formato inválido. Use: Jan/25, 03/24, etc.");
      setEditing(false);
      return;
    }
    if (constrainToYear) {
      const periodYear = getYearFromPeriod(norm);
      if (periodYear && periodYear !== constrainToYear) {
        toast.error(`Este período não pertence ao ano ${constrainToYear}`);
        setEditing(false);
        return;
      }
    }
    onChange(norm);
    setEditing(false);
  };
  return (
    <Input ref={ref} className="h-7 text-sm text-center border-primary/50 bg-background"
      value={draft} onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
    />
  );
}

function EditableTextCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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

export default function FinancialMovements({ movements, onChange, formatCurrency, constrainToYear }: Props) {
  const addMovement = () => {
    const newMov: FinancialMovement = {
      id: `mov_${Date.now()}`,
      period: "",
      type: "loan",
      origin: "",
      amount: 0,
      paidAmount: 0,
      status: "pending",
    };
    onChange([...movements, newMov]);
  };

  const updateField = (id: string, field: keyof FinancialMovement, value: any) => {
    const updated = movements.map((m) => {
      if (m.id !== id) return m;
      const next = { ...m, [field]: value };

      // Period validation: enforce year constraint and prevent duplicates
      if (field === "period") {
        const norm = normalizePeriod(value);
        if (norm) {
          // Check duplicate
          if (movements.some((other) => other.id !== id && other.period === norm)) {
            toast.error("Período duplicado na movimentação");
            return m; // reject change
          }
          next.period = norm;
        }
      }

      // Auto-adjust status based on paidAmount
      if (field === "paidAmount") {
        const paid = parseFloat(value) || 0;
        if (paid <= 0) next.status = "pending";
        else if (paid >= next.amount) next.status = "paid";
        else next.status = "partial";
      }
      if (field === "status" && value !== "partial") {
        next.paidAmount = value === "paid" ? next.amount : 0;
      }
      return next;
    });
    onChange(updated);
  };

  const removeMovement = (id: string) => {
    onChange(movements.filter((m) => m.id !== id));
    toast.success("Movimentação removida");
  };

  const totalLoans = movements.filter((m) => m.type === "loan").reduce((s, m) => s + m.amount, 0);
  const pendingLoans = movements.filter((m) => m.type === "loan" && m.status !== "paid")
    .reduce((s, m) => s + (m.amount - (m.paidAmount || 0)), 0);

  return (
    <div className="space-y-3">
      {movements.length > 0 && (
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>Total: <strong className="text-foreground">{formatCurrency(totalLoans)}</strong></span>
          <span>Pendentes: <strong className="text-amber-400">{formatCurrency(pendingLoans)}</strong></span>
        </div>
      )}

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
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Origem</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-28">Valor</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-28">Valor pago</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-28">Restante</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-24">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {movements.map((mov) => {
                const remaining = Math.max(0, mov.amount - (mov.paidAmount || 0));
                return (
                  <tr key={mov.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors group/row">
                    <td className="px-1 py-0.5">
                      <EditablePeriodCell value={mov.period} onChange={(v) => updateField(mov.id, "period", v)} constrainToYear={constrainToYear} />
                    </td>
                    <td className="px-1 py-0.5">
                      <EditableTextCell value={mov.origin} onChange={(v) => updateField(mov.id, "origin", v)} />
                    </td>
                    <td className="px-1 py-0.5">
                      <EditableAmount value={mov.amount} onChange={(v) => updateField(mov.id, "amount", v)} />
                    </td>
                    <td className="px-1 py-0.5">
                      <EditableAmount value={mov.paidAmount || 0} onChange={(v) => updateField(mov.id, "paidAmount", v)} />
                    </td>
                    <td className="px-3 py-1.5 text-center text-sm tabular-nums text-muted-foreground">
                      {remaining > 0 ? (
                        <span className="text-amber-400">{formatCurrency(remaining)}</span>
                      ) : (
                        <span className="text-emerald-400">—</span>
                      )}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
