import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChevronDown, ChevronRight, Plus, TrendingUp, TrendingDown,
  Users, Calendar, Trash2, Building2,
} from "lucide-react";
import { toast } from "sonner";
import ExpenseSpreadsheet, { SpreadsheetData, SpreadsheetRow, getDefaultColumns } from "./ExpenseSpreadsheet";
import FinancialMovements, { FinancialMovement, getYearFromPeriod, normalizePeriod } from "./FinancialMovements";

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

function useDeleteTechFinancials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ techId }: { techId: string }) => {
      // Delete financial records
      const { error: frError } = await supabase.from("financial_records").delete().like("notes", `%tech:${techId}%`);
      if (frError) throw frError;
      // Delete the technician itself
      const { error: tError } = await supabase.from("technicians").delete().eq("id", techId);
      if (tError) throw tError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tech-financials"] });
      qc.invalidateQueries({ queryKey: ["tech-detail-list"] });
      toast.success("Técnico e análise financeira apagados");
    },
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

  const revenueByYear: Record<string, { expected: number; received: number }> = {};
  mine.filter((r) => r.type === "manual_revenue_expected" || r.type === "manual_revenue_received").forEach((r) => {
    const yearMatch = (r.notes || "").match(/year:(\d{4})/);
    const year = yearMatch ? yearMatch[1] : "unknown";
    if (!revenueByYear[year]) revenueByYear[year] = { expected: 0, received: 0 };
    if (r.type === "manual_revenue_expected") revenueByYear[year].expected = r.amount;
    else revenueByYear[year].received = r.amount;
  });

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
  const years = new Set<string>();
  data.spreadsheet.rows.forEach((r) => { const y = getYearFromPeriod(r.period); if (y) years.add(y); });
  data.movements.forEach((m) => { const y = getYearFromPeriod(m.period); if (y) years.add(y); });
  Object.keys(data.revenueByYear).forEach((y) => {
    if (y !== "unknown") {
      const rev = data.revenueByYear[y];
      if (rev.expected !== 0 || rev.received !== 0) years.add(y);
    }
  });
  // No auto-generation — if empty, return empty array

  return Array.from(years).sort().map((year) => {
    const yy = year.slice(2);
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
export default function TechnicianDetailTab({ showAddModal, onShowAddModal }: { showAddModal?: boolean; onShowAddModal?: (v: boolean) => void }) {
  const { data: technicians = [], isLoading: loadingTech } = useTechnicians();
  const { data: records = [], isLoading: loadingFin } = useTechFinancials();
  const { formatCurrency } = useLanguage();
  const [localShowAdd, setLocalShowAdd] = useState(false);

  const showAdd = showAddModal ?? localShowAdd;
  const setShowAdd = onShowAddModal ?? setLocalShowAdd;

  if (loadingTech || loadingFin) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-muted/30 rounded-lg animate-pulse" />)}</div>;
  }

  const techDataList = technicians.map((t) => buildTechData(t, records));

  const companyTotal = techDataList.reduce((sum, td) => {
    const blocks = getYearBlocks(td, td.spreadsheet.columns);
    return sum + blocks.reduce((s, yb) => s + yb.result, 0);
  }, 0);

  return (
    <div className="space-y-6">
      {techDataList.length === 0 && (
        <Card className="border-border/50 bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum técnico registado</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              Adicione técnicos para iniciar a análise financeira.
            </p>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" onClick={() => setShowAdd(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Adicionar técnico</TooltipContent>
            </Tooltip>
          </CardContent>
        </Card>
      )}

      {/* Technician list */}
      {techDataList.length > 0 && (
        <div className="space-y-1.5">
          {techDataList.map((td) => (
            <TechnicianRow key={td.id} data={td} formatCurrency={formatCurrency} />
          ))}
        </div>
      )}

      {/* Company balance — structured card */}
      {techDataList.length > 0 && (
        <Card className={`border-border/50 bg-muted/20 ${companyTotal > 0 ? "shadow-[0_0_20px_-4px_hsl(var(--success)/0.15)]" : companyTotal < 0 ? "shadow-[0_0_20px_-4px_hsl(var(--destructive)/0.15)]" : ""}`}>
          <CardContent className="flex items-center justify-between py-4 px-5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-semibold text-foreground">Balanço da empresa</span>
            </div>
            <span className={`text-lg font-bold tabular-nums ${companyTotal >= 0 ? "text-emerald-400" : "text-destructive"}`}>
              {companyTotal < 0 ? "- " : ""}{formatCurrency(Math.abs(companyTotal))}
            </span>
          </CardContent>
        </Card>
      )}

      <AddTechnicianModal open={showAdd} onOpenChange={setShowAdd} />
    </div>
  );
}

/* ── Add modal (simplified) ── */
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
        <DialogHeader><DialogTitle>Adicionar</DialogTitle></DialogHeader>
        <div className="py-2">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input placeholder="Digite o nome" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
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

/* ── Technician row ── */
function TechnicianRow({ data, formatCurrency }: { data: TechData; formatCurrency: (v: number) => string }) {
  const [open, setOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [localSpreadsheet, setLocalSpreadsheet] = useState<SpreadsheetData>(data.spreadsheet);
  const [localMovements, setLocalMovements] = useState<FinancialMovement[]>(data.movements);
  const saveSpreadsheet = useSaveSpreadsheet();
  const saveMovements = useSaveMovements();
  const upsertRevenue = useUpsertRevenue();
  const deleteTechFin = useDeleteTechFinancials();

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

  const handleDeleteYear = useCallback((year: string) => {
    const yy = year.slice(2);
    const newRows = localSpreadsheet.rows.filter((r) => !r.period.endsWith(`/${yy}`));
    const newSS = { ...localSpreadsheet, rows: newRows };
    setLocalSpreadsheet(newSS);
    saveSpreadsheet.mutate({ techId: data.id, techName: data.name, spreadsheet: newSS });

    const newMovements = localMovements.filter((m) => getYearFromPeriod(m.period) !== year);
    setLocalMovements(newMovements);
    saveMovements.mutate({ techId: data.id, techName: data.name, movements: newMovements });

    // Delete revenue for that year
    upsertRevenue.mutate({ techId: data.id, techName: data.name, type: "manual_revenue_expected", amount: 0, year });
    upsertRevenue.mutate({ techId: data.id, techName: data.name, type: "manual_revenue_received", amount: 0, year });
    toast.success(`Período ${year} removido`);
  }, [data.id, data.name, localSpreadsheet, localMovements, saveSpreadsheet, saveMovements, upsertRevenue]);

  const handleAddPeriod = useCallback((rawPeriod: string, constrainYear?: string) => {
    const normalized = normalizePeriod(rawPeriod);
    if (!normalized) {
      toast.error("Formato inválido. Use: Jan/25, 03/24, etc.");
      return;
    }
    // If constrained to a year, force the year suffix
    let finalPeriod = normalized;
    if (constrainYear) {
      const yy = constrainYear.slice(2);
      const monthPart = normalized.split("/")[0];
      finalPeriod = `${monthPart}/${yy}`;
    }
    if (localSpreadsheet.rows.some((r) => r.period === finalPeriod)) {
      toast.error("Período já existe");
      return;
    }
    const newRow: import("./ExpenseSpreadsheet").SpreadsheetRow = { id: `row_${Date.now()}`, period: finalPeriod, values: {} };
    const newSS = { ...localSpreadsheet, rows: [...localSpreadsheet.rows, newRow] };
    setLocalSpreadsheet(newSS);
    saveSpreadsheet.mutate({ techId: data.id, techName: data.name, spreadsheet: newSS });
    toast.success(`Período ${finalPeriod} criado`);
  }, [localSpreadsheet, data.id, data.name, saveSpreadsheet]);

  const handleAddYear = useCallback(() => {
    const existingYears = yearBlocks.map((yb) => parseInt(yb.year)).filter((y) => !isNaN(y));
    const nextYear = existingYears.length > 0 ? Math.max(...existingYears) + 1 : new Date().getFullYear();
    const yy = String(nextYear).slice(2);
    const firstPeriod = `Jan/${yy}`;
    if (localSpreadsheet.rows.some((r) => r.period === firstPeriod)) {
      toast.error(`Período ${firstPeriod} já existe`);
      return;
    }
    const newRow: import("./ExpenseSpreadsheet").SpreadsheetRow = { id: `row_${Date.now()}`, period: firstPeriod, values: {} };
    const newSS = { ...localSpreadsheet, rows: [...localSpreadsheet.rows, newRow] };
    setLocalSpreadsheet(newSS);
    saveSpreadsheet.mutate({ techId: data.id, techName: data.name, spreadsheet: newSS });
    upsertRevenue.mutate({ techId: data.id, techName: data.name, type: "manual_revenue_expected", amount: 0, year: String(nextYear) });
    upsertRevenue.mutate({ techId: data.id, techName: data.name, type: "manual_revenue_received", amount: 0, year: String(nextYear) });
    toast.success(`Ano ${nextYear} criado`);
  }, [yearBlocks, localSpreadsheet, data.id, data.name, saveSpreadsheet, upsertRevenue]);

  const handleRenameYear = useCallback((oldYear: string, newYear: string) => {
    if (oldYear === newYear) return;
    const oldYY = oldYear.slice(2);
    const newYY = newYear.slice(2);
    const newRows = localSpreadsheet.rows.map((r) =>
      r.period.endsWith(`/${oldYY}`) ? { ...r, period: r.period.replace(`/${oldYY}`, `/${newYY}`) } : r
    );
    const newSS = { ...localSpreadsheet, rows: newRows };
    setLocalSpreadsheet(newSS);
    saveSpreadsheet.mutate({ techId: data.id, techName: data.name, spreadsheet: newSS });

    const newMovements = localMovements.map((m) => {
      const y = getYearFromPeriod(m.period);
      if (y === oldYear) return { ...m, period: m.period.replace(`/${oldYY}`, `/${newYY}`) };
      return m;
    });
    setLocalMovements(newMovements);
    saveMovements.mutate({ techId: data.id, techName: data.name, movements: newMovements });

    upsertRevenue.mutate({ techId: data.id, techName: data.name, type: "manual_revenue_expected", amount: data.revenueByYear[oldYear]?.expected || 0, year: newYear });
    upsertRevenue.mutate({ techId: data.id, techName: data.name, type: "manual_revenue_received", amount: data.revenueByYear[oldYear]?.received || 0, year: newYear });
    upsertRevenue.mutate({ techId: data.id, techName: data.name, type: "manual_revenue_expected", amount: 0, year: oldYear });
    upsertRevenue.mutate({ techId: data.id, techName: data.name, type: "manual_revenue_received", amount: 0, year: oldYear });
    toast.success(`Período renomeado para ${newYear}`);
  }, [localSpreadsheet, localMovements, data, saveSpreadsheet, saveMovements, upsertRevenue]);

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <div className="group grid grid-cols-[1fr_auto_auto] items-center px-4 py-3 rounded-lg border border-border/40 cursor-pointer hover:border-primary/30 hover:bg-muted/20 transition-all">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`h-2 w-2 rounded-full shrink-0 ${isPositive ? "bg-emerald-400" : "bg-destructive"}`} />
              <span className="text-sm font-medium text-foreground truncate">{data.name}</span>
            </div>
            <span className={`text-sm font-semibold tabular-nums justify-self-center ${isPositive ? "text-emerald-400" : "text-destructive"}`}>
              {globalResult < 0 ? "- " : ""}{formatCurrency(Math.abs(globalResult))}
            </span>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              <button
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10"
                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
              </button>
              {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 ml-2 space-y-4">
            {yearBlocks.length === 0 && (
              <EmptyTechDetail techId={data.id} techName={data.name} onAddPeriod={handleAddPeriod} onRevenueSave={handleRevenueSave} />
            )}
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
                onDeleteYear={handleDeleteYear}
                onAddPeriod={handleAddPeriod}
                onRenameYear={handleRenameYear}
              />
            ))}
            {/* Add next year button */}
            {yearBlocks.length > 0 && (
              <div className="flex justify-center group/addyear">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="opacity-0 group-hover/addyear:opacity-100 transition-opacity p-1.5 rounded-full hover:bg-primary/10 border border-transparent hover:border-primary/20"
                      onClick={handleAddYear}
                    >
                      <Plus className="h-4 w-4 text-primary" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Criar próximo ano</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja apagar esta análise?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os dados financeiros de <strong>{data.name}</strong> (receitas, despesas e movimentações) serão apagados permanentemente. O técnico será removido da lista.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTechFin.mutate({ techId: data.id })}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ── Empty tech detail — shows when no year blocks exist ── */
function EmptyTechDetail({ techId, techName, onAddPeriod, onRevenueSave }: {
  techId: string; techName: string;
  onAddPeriod: (period: string) => void;
  onRevenueSave: (year: string, type: string, amount: number) => void;
}) {
  const currentYear = String(new Date().getFullYear());
  const [periodInput, setPeriodInput] = useState("");

  const handleCreateYear = () => {
    onAddPeriod(`Jan/${currentYear.slice(2)}`);
    onRevenueSave(currentYear, "manual_revenue_expected", 0);
    onRevenueSave(currentYear, "manual_revenue_received", 0);
  };

  return (
    <Card className="border-border/50 bg-muted/20">
      <CardContent className="flex flex-col items-center justify-center py-8 text-center space-y-3">
        <Calendar className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Nenhum período registado para <strong>{techName}</strong>.</p>
        <div className="flex items-center gap-2">
          <Input
            className="h-8 w-28 text-xs"
            placeholder="Ex: Jan/25"
            value={periodInput}
            onChange={(e) => setPeriodInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && periodInput.trim()) { onAddPeriod(periodInput.trim()); setPeriodInput(""); } }}
          />
          {periodInput.trim() && (
            <button className="p-1 rounded hover:bg-primary/10 text-primary" onClick={() => { onAddPeriod(periodInput.trim()); setPeriodInput(""); }}>
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleCreateYear}>
          Criar período {currentYear}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ── Year Block ── */
function YearBlock({ block, columns, allSpreadsheet, allMovements, onSpreadsheetChange, onMovementsChange, onRevenueSave, formatCurrency, onDeleteYear, onAddPeriod, onRenameYear }: {
  block: YearBlockData;
  columns: { id: string; label: string; type: string }[];
  allSpreadsheet: SpreadsheetData;
  allMovements: FinancialMovement[];
  onSpreadsheetChange: (d: SpreadsheetData) => void;
  onMovementsChange: (d: FinancialMovement[]) => void;
  onRevenueSave: (year: string, type: string, amount: number) => void;
  formatCurrency: (v: number) => string;
  onDeleteYear: (year: string) => void;
  onAddPeriod: (period: string) => void;
  onRenameYear: (oldYear: string, newYear: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [showDeleteYear, setShowDeleteYear] = useState(false);
  const [showDeleteMovements, setShowDeleteMovements] = useState(false);
  const [editingYear, setEditingYear] = useState(false);
  const [yearDraft, setYearDraft] = useState(block.year);
  const [newPeriodInput, setNewPeriodInput] = useState("");
  const isPositive = block.result >= 0;
  const yearSuffix = block.year.slice(2);

  const handleYearMovementsChange = useCallback((yearMovements: FinancialMovement[]) => {
    const otherMovements = allMovements.filter((m) => getYearFromPeriod(m.period) !== block.year);
    onMovementsChange([...otherMovements, ...yearMovements]);
  }, [allMovements, block.year, onMovementsChange]);

  const handleDeleteAllMovements = () => {
    const otherMovements = allMovements.filter((m) => getYearFromPeriod(m.period) !== block.year);
    onMovementsChange(otherMovements);
    setShowDeleteMovements(false);
    toast.success("Movimentações removidas");
  };

  return (
    <Card className="border-border/50 overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <Calendar className="h-4 w-4 text-primary" />
                {editingYear ? (
                  <Input
                    className="h-6 w-20 text-sm font-semibold text-center"
                    value={yearDraft}
                    autoFocus
                    onChange={(e) => setYearDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => { onRenameYear(block.year, yearDraft.trim()); setEditingYear(false); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { onRenameYear(block.year, yearDraft.trim()); setEditingYear(false); }
                      if (e.key === "Escape") { setYearDraft(block.year); setEditingYear(false); }
                    }}
                  />
                ) : (
                  <CardTitle className="text-sm font-semibold cursor-text" onClick={(e) => { e.stopPropagation(); setYearDraft(block.year); setEditingYear(true); }}>{block.year}</CardTitle>
                )}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="p-1 rounded hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); setShowDeleteYear(true); }}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Excluir período</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isPositive ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                <span className={`text-sm font-bold tabular-nums ${isPositive ? "text-emerald-400" : "text-destructive"}`}>
                  {formatCurrency(Math.abs(block.result))}
                </span>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-4 pb-4 space-y-5">
            <YearRevenueSection year={block.year} expected={block.revenueExpected} received={block.revenueReceived} onSave={onRevenueSave} formatCurrency={formatCurrency} />

            <div className="space-y-2">
              <div className="flex items-center gap-2 group/movheader">
                <h4 className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Movimentações</h4>
                <div className="flex items-center gap-1 opacity-0 group-hover/movheader:opacity-100 transition-opacity">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="p-0.5 rounded hover:bg-primary/10" onClick={() => {
                        const newMov: FinancialMovement = {
                          id: `mov_${Date.now()}`, period: `Jan/${yearSuffix}`, type: "loan",
                          origin: "", amount: 0, paidAmount: 0, status: "pending",
                        };
                        handleYearMovementsChange([...block.yearMovements, newMov]);
                      }}>
                        <Plus className="h-3.5 w-3.5 text-primary" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Adicionar movimentação</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="p-0.5 rounded hover:bg-destructive/10" onClick={() => setShowDeleteMovements(true)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Excluir movimentações</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <FinancialMovements movements={block.yearMovements} onChange={handleYearMovementsChange} formatCurrency={formatCurrency} constrainToYear={block.year} />
            </div>

            <div className="space-y-2">
              <h4 className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Despesas</h4>
              <div className="flex items-center gap-2">
                <Input
                  className="h-7 w-28 text-xs"
                  placeholder="Ex: Jan/25"
                  value={newPeriodInput}
                  onChange={(e) => setNewPeriodInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newPeriodInput.trim()) {
                      onAddPeriod(newPeriodInput.trim());
                      setNewPeriodInput("");
                    }
                  }}
                />
                {newPeriodInput.trim() && (
                  <button
                    className="p-1 rounded hover:bg-primary/10 text-primary"
                    onClick={() => { onAddPeriod(newPeriodInput.trim()); setNewPeriodInput(""); }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <ExpenseSpreadsheet data={allSpreadsheet} onChange={onSpreadsheetChange} formatCurrency={formatCurrency} filterYear={yearSuffix} />
            </div>

            {/* Year Result */}
            <div className={`flex items-center justify-between px-4 py-3 rounded-lg border ${isPositive ? "border-emerald-400/20 bg-emerald-400/5" : "border-destructive/20 bg-destructive/5"}`}>
              <div className="flex items-center gap-2">
                {isPositive ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                <span className="text-sm font-medium text-muted-foreground">Resultado {block.year}</span>
              </div>
              <div className="text-right">
                <span className={`text-base font-bold tabular-nums ${isPositive ? "text-emerald-400" : "text-destructive"}`}>
                  {formatCurrency(Math.abs(block.result))}
                </span>
                <div className="flex gap-3 text-[10px] text-muted-foreground mt-0.5">
                  <span>Despesas: {formatCurrency(block.totalExpenses)}</span>
                  {block.loansPending > 0 && <span className="text-amber-400">Pendente: {formatCurrency(block.loansPending)}</span>}
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      {/* Delete year confirm */}
      <AlertDialog open={showDeleteYear} onOpenChange={setShowDeleteYear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja excluir?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os dados do período <strong>{block.year}</strong> (receitas, despesas e movimentações) serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onDeleteYear(block.year)}>
              Sim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete movements confirm */}
      <AlertDialog open={showDeleteMovements} onOpenChange={setShowDeleteMovements}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja excluir?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as movimentações de <strong>{block.year}</strong> serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteAllMovements}>
              Sim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
          <span className="text-xs text-muted-foreground">Esperada</span>
          <Input type="number" className="h-8 text-sm text-right" value={localExpected}
            onChange={(e) => setLocalExpected(e.target.value)}
            onBlur={() => onSave(year, "manual_revenue_expected", parseFloat(localExpected) || 0)} />
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Recebida</span>
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
