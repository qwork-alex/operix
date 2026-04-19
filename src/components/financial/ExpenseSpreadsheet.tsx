import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { Plus, Trash2, MoreVertical, Copy, Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  useAccountingExpensesByPeriod,
  ACCOUNTING_COLUMNS,
  type AccountingBucketKey,
} from "@/hooks/useAccountingExpensesByPeriod";

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
  filterYear?: string;
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

function parseNormalized(p: string): { month: number; year: string } | null {
  const m = p.match(/^(\w+)\/(\d{2})$/);
  if (!m) return null;
  const idx = MONTH_LABELS.indexOf(m[1]);
  if (idx === -1) return null;
  return { month: idx + 1, year: m[2] };
}

function periodSortKey(p: string): number {
  const parsed = parseNormalized(p);
  if (!parsed) return 0;
  return parseInt(parsed.year) * 100 + parsed.month;
}

/** Display month only (strip /YY suffix) */
function displayMonth(period: string): string {
  const slash = period.indexOf("/");
  return slash !== -1 ? period.substring(0, slash) : period;
}

const DEFAULT_COLUMNS: SpreadsheetColumn[] = [];

export function getDefaultColumns(): SpreadsheetColumn[] {
  return DEFAULT_COLUMNS.map((c) => ({ ...c }));
}

/* ── editable cell ── */
function EditableCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (!editing) {
    return (
      <div
        className="h-full w-full px-2 py-1.5 cursor-text text-center align-middle tabular-nums text-sm text-foreground hover:bg-muted/40 transition-colors rounded"
        onClick={() => { setDraft(value ? String(value) : ""); setEditing(true); }}
      >
        {value || "—"}
      </div>
    );
  }

  const commit = () => { onChange(parseFloat(draft) || 0); setEditing(false); };

  return (
    <Input ref={ref} type="number"
      className="h-7 text-sm text-center border-primary/50 bg-background"
      value={draft} onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
    />
  );
}

/* ── insert period button between rows ── */
function InsertPeriodButton({ suggestion, onInsert }: { suggestion: string | null; onInsert: (period: string) => void }) {
  const [hovering, setHovering] = useState(false);
  if (!suggestion) return null;
  return (
    <tr
      className="h-0 relative"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <td colSpan={100} className="p-0 border-0 relative">
        {hovering && (
          <button
            className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-colors"
            onClick={() => onInsert(suggestion)}
          >
            <Plus className="h-2.5 w-2.5" /> {displayMonth(suggestion)}
          </button>
        )}
      </td>
    </tr>
  );
}

/* ── detect missing period between two ── */
function getMissingSuggestion(current: string, next: string | null): string | null {
  const cp = parseNormalized(current);
  if (!cp) return null;
  const expectedMonth = cp.month + 1;
  let expectedYear = cp.year;
  let expectedMonthIdx = expectedMonth;
  if (expectedMonth > 12) {
    expectedMonthIdx = 1;
    expectedYear = String(parseInt(cp.year) + 1).slice(-2);
  }
  const expected = `${MONTH_LABELS[expectedMonthIdx - 1]}/${expectedYear}`;
  if (!next) return expected;
  if (next !== expected) return expected;
  return null;
}

/* ── main component ── */
export default function ExpenseSpreadsheet({ data, onChange, formatCurrency, filterYear }: Props) {
  const { data: accountingMap = {} } = useAccountingExpensesByPeriod();

  const sortedRows = useMemo(() => {
    let rows = [...data.rows].sort((a, b) => periodSortKey(a.period) - periodSortKey(b.period));
    if (filterYear) rows = rows.filter((r) => r.period.endsWith(`/${filterYear}`));
    return rows;
  }, [data.rows, filterYear]);

  // The single editable column: "Manual". We merge any pre-existing custom
  // columns into one logical Manual bucket per row (sum of all values).
  const manualForRow = useCallback((row: SpreadsheetRow) => {
    return data.columns.reduce((s, c) => s + (row.values[c.id] || 0), 0);
  }, [data.columns]);

  // Ensure there is exactly one "manual_main" column and update its value.
  const updateManualCell = useCallback((rowId: string, value: number) => {
    const MANUAL_ID = "manual_main";
    let columns = data.columns;
    if (!columns.some((c) => c.id === MANUAL_ID)) {
      columns = [...columns, { id: MANUAL_ID, label: "Manual", type: "custom" }];
    }
    const rows = data.rows.map((r) => {
      if (r.id !== rowId) return r;
      // Reset all legacy custom column values into the single manual column
      const cleared: Record<string, number> = {};
      cleared[MANUAL_ID] = value;
      return { ...r, values: cleared };
    });
    onChange({ columns, rows });
  }, [data, onChange]);

  const accValueFor = useCallback((period: string, bucket: AccountingBucketKey): number => {
    return accountingMap[period]?.[bucket] || 0;
  }, [accountingMap]);

  const rowAccTotal = useCallback((period: string) => {
    return ACCOUNTING_COLUMNS.reduce((s, c) => s + accValueFor(period, c.id), 0);
  }, [accValueFor]);

  const rowTotal = useCallback((row: SpreadsheetRow) => {
    return rowAccTotal(row.period) + manualForRow(row);
  }, [rowAccTotal, manualForRow]);

  const grandManual = sortedRows.reduce((s, r) => s + manualForRow(r), 0);
  const grandAccByBucket = (bucket: AccountingBucketKey) =>
    sortedRows.reduce((s, r) => s + accValueFor(r.period, bucket), 0);
  const grandTotal = sortedRows.reduce((s, r) => s + rowTotal(r), 0);

  const commitAddRow = (period: string) => {
    const newRow: SpreadsheetRow = { id: `row_${Date.now()}`, period, values: {} };
    onChange({ ...data, rows: [...data.rows, newRow] });
  };

  const removeRow = (rowId: string) => {
    onChange({ ...data, rows: data.rows.filter((r) => r.id !== rowId) });
  };

  const insertPeriod = (period: string) => {
    if (data.rows.some((r) => r.period === period)) { toast.error("Período já existe"); return; }
    commitAddRow(period);
  };

  return (
    <div className="space-y-3">
      {data.rows.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          Adicione um período para começar a registrar despesas
        </p>
      ) : (
        <div className="relative w-full overflow-auto border border-border/50 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="px-3 py-2 text-center align-middle text-xs font-medium text-muted-foreground w-20">Mês</th>
                {ACCOUNTING_COLUMNS.map((col) => (
                  <th
                    key={col.id}
                    className="px-2 py-2 text-center align-middle text-xs font-medium min-w-[100px]"
                    style={{ color: `hsl(${col.color})` }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>{col.label}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Lock className="h-2.5 w-2.5 opacity-50" />
                        </TooltipTrigger>
                        <TooltipContent>Somado da Contabilidade</TooltipContent>
                      </Tooltip>
                    </div>
                  </th>
                ))}
                <th className="px-2 py-2 text-center align-middle text-xs font-medium text-muted-foreground min-w-[100px]">
                  Manual
                </th>
                <th className="px-3 py-2 text-center align-middle text-xs font-semibold text-foreground w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, rowIdx) => (
                <React.Fragment key={row.id}>
                  <tr className="border-b border-border/30 hover:bg-muted/20 transition-colors group/row relative">
                    <td className="px-3 py-1.5 text-sm font-medium text-foreground text-center align-middle">{displayMonth(row.period)}</td>
                    {ACCOUNTING_COLUMNS.map((col) => {
                      const v = accValueFor(row.period, col.id);
                      return (
                        <td
                          key={col.id}
                          className="px-2 py-1.5 text-center align-middle tabular-nums text-sm bg-muted/10"
                          style={{ color: v > 0 ? `hsl(${col.color})` : undefined }}
                        >
                          {v > 0 ? formatCurrency(v) : "—"}
                        </td>
                      );
                    })}
                    <td className="px-1 py-0.5 text-center align-middle">
                      <EditableCell
                        value={manualForRow(row)}
                        onChange={(v) => updateManualCell(row.id, v)}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-center align-middle text-sm font-semibold tabular-nums text-foreground">
                      {formatCurrency(rowTotal(row))}
                    </td>
                    {/* Delete button — absolute overlay, outside table flow */}
                    <td className="p-0 w-0 border-0 relative">
                      <button
                        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full opacity-0 group-hover/row:opacity-100 transition-opacity text-destructive p-1"
                        onClick={() => removeRow(row.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                  <InsertPeriodButton
                    suggestion={getMissingSuggestion(row.period, sortedRows[rowIdx + 1]?.period || null)}
                    onInsert={insertPeriod}
                  />
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/50 bg-muted/20">
                <td className="px-3 py-2 text-xs font-semibold text-muted-foreground text-center align-middle">Total</td>
                {ACCOUNTING_COLUMNS.map((col) => (
                  <td
                    key={col.id}
                    className="px-2 py-2 text-center align-middle text-xs tabular-nums"
                    style={{ color: `hsl(${col.color})` }}
                  >
                    {formatCurrency(grandAccByBucket(col.id))}
                  </td>
                ))}
                <td className="px-2 py-2 text-center align-middle text-xs tabular-nums text-muted-foreground">
                  {formatCurrency(grandManual)}
                </td>
                <td className="px-3 py-2 text-center align-middle text-sm font-bold tabular-nums text-foreground">{formatCurrency(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
