import { useState } from "react";
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
  ChevronDown, ChevronRight, Plus, Trash2, TrendingUp, TrendingDown,
  Check, X, UserPlus, Users, Pencil,
} from "lucide-react";
import { toast } from "sonner";

/* ── types ── */
interface Expense { id: string; label: string; amount: number }

interface TechData {
  id: string;
  name: string;
  revenueExpected: number;
  revenueReceived: number;
  expenses: Expense[];
}

const DEFAULT_EXPENSE_LABELS = [
  "Combustível", "Hotel", "Seguro", "Ferramentas",
  "Salário", "Encargos sociais", "Impostos", "Outros",
];

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

function useTechFinancials(techIds: string[]) {
  return useQuery({
    queryKey: ["tech-financials", techIds],
    enabled: techIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_records")
        .select("id, label, amount, type, notes")
        .in("type", ["expense", "manual_revenue_expected", "manual_revenue_received"]);
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
      // delete old then insert new
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

function useAddExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ techId, techName, label, amount }: { techId: string; techName: string; label: string; amount: number }) => {
      const { error } = await supabase.from("financial_records").insert({
        type: "expense", source: "manual", category: label, label, amount,
        status: "confirmed", notes: `tech:${techId}:${techName}`,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tech-financials"] }); toast.success("Despesa adicionada"); },
    onError: (e) => toast.error("Erro: " + (e as Error).message),
  });
}

function useDeleteRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tech-financials"] }); toast.success("Removido"); },
    onError: (e) => toast.error("Erro: " + (e as Error).message),
  });
}

/* ── helpers ── */
function buildTechData(tech: { id: string; name: string }, records: any[]): TechData {
  const mine = records.filter((r) => (r.notes || "").includes(`tech:${tech.id}`));
  const revenueExpected = mine.find((r) => r.type === "manual_revenue_expected")?.amount ?? 0;
  const revenueReceived = mine.find((r) => r.type === "manual_revenue_received")?.amount ?? 0;
  const expenses = mine.filter((r) => r.type === "expense").map((r) => ({ id: r.id, label: r.label || r.category || "Outro", amount: Number(r.amount || 0) }));
  return { id: tech.id, name: tech.name, revenueExpected, revenueReceived, expenses };
}

/* ── main component ── */
export default function TechnicianDetailTab() {
  const { data: technicians = [], isLoading: loadingTech } = useTechnicians();
  const { data: records = [], isLoading: loadingFin } = useTechFinancials(technicians.map((t) => t.id));
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
  const totalExpenses = data.expenses.reduce((s, e) => s + e.amount, 0);
  const result = data.revenueReceived - totalExpenses;
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
          <ExpensesSection data={data} formatCurrency={formatCurrency} />
          <ResultSection result={result} totalExpenses={totalExpenses} formatCurrency={formatCurrency} />
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

/* ── Expenses ── */
function ExpensesSection({ data, formatCurrency }: { data: TechData; formatCurrency: (v: number) => string }) {
  const [showForm, setShowForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const addExpense = useAddExpense();
  const deleteRecord = useDeleteRecord();

  const handleAdd = () => {
    if (!newLabel || !newAmount) return;
    addExpense.mutate({ techId: data.id, techName: data.name, label: newLabel, amount: parseFloat(newAmount) });
    setNewLabel(""); setNewAmount(""); setShowForm(false);
  };

  const totalExpenses = data.expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-1 pt-3 px-4 flex flex-row items-center justify-between">
        <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Despesas</CardTitle>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3 w-3 mr-1" /> Adicionar
        </Button>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-1">
        {showForm && (
          <div className="flex gap-2 mb-2">
            <select className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}>
              <option value="">Selecionar tipo...</option>
              {DEFAULT_EXPENSE_LABELS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <Input type="number" placeholder="Valor" className="w-24 h-8 text-sm" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
            <Button size="sm" className="h-8" onClick={handleAdd} disabled={addExpense.isPending}><Check className="h-3 w-3" /></Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowForm(false)}><X className="h-3 w-3" /></Button>
          </div>
        )}

        {data.expenses.length > 0 ? data.expenses.map((exp) => (
          <div key={exp.id} className="flex items-center justify-between text-sm group">
            <span className="text-muted-foreground">{exp.label}</span>
            <div className="flex items-center gap-2">
              <span className="tabular-nums">{formatCurrency(exp.amount)}</span>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive" onClick={() => deleteRecord.mutate(exp.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )) : (
          <p className="text-xs text-muted-foreground text-center py-2">Nenhuma despesa registrada</p>
        )}

        <div className="flex justify-between text-sm font-medium border-t border-border/50 pt-1">
          <span className="text-muted-foreground">Total despesas</span>
          <span className="tabular-nums">{formatCurrency(totalExpenses)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Result ── */
function ResultSection({ result, totalExpenses, formatCurrency }: { result: number; totalExpenses: number; formatCurrency: (v: number) => string }) {
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
        <p className={`text-xs mt-1 ${isPositive ? "text-emerald-400/80" : "text-destructive/80"}`}>
          {isPositive
            ? `Empresa deve pagar ao técnico: ${formatCurrency(result)}`
            : `Técnico está em dívida com a empresa: ${formatCurrency(Math.abs(result))}`}
        </p>
      </CardContent>
    </Card>
  );
}
