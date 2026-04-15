import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

/* ── types ── */
export interface SpreadsheetColumn {
  id: string;
  label: string;
  type: "fixed" | "custom";
}

export interface SpreadsheetRow {
  id: string;
  period: string;
  values: Record<string, number>;
}

export interface SpreadsheetData {
  columns: SpreadsheetColumn[];
  rows: SpreadsheetRow[];
}

interface Props {
  data: SpreadsheetData;
  onChange: (data: SpreadsheetData) => void;
  formatCurrency: (v: number) => string;
}

/* ── period helpers ── */
const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTH_MAP: Record<string, number> = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function normalizePeriod(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  // "01/2025" or "1/2025"
  const slashNum = t.match(/^(\d{1,2})\s*[\/\-]\s*(\d{2,4})$/);
  if (slashNum) {
    const m = parseInt(slashNum[1]);
    let y = slashNum[2];
    if (y.length === 4) y = y.slice(2);
    if (m >= 1 && m <= 12) return `${MONTH_LABELS[m - 1]}/${y}`;
  }
  // "jan/25" or "janeiro 2025"
  const textNum = t.match(/^([a-zçã]+)\s*[\/\-\s]\s*(\d{2,4})$/);
  if (textNum) {
    const m = MONTH_MAP[textNum[1]];
    let y = textNum[2];
    if (y.length === 4) y = y.slice(2);
    if (m) return `${MONTH_LABELS[m - 1]}/${y}`;
  }
  return null;
}

function parseNormalized(p: string): { month: number; year: string } | null {
  const m = p.match(/^(\w+)\/(\d{2})$/);
  if (!m) return null;
  const idx = MONTH_LABELS.indexOf(m[1]);
  if (idx === -1) return null;
  return { month: idx + 1, year: m[2] };
}

const DEFAULT_COLUMNS: SpreadsheetColumn[] = [
  { id: "salario", label: "Salário", type: "fixed" },
  { id: "encargos", label: "Encargos sociais", type: "fixed" },
  { id: "impostos", label: "Impostos", type: "fixed" },
];

export function getDefaultColumns(): SpreadsheetColumn[] {
  return DEFAULT_COLUMNS.map((c) => ({ ...c }));
}

/* ── editable cell ── */
function EditableCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <div
        className="h-full w-full px-2 py-1.5 cursor-text text-right tabular-nums text-sm text-foreground hover:bg-muted/40 transition-colors rounded"
        onClick={() => { setDraft(value ? String(value) : ""); setEditing(true); }}
      >
        {value || "—"}
      </div>
    );
  }

  const commit = () => {
    const n = parseFloat(draft) || 0;
    onChange(n);
    setEditing(false);
  };

  return (
    <Input
      ref={ref}
      type="number"
      className="h-7 text-sm text-right border-primary/50 bg-background"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
    />
  );
}

/* ── main component ── */
export default function ExpenseSpreadsheet({ data, onChange, formatCurrency }: Props) {
  const [showAddCol, setShowAddCol] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [periodDraft, setPeriodDraft] = useState("");
  const [autoFillPrompt, setAutoFillPrompt] = useState<{ period: string; year: string; startMonth: number } | null>(null);

  const updateCell = useCallback((rowId: string, colId: string, value: number) => {
    const rows = data.rows.map((r) =>
      r.id === rowId ? { ...r, values: { ...r.values, [colId]: value } } : r
    );
    onChange({ ...data, rows });
  }, [data, onChange]);

  const addColumn = () => {
    if (!newColName.trim()) return;
    const id = `custom_${Date.now()}`;
    onChange({ ...data, columns: [...data.columns, { id, label: newColName.trim(), type: "custom" }] });
    setNewColName("");
    setShowAddCol(false);
    toast.success("Coluna adicionada");
  };

  const removeColumn = (colId: string) => {
    const cols = data.columns.filter((c) => c.id !== colId);
    const rows = data.rows.map((r) => {
      const values = { ...r.values };
      delete values[colId];
      return { ...r, values };
    });
    onChange({ columns: cols, rows });
    toast.success("Coluna removida");
  };

  const renameColumn = (colId: string, label: string) => {
    const cols = data.columns.map((c) => (c.id === colId ? { ...c, label } : c));
    onChange({ ...data, columns: cols });
  };

  const addRow = () => {
    const norm = normalizePeriod(periodDraft);
    if (!norm) { toast.error("Formato inválido. Use: Jan/25, 01/2025 ou janeiro 2025"); return; }
    if (data.rows.some((r) => r.period === norm)) { toast.error("Período já existe"); return; }

    const parsed = parseNormalized(norm);
    if (parsed && parsed.month < 12) {
      setAutoFillPrompt({ period: norm, year: parsed.year, startMonth: parsed.month });
    } else {
      commitAddRow(norm);
    }
    setPeriodDraft("");
  };

  const commitAddRow = (period: string) => {
    const newRow: SpreadsheetRow = { id: `row_${Date.now()}`, period, values: {} };
    onChange({ ...data, rows: [...data.rows, newRow] });
  };

  const autoFillYear = (replace: boolean) => {
    if (!autoFillPrompt) return;
    const { year, startMonth } = autoFillPrompt;
    let rows = [...data.rows];

    for (let m = startMonth; m <= 12; m++) {
      const p = `${MONTH_LABELS[m - 1]}/${year}`;
      const exists = rows.find((r) => r.period === p);
      if (exists && !replace) continue;
      if (exists && replace) {
        rows = rows.map((r) => (r.period === p ? { ...r, values: {} } : r));
      } else {
        rows.push({ id: `row_${Date.now()}_${m}`, period: p, values: {} });
      }
    }
    onChange({ ...data, rows });
    setAutoFillPrompt(null);
    toast.success("Períodos preenchidos");
  };

  const removeRow = (rowId: string) => {
    onChange({ ...data, rows: data.rows.filter((r) => r.id !== rowId) });
  };

  const rowTotal = (row: SpreadsheetRow) =>
    data.columns.reduce((s, c) => s + (row.values[c.id] || 0), 0);

  const grandTotal = data.rows.reduce((s, r) => s + rowTotal(r), 0);

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Período: jan/25, 01/2025..."
          className="h-8 w-48 text-sm"
          value={periodDraft}
          onChange={(e) => setPeriodDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addRow()}
        />
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addRow}>
          <Plus className="h-3 w-3 mr-1" /> Linha
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowAddCol(true)}>
          <Plus className="h-3 w-3 mr-1" /> Coluna
        </Button>
      </div>

      {/* table */}
      {data.rows.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          Adicione um período para começar a registrar despesas
        </p>
      ) : (
        <div className="relative w-full overflow-auto border border-border/50 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-24">Período</th>
                {data.columns.map((col) => (
                  <th key={col.id} className="px-2 py-2 text-right text-xs font-medium text-muted-foreground min-w-[100px] group">
                    <div className="flex items-center justify-end gap-1">
                      <EditableHeader label={col.label} onChange={(v) => renameColumn(col.id, v)} />
                      {col.type === "custom" && (
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                          onClick={() => removeColumn(col.id)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-xs font-semibold text-foreground w-28">Total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors group/row">
                  <td className="px-3 py-1 text-sm font-medium text-foreground">{row.period}</td>
                  {data.columns.map((col) => (
                    <td key={col.id} className="px-1 py-0.5">
                      <EditableCell
                        value={row.values[col.id] || 0}
                        onChange={(v) => updateCell(row.id, col.id, v)}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-1 text-right text-sm font-semibold tabular-nums text-foreground">
                    {formatCurrency(rowTotal(row))}
                  </td>
                  <td className="px-1 py-1">
                    <button
                      className="opacity-0 group-hover/row:opacity-100 transition-opacity text-destructive"
                      onClick={() => removeRow(row.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/50 bg-muted/20">
                <td className="px-3 py-2 text-xs font-semibold text-muted-foreground">Total geral</td>
                {data.columns.map((col) => {
                  const colTotal = data.rows.reduce((s, r) => s + (r.values[col.id] || 0), 0);
                  return (
                    <td key={col.id} className="px-2 py-2 text-right text-xs tabular-nums text-muted-foreground">
                      {formatCurrency(colTotal)}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-foreground">
                  {formatCurrency(grandTotal)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* add column dialog */}
      <Dialog open={showAddCol} onOpenChange={setShowAddCol}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Adicionar coluna</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Nome da coluna</Label>
            <Input
              placeholder="Ex: Combustível, Hotel..."
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addColumn()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCol(false)}>Cancelar</Button>
            <Button onClick={addColumn} disabled={!newColName.trim()}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* auto-fill dialog */}
      <Dialog open={!!autoFillPrompt} onOpenChange={() => { if (autoFillPrompt) { commitAddRow(autoFillPrompt.period); setAutoFillPrompt(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Preencher automaticamente?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Deseja preencher automaticamente até Dezembro/{autoFillPrompt?.year}?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { if (autoFillPrompt) commitAddRow(autoFillPrompt.period); setAutoFillPrompt(null); }}>
              Não, apenas este mês
            </Button>
            <Button onClick={() => autoFillYear(false)}>
              Sim, preencher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── editable header ── */
function EditableHeader({ label, onChange }: { label: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (!editing) {
    return (
      <span className="cursor-text" onDoubleClick={() => { setDraft(label); setEditing(true); }}>
        {label}
      </span>
    );
  }

  const commit = () => { if (draft.trim()) onChange(draft.trim()); setEditing(false); };

  return (
    <Input
      ref={ref}
      className="h-6 text-xs w-24 text-right"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
    />
  );
}
