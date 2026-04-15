import { useState, useCallback } from "react";
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
  ChevronDown, Plus, TrendingUp, TrendingDown,
  UserPlus, Users,
} from "lucide-react";
import { toast } from "sonner";
import ExpenseSpreadsheet, { SpreadsheetData, SpreadsheetRow, getDefaultColumns } from "./ExpenseSpreadsheet";
import FinancialMovements, { FinancialMovement } from "./FinancialMovements";

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
    mutationFn: async ({ techId, techName, type, amount }: { techId: string; techName: string; type: string; amount: number }) => {
      await supabase.from("financial_records").delete().eq("type", type).like("notes", `%tech:${techId}%`);
      const { error } = await supabase.from("financial_records").insert({
        type, source: "manual", label: type === "manual_revenue_expected" ? "Receita esperada" : "Receita recebida",
        amount, status: "confirmed", notes: `tech:${techId}:${techName}`,
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
  revenueExpected: number;
  revenueReceived: number;
  totalExpenses: number;
  spreadsheet: SpreadsheetData;
  movements: FinancialMovement[];
  loansReceived: number;
  loansPending: number;
}

function buildTechData(tech: { id: string; name: string }, records: any[]): TechData {
  const mine = records.filter((r) => (r.notes || "").includes(`tech:${tech.id}`));
  const revenueExpected = mine.find((r) => r.type === "manual_revenue_expected")?.amount ?? 0;
  const revenueReceived = mine.find((r) => r.type === "manual_revenue_received")?.amount ?? 0;

  const ssRecord = mine.find((r) => r.type === "expense_spreadsheet");
  let spreadsheet: SpreadsheetData = { columns: getDefaultColumns(), rows: [] };
  if (ssRecord?.category) {
    try { const parsed = JSON.parse(ssRecord.category); if (parsed.columns && parsed.rows) spreadsheet = parsed; } catch { /* default */ }
  }
  const totalExpenses = ssRecord?.amount ?? 0;

  const movRecord = mine.find((r) => r.type === "financial_movements");
  let movements: FinancialMovement[] = [];
  if (movRecord?.category) {
    try { const parsed = JSON.parse(movRecord.category); if (Array.isArray(parsed)) movements = parsed; } catch { /* default */ }
  }
  const loansReceived = movements.filter((m) => m.type === "loan" && m.status === "paid").reduce((s, m) => s + m.amount, 0);
  const loansPending = movements.filter((m) => m.type === "loan" && m.status !== "paid").reduce((s, m) => s + m.amount, 0);

  return { id: tech.id, name: tech.name, revenueExpected, revenueReceived, totalExpenses, spreadsheet, movements, loansReceived, loansPending };
}

/* ── main component ── */
export default function TechnicianDetailTab() {
  const { data: technicians = [], isLoading: loadingTech } = useTechnicians();
  const { data: records = [], isLoading: loadingFin } = useTechFinancials();
  const { formatCurrency } = useLanguage();
  const [showAdd, setShowAdd] = useState(false);

  const isLoading = loadingTech || loadingFin;

  if (isLoading) {
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
  const result = data.revenueReceived - data.totalExpenses - data.loansPending;
  const isPositive = result >= 0;

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
                {formatCurrency(Math.abs(result))}
              </span>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                {open ? <ChevronDown className="h-4 w-4" /> : "Ver detalhes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-4 mt-2 space-y-3 border-l-2 border-border pl-4 pb-2">
          <RevenueSection data={data} formatCurrency={formatCurrency} />
          <SpreadsheetSection data={data} formatCurrency={formatCurrency} />
          <MovementsSection data={data} formatCurrency={formatCurrency} />
          <ResultSection result={result} totalExpenses={data.totalExpenses} loansPending={data.loansPending} loansReceived={data.loansReceived} formatCurrency={formatCurrency} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ── Revenue (manual inputs) ── */
function RevenueSection({ data, formatCurrency }: { data: TechData; formatCurrency: (v: number) => string }) {
  const [expected, setExpected] = useState(String(data.revenueExpected || ""));
  const [received, setReceived] = useState(String(data.revenueReceived || ""));
  const upsert = useUpsertRevenue();
  const difference = (Number(expected) || 0) - (Number(received) || 0);

  const save = (type: string, val: string) => {
    const amount = parseFloat(val);
    if (isNaN(amount)) return;
    upsert.mutate({ techId: data.id, techName: data.name, type, amount });
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <TrendingUp className="h-3 w-3" /> Receitas (entrada manual)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground w-40">Receita esperada</span>
          <Input type="number" className="h-8 w-32 text-sm text-right" value={expected}
            onChange={(e) => setExpected(e.target.value)}
            onBlur={() => save("manual_revenue_expected", expected)} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground w-40">Receita recebida</span>
          <Input type="number" className="h-8 w-32 text-sm text-right" value={received}
            onChange={(e) => setReceived(e.target.value)}
            onBlur={() => save("manual_revenue_received", received)} />
        </div>
        <div className="flex justify-between text-sm font-medium border-t border-border/50 pt-1">
          <span className="text-muted-foreground">Diferença</span>
          <span className={`tabular-nums ${difference > 0 ? "text-destructive" : difference < 0 ? "text-emerald-400" : "text-foreground"}`}>
            {difference > 0 ? "-" : difference < 0 ? "+" : ""}{formatCurrency(Math.abs(difference))}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Spreadsheet expenses ── */
function SpreadsheetSection({ data, formatCurrency }: { data: TechData; formatCurrency: (v: number) => string }) {
  const [localData, setLocalData] = useState<SpreadsheetData>(data.spreadsheet);
  const saveSpreadsheet = useSaveSpreadsheet();

  const handleChange = useCallback((newData: SpreadsheetData) => {
    setLocalData(newData);
    // Debounced save on every change
    saveSpreadsheet.mutate({ techId: data.id, techName: data.name, spreadsheet: newData });
  }, [data.id, data.name, saveSpreadsheet]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
          Despesas (planilha financeira)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <ExpenseSpreadsheet data={localData} onChange={handleChange} formatCurrency={formatCurrency} />
      </CardContent>
    </Card>
  );
}

/* ── Movements section ── */
function MovementsSection({ data, formatCurrency }: { data: TechData; formatCurrency: (v: number) => string }) {
  const [localData, setLocalData] = useState<FinancialMovement[]>(data.movements);
  const saveMovements = useSaveMovements();

  const handleChange = useCallback((newData: FinancialMovement[]) => {
    setLocalData(newData);
    saveMovements.mutate({ techId: data.id, techName: data.name, movements: newData });
  }, [data.id, data.name, saveMovements]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
          Movimentações financeiras
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <FinancialMovements movements={localData} onChange={handleChange} formatCurrency={formatCurrency} />
      </CardContent>
    </Card>
  );
}

/* ── Result ── */
function ResultSection({ result, totalExpenses, loansPending, loansReceived, formatCurrency }: {
  result: number; totalExpenses: number; loansPending: number; loansReceived: number; formatCurrency: (v: number) => string;
}) {
  const isPositive = result >= 0;
  return (
    <Card className={`border-border/50 ${isPositive ? "glow-green" : "glow-red"}`}>
      <CardContent className="py-3 px-4">
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-2">
            {isPositive ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
            <span className="text-sm font-medium text-muted-foreground">Resultado</span>
          </div>
          <span className={`text-lg font-bold tabular-nums ${isPositive ? "text-emerald-400" : "text-destructive"}`}>
            {formatCurrency(Math.abs(result))}
          </span>
        </div>
        <div className="flex gap-4 text-[10px] text-muted-foreground mt-1">
          <span>Despesas: {formatCurrency(totalExpenses)}</span>
          {loansPending > 0 && <span className="text-amber-400">Empréstimos pendentes: {formatCurrency(loansPending)}</span>}
          {loansReceived > 0 && <span>Empréstimos pagos: {formatCurrency(loansReceived)}</span>}
        </div>
        <p className={`text-xs mt-1 ${isPositive ? "text-emerald-400/80" : "text-destructive/80"}`}>
          {isPositive
            ? `Empresa deve pagar ao técnico: ${formatCurrency(result)}`
            : `Técnico está em dívida com a empresa: ${formatCurrency(Math.abs(result))}`}
        </p>
      </CardContent>
    </Card>
  );
}
