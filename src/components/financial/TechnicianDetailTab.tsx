import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  ChevronDown, ChevronRight, Plus, TrendingUp, TrendingDown,
  UserPlus, Users, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import ExpenseSpreadsheet, { SpreadsheetData, SpreadsheetRow, getDefaultColumns } from "./ExpenseSpreadsheet";
import FinancialMovements, { FinancialMovement, getYearFromPeriod } from "./FinancialMovements";

/* ── hooks ── */
function useTechnicians() {
  return useQuery({
    queryKey: ["tech-detail-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("technicians").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useTechFinancials() {
  return useQuery({
    queryKey: ["tech-financials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_records")
        .select("id, label, amount, type, notes, category")
        .in("type", ["expense_spreadsheet", "manual_revenue_expected", "manual_revenue_received", "financial_movements"]);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useAddTechnician() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      const { error } = await supabase.from("technicians").insert({ name });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tech-detail-list"] }); toast.success("Técnico adicionado"); },
    onError: (e) => toast.error("Erro: " + (e as Error).message),
  });
}

function useUpsertRevenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ techId, techName, type, amount, year }: { techId: string; techName: string; type: string; amount: number; year: string }) => {
      await supabase.from("financial_records").delete().eq("type", type).like("notes", `%tech:${techId}:year:${year}%`);
      const { error } = await supabase.from("financial_records").insert({
        type, source: "manual",
        label: type === "manual_revenue_expected" ? "Receita esperada" : "Receita recebida",
        amount, status: "confirmed",
        notes: `tech:${techId}:${techName}:year:${year}`,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tech-financials"] }),
  });
}

function useSaveSpreadsheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ techId, techName, spreadsheet }: { techId: string; techName: string; spreadsheet: SpreadsheetData }) => {
      await supabase.from("financial_records").delete().eq("type", "expense_spreadsheet").like("notes", `%tech:${techId}%`);
      const grandTotal = spreadsheet.rows.reduce((s, r) =>
        s + spreadsheet.columns.reduce((cs, c) => cs + (r.values[c.id] || 0), 0), 0);
      const { error } = await supabase.from("financial_records").insert({
        type: "expense_spreadsheet", source: "manual", label: "Despesas (planilha)",
        amount: grandTotal, status: "confirmed",
        notes: `tech:${techId}:${techName}`,
        category: JSON.stringify(spreadsheet),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tech-financials"] }),
  });
}

function useSaveMovements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ techId, techName, movements }: { techId: string; techName: string; movements: FinancialMovement[] }) => {
      await supabase.from("financial_records").delete().eq("type", "financial_movements").like("notes", `%tech:${techId}%`);
      const totalLoans = movements.filter((m) => m.type === "loan").reduce((s, m) => s + m.amount, 0);
      const { error } = await supabase.from("financial_records").insert({
        type: "financial_movements", source: "manual", label: "Movimentações financeiras",
        amount: totalLoans, status: "confirmed",
        notes: `tech:${techId}:${techName}`,
        category: JSON.stringify(movements),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tech-financials"] }),
  });
}

/* ── helpers ── */
interface TechData {
  id: string;
  name: string;
  spreadsheet: SpreadsheetData;
  movements: FinancialMovement[];
  revenueByYear: Record<string, { expected: number; received: number }>;
}

function buildTechData(tech: { id: string; name: string }, records: any[]): TechData {
  const mine = records.filter((r) => (r.notes || "").includes(`tech:${tech.id}`));

  // Revenue per year
  const revenueByYear: Record<string, { expected: number; received: number }> = {};
  mine.filter((r) => r.type === "manual_revenue_expected" || r.type === "manual_revenue_received").forEach((r) => {
    const yearMatch = (r.notes || "").match(/year:(\d{4})/);
    const year = yearMatch ? yearMatch[1] : "unknown";
    if (!revenueByYear[year]) revenueByYear[year] = { expected: 0, received: 0 };
    if (r.type === "manual_revenue_expected") revenueByYear[year].expected = r.amount;
    else revenueByYear[year].received = r.amount;
  });

  // Legacy revenue (no year tag) → try to assign to current year
  mine.filter((r) => (r.type === "manual_revenue_expected" || r.type === "manual_revenue_received") && !(r.notes || "").includes("year:")).forEach((r) => {
    const year = String(new Date().getFullYear());
    if (!revenueByYear[year]) revenueByYear[year] = { expected: 0, received: 0 };
    if (r.type === "manual_revenue_expected") revenueByYear[year].expected = r.amount;
    else revenueByYear[year].received = r.amount;
  });

  const ssRecord = mine.find((r) => r.type === "expense_spreadsheet");
  let spreadsheet: SpreadsheetData = { columns: getDefaultColumns(), rows: [] };
  if (ssRecord?.category) {
    try { const parsed = JSON.parse(ssRecord.category); if (parsed.columns && parsed.rows) spreadsheet = parsed; } catch { /* default */ }
  }

  const movRecord = mine.find((r) => r.type === "financial_movements");
  let movements: FinancialMovement[] = [];
  if (movRecord?.category) {
    try {
      const parsed = JSON.parse(movRecord.category);
      if (Array.isArray(parsed)) movements = parsed.map((m: any) => ({ ...m, paidAmount: m.paidAmount || 0 }));
    } catch { /* default */ }
  }

  return { id: tech.id, name: tech.name, spreadsheet, movements, revenueByYear };
}

/* ── year data helper ── */
interface YearBlockData {
  year: string;
  revenueExpected: number;
  revenueReceived: number;
  expenseRows: SpreadsheetRow[];
  totalExpenses: number;
  yearMovements: FinancialMovement[];
  loansPending: number;
  loansTotal: number;
  result: number;
}

function getYearBlocks(data: TechData, columns: { id: string }[]): YearBlockData[] {
  // Collect all years
  const years = new Set<string>();

  data.spreadsheet.rows.forEach((r) => {
    const y = getYearFromPeriod(r.period);
    if (y) years.add(y);
  });
  data.movements.forEach((m) => {
    const y = getYearFromPeriod(m.period);
    if (y) years.add(y);
  });
  Object.keys(data.revenueByYear).forEach((y) => { if (y !== "unknown") years.add(y); });

  if (years.size === 0) years.add(String(new Date().getFullYear()));

  return Array.from(years).sort().map((year) => {
    const yy = year.slice(2); // "25"
    const rev = data.revenueByYear[year] || { expected: 0, received: 0 };
    const expenseRows = data.spreadsheet.rows.filter((r) => r.period.endsWith(`/${yy}`));
    const totalExpenses = expenseRows.reduce((s, r) =>
      columns.reduce((cs, c) => cs + (r.values[c.id] || 0), s), 0);
    const yearMovements = data.movements.filter((m) => getYearFromPeriod(m.period) === year);
    const loansPending = yearMovements.filter((m) => m.type === "loan" && m.status !== "paid")
      .reduce((s, m) => s + (m.amount - (m.paidAmount || 0)), 0);
    const loansTotal = yearMovements.filter((m) => m.type === "loan").reduce((s, m) => s + m.amount, 0);
    const result = rev.received - totalExpenses - loansPending;

    return { year, revenueExpected: rev.expected, revenueReceived: rev.received, expenseRows, totalExpenses, yearMovements, loansPending, loansTotal, result };
  });
}

/* ── main component ── */
export default function TechnicianDetailTab() {
  const { data: technicians = [], isLoading: loadingTech } = useTechnicians();
  const { data: records = [], isLoading: loadingFin } = useTechFinancials();
  const { formatCurrency } = useLanguage();
  const [showAdd, setShowAdd] = useState(false);

  if (loadingTech || loadingFin) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" />)}</div>;
  }

  const techDataList = technicians.map((t) => buildTechData(t, records));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Análise financeira por técnico</h3>
        <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
          <UserPlus className="h-4 w-4 mr-1" /> Adicionar técnico
        </Button>
      </div>

      {techDataList.length === 0 && (
        <Card className="border-border/50 bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Adicione técnicos para começar a análise financeira</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              Os dados de receita e despesas serão geridos manualmente por técnico.
            </p>
            <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" /> Adicionar técnico</Button>
          </CardContent>
        </Card>
      )}

      {techDataList.map((td) => (
        <TechnicianCard key={td.id} data={td} formatCurrency={formatCurrency} />
      ))}

      <AddTechnicianModal open={showAdd} onOpenChange={setShowAdd} />
    </div>
  );
}

/* ── Add modal ── */
function AddTechnicianModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState("");
  const addTech = useAddTechnician();
  const handleSubmit = () => {
    if (!name.trim()) return;
    addTech.mutate({ name: name.trim() }, { onSuccess: () => { setName(""); onOpenChange(false); } });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Adicionar técnico</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nome do técnico *</Label>
            <Input placeholder="Nome completo" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || addTech.isPending}>{addTech.isPending ? "Salvando..." : "Adicionar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Technician card ── */
function TechnicianCard({ data, formatCurrency }: { data: TechData; formatCurrency: (v: number) => string }) {
  const [open, setOpen] = useState(false);
  const [localSpreadsheet, setLocalSpreadsheet] = useState<SpreadsheetData>(data.spreadsheet);
  const [localMovements, setLocalMovements] = useState<FinancialMovement[]>(data.movements);
  const saveSpreadsheet = useSaveSpreadsheet();
  const saveMovements = useSaveMovements();
  const upsertRevenue = useUpsertRevenue();

  const yearBlocks = useMemo(() => getYearBlocks(
    { ...data, spreadsheet: localSpreadsheet, movements: localMovements },
    localSpreadsheet.columns
  ), [data, localSpreadsheet, localMovements]);

  const globalResult = yearBlocks.reduce((s, yb) => s + yb.result, 0);
  const isPositive = globalResult >= 0;

  const handleSpreadsheetChange = useCallback((newData: SpreadsheetData) => {
    setLocalSpreadsheet(newData);
    saveSpreadsheet.mutate({ techId: data.id, techName: data.name, spreadsheet: newData });
  }, [data.id, data.name, saveSpreadsheet]);

  const handleMovementsChange = useCallback((newData: FinancialMovement[]) => {
    setLocalMovements(newData);
    saveMovements.mutate({ techId: data.id, techName: data.name, movements: newData });
  }, [data.id, data.name, saveMovements]);

  const handleRevenueSave = useCallback((year: string, type: string, amount: number) => {
    if (isNaN(amount)) return;
    upsertRevenue.mutate({ techId: data.id, techName: data.name, type, amount, year });
  }, [data.id, data.name, upsertRevenue]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Card className="border-border/50 cursor-pointer hover:border-primary/30 transition-colors">
          <CardContent className="py-3 px-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-base">{isPositive ? "🟢" : "🔴"}</span>
              <span className="font-medium text-foreground">{data.name}</span>
              <Badge variant={isPositive ? "outline" : "destructive"} className="text-[10px]">
                {isPositive ? "Empresa deve pagar" : "Em dívida"}
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              <span className={`text-sm font-medium tabular-nums ${isPositive ? "text-emerald-400" : "text-destructive"}`}>
                {formatCurrency(Math.abs(globalResult))}
              </span>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                {open ? <ChevronDown className="h-4 w-4" /> : "Ver detalhes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-3 space-y-4">
          {yearBlocks.map((yb) => (
            <YearBlock
              key={yb.year}
              block={yb}
              columns={localSpreadsheet.columns}
              allSpreadsheet={localSpreadsheet}
              allMovements={localMovements}
              onSpreadsheetChange={handleSpreadsheetChange}
              onMovementsChange={handleMovementsChange}
              onRevenueSave={handleRevenueSave}
              formatCurrency={formatCurrency}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ── Year Block ── */
function YearBlock({ block, columns, allSpreadsheet, allMovements, onSpreadsheetChange, onMovementsChange, onRevenueSave, formatCurrency }: {
  block: YearBlockData;
  columns: { id: string; label: string; type: string }[];
  allSpreadsheet: SpreadsheetData;
  allMovements: FinancialMovement[];
  onSpreadsheetChange: (d: SpreadsheetData) => void;
  onMovementsChange: (d: FinancialMovement[]) => void;
  onRevenueSave: (year: string, type: string, amount: number) => void;
  formatCurrency: (v: number) => string;
}) {
  const [open, setOpen] = useState(true);
  const isPositive = block.result >= 0;

  // Filter spreadsheet to only this year's rows for display,
  // but pass full data for saving
  const yearSuffix = block.year.slice(2);

  const handleYearMovementsChange = useCallback((yearMovements: FinancialMovement[]) => {
    // Replace this year's movements in the full list
    const otherMovements = allMovements.filter((m) => getYearFromPeriod(m.period) !== block.year);
    onMovementsChange([...otherMovements, ...yearMovements]);
  }, [allMovements, block.year, onMovementsChange]);

  return (
    <Card className="border-border/50 overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <Calendar className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">{block.year}</CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  {block.expenseRows.length} meses
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                {isPositive ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                <span className={`text-sm font-bold tabular-nums ${isPositive ? "text-emerald-400" : "text-destructive"}`}>
                  {formatCurrency(Math.abs(block.result))}
                </span>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-4 pb-4 space-y-4">
            {/* Revenue */}
            <YearRevenueSection
              year={block.year}
              expected={block.revenueExpected}
              received={block.revenueReceived}
              onSave={onRevenueSave}
              formatCurrency={formatCurrency}
            />

            {/* Movements (loans) */}
            <div className="space-y-2">
              <h4 className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Movimentações financeiras
              </h4>
              <FinancialMovements
                movements={block.yearMovements}
                onChange={handleYearMovementsChange}
                formatCurrency={formatCurrency}
              />
            </div>

            {/* Expenses */}
            <div className="space-y-2">
              <h4 className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Despesas (planilha financeira)
              </h4>
              <ExpenseSpreadsheet
                data={allSpreadsheet}
                onChange={onSpreadsheetChange}
                formatCurrency={formatCurrency}
                filterYear={yearSuffix}
              />
            </div>

            {/* Year Result */}
            <Card className={`border-border/50 ${isPositive ? "shadow-[0_0_15px_-5px_hsl(var(--chart-2)/0.3)]" : "shadow-[0_0_15px_-5px_hsl(var(--destructive)/0.3)]"}`}>
              <CardContent className="py-3 px-4">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    {isPositive ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                    <span className="text-sm font-medium text-muted-foreground">Resultado {block.year}</span>
                  </div>
                  <span className={`text-lg font-bold tabular-nums ${isPositive ? "text-emerald-400" : "text-destructive"}`}>
                    {formatCurrency(Math.abs(block.result))}
                  </span>
                </div>
                <div className="flex gap-4 text-[10px] text-muted-foreground mt-1">
                  <span>Despesas: {formatCurrency(block.totalExpenses)}</span>
                  {block.loansPending > 0 && <span className="text-amber-400">Empréstimos pendentes: {formatCurrency(block.loansPending)}</span>}
                  {block.loansTotal > 0 && <span>Empréstimos total: {formatCurrency(block.loansTotal)}</span>}
                </div>
                <p className={`text-xs mt-1 ${isPositive ? "text-emerald-400/80" : "text-destructive/80"}`}>
                  {isPositive
                    ? `Empresa deve pagar ao técnico: ${formatCurrency(block.result)}`
                    : `Técnico está em dívida com a empresa: ${formatCurrency(Math.abs(block.result))}`}
                </p>
              </CardContent>
            </Card>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/* ── Year Revenue Section ── */
function YearRevenueSection({ year, expected, received, onSave, formatCurrency }: {
  year: string; expected: number; received: number;
  onSave: (year: string, type: string, amount: number) => void;
  formatCurrency: (v: number) => string;
}) {
  const [localExpected, setLocalExpected] = useState(String(expected || ""));
  const [localReceived, setLocalReceived] = useState(String(received || ""));
  const difference = (Number(localExpected) || 0) - (Number(localReceived) || 0);

  return (
    <div className="space-y-2">
      <h4 className="text-xs text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1">
        <TrendingUp className="h-3 w-3" /> Receitas
      </h4>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Receita esperada</span>
          <Input type="number" className="h-8 text-sm text-right" value={localExpected}
            onChange={(e) => setLocalExpected(e.target.value)}
            onBlur={() => onSave(year, "manual_revenue_expected", parseFloat(localExpected) || 0)} />
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Receita recebida</span>
          <Input type="number" className="h-8 text-sm text-right" value={localReceived}
            onChange={(e) => setLocalReceived(e.target.value)}
            onBlur={() => onSave(year, "manual_revenue_received", parseFloat(localReceived) || 0)} />
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Diferença</span>
          <div className={`h-8 flex items-center justify-end px-3 text-sm font-medium tabular-nums rounded-md border border-border/50 bg-muted/30 ${difference > 0 ? "text-destructive" : difference < 0 ? "text-emerald-400" : "text-foreground"}`}>
            {difference > 0 ? "-" : difference < 0 ? "+" : ""}{formatCurrency(Math.abs(difference))}
          </div>
        </div>
      </div>
    </div>
  );
}
