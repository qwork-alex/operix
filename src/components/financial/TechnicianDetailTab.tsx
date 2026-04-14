import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronDown, ChevronRight, Plus, Trash2, TrendingUp, TrendingDown, AlertTriangle,
  Pencil, Check, X,
} from "lucide-react";
import { toast } from "sonner";

interface TechFinancials {
  name: string;
  technicianId: string;
  expectedRevenue: number;
  receivedRevenue: number;
  difference: number;
  expenses: { id: string; label: string; amount: number }[];
  totalExpenses: number;
  result: number;
  status: "healthy" | "warning" | "critical";
}

function useTechnicianFinancials() {
  return useQuery({
    queryKey: ["technician-financials"],
    queryFn: async () => {
      const [techRes, soRes, poRes, frRes] = await Promise.all([
        supabase.from("technicians").select("id, name"),
        supabase.from("service_orders").select("technician_name, technician_id, total"),
        supabase.from("payment_orders").select("technician_name, technician_id, total"),
        supabase.from("financial_records").select("id, label, amount, type, category, notes")
          .eq("type", "expense"),
      ]);

      const technicians = techRes.data ?? [];
      const serviceOrders = soRes.data ?? [];
      const paymentOrders = poRes.data ?? [];
      const expenseRecords = frRes.data ?? [];

      return technicians.map((tech): TechFinancials => {
        const expected = serviceOrders
          .filter((so: any) => so.technician_id === tech.id || (so.technician_name || "").toLowerCase() === tech.name.toLowerCase())
          .reduce((s: number, so: any) => s + Number(so.total || 0), 0);

        const received = paymentOrders
          .filter((po: any) => po.technician_id === tech.id || (po.technician_name || "").toLowerCase() === tech.name.toLowerCase())
          .reduce((s: number, po: any) => s + Number(po.total || 0), 0);

        // Expenses tagged for this technician (via notes containing tech id or name)
        const techExpenses = expenseRecords
          .filter((r: any) => {
            const notes = r.notes || "";
            return notes.includes(tech.id) || notes.toLowerCase().includes(tech.name.toLowerCase());
          })
          .map((r: any) => ({ id: r.id, label: r.label || r.category || "Outro", amount: Number(r.amount || 0) }));

        const totalExpenses = techExpenses.reduce((s: number, e: any) => s + e.amount, 0);
        const result = received - totalExpenses;
        const margin = received > 0 ? (result / received) * 100 : 0;

        let status: TechFinancials["status"] = "healthy";
        if (margin < 10 || result < 0) status = "critical";
        else if (margin < 30) status = "warning";

        return {
          name: tech.name,
          technicianId: tech.id,
          expectedRevenue: expected,
          receivedRevenue: received,
          difference: expected - received,
          expenses: techExpenses,
          totalExpenses,
          result,
          status,
        };
      }).sort((a, b) => b.receivedRevenue - a.receivedRevenue);
    },
  });
}

function useAddTechExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ techId, techName, label, amount }: { techId: string; techName: string; label: string; amount: number }) => {
      const { error } = await supabase.from("financial_records").insert({
        type: "expense",
        source: "manual",
        category: label,
        label,
        amount,
        status: "confirmed",
        notes: `tech:${techId}:${techName}`,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["technician-financials"] }); qc.invalidateQueries({ queryKey: ["reconciliation-summary"] }); toast.success("Despesa adicionada"); },
    onError: (e) => toast.error("Erro: " + (e as Error).message),
  });
}

function useDeleteTechExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["technician-financials"] }); qc.invalidateQueries({ queryKey: ["reconciliation-summary"] }); toast.success("Despesa removida"); },
    onError: (e) => toast.error("Erro: " + (e as Error).message),
  });
}

const DEFAULT_EXPENSE_TYPES = ["URSSAF", "Combustível", "Ferramentas", "Outros"];

export default function TechnicianDetailTab() {
  const { data: techData = [], isLoading } = useTechnicianFinancials();
  const { formatCurrency } = useLanguage();

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" />)}</div>;
  }

  if (techData.length === 0) {
    return (
      <Card className="border-border/50 bg-muted/30">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Nenhum técnico encontrado. Adicione técnicos para ver a análise.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Alerts */}
      {techData.some(t => t.status === "critical") && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4" />
          {techData.filter(t => t.status === "critical").length} técnico(s) com margem crítica
        </div>
      )}

      {techData.map((tech) => (
        <TechnicianCard key={tech.technicianId} tech={tech} formatCurrency={formatCurrency} />
      ))}
    </div>
  );
}

function TechnicianCard({ tech, formatCurrency }: { tech: TechFinancials; formatCurrency: (v: number) => string }) {
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [showForm, setShowForm] = useState(false);
  const addExpense = useAddTechExpense();
  const deleteExpense = useDeleteTechExpense();

  const statusColor = tech.status === "healthy" ? "bg-emerald-500" : tech.status === "warning" ? "bg-amber-500" : "bg-red-500";
  const statusEmoji = tech.status === "healthy" ? "🟢" : tech.status === "warning" ? "🟡" : "🔴";

  const handleAdd = () => {
    if (!newLabel || !newAmount) return;
    addExpense.mutate({ techId: tech.technicianId, techName: tech.name, label: newLabel, amount: parseFloat(newAmount) });
    setNewLabel("");
    setNewAmount("");
    setShowForm(false);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Card className="border-border/50 cursor-pointer hover:border-primary/30 transition-colors">
          <CardContent className="py-3 px-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-base">{statusEmoji}</span>
              <span className="font-medium text-foreground">{tech.name}</span>
              {tech.status !== "healthy" && (
                <Badge variant={tech.status === "critical" ? "destructive" : "outline"} className="text-[10px]">
                  {tech.status === "critical" ? "Margem crítica" : "Atenção"}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className={`text-sm font-medium tabular-nums ${tech.result >= 0 ? "text-emerald-400" : "text-destructive"}`}>
                {formatCurrency(tech.result)}
              </span>
              {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          </CardContent>
        </Card>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-4 mt-2 space-y-3 border-l-2 border-border pl-4 pb-2">
          {/* Block 1 — Revenue (read-only) */}
          <Card className="border-border/50">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Receita</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Esperada (OS)</span>
                <span className="tabular-nums">{formatCurrency(tech.expectedRevenue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Faturada (OP)</span>
                <span className="tabular-nums">{formatCurrency(tech.receivedRevenue)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium border-t border-border/50 pt-1">
                <span className="text-muted-foreground">Diferença</span>
                <span className={`tabular-nums ${tech.difference > 0 ? "text-destructive" : "text-emerald-400"}`}>
                  {tech.difference > 0 ? "-" : "+"}{formatCurrency(Math.abs(tech.difference))}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Block 2 — Expenses (editable) */}
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
                  <select
                    className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                  >
                    <option value="">Selecionar tipo...</option>
                    {DEFAULT_EXPENSE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <Input
                    type="number"
                    placeholder="Valor"
                    className="w-24 h-8 text-sm"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                  />
                  <Button size="sm" className="h-8" onClick={handleAdd} disabled={addExpense.isPending}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowForm(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {tech.expenses.length > 0 ? (
                tech.expenses.map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between text-sm group">
                    <span className="text-muted-foreground">{exp.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">{formatCurrency(exp.amount)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                        onClick={() => deleteExpense.mutate(exp.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">Nenhuma despesa registrada</p>
              )}

              <div className="flex justify-between text-sm font-medium border-t border-border/50 pt-1">
                <span className="text-muted-foreground">Total despesas</span>
                <span className="tabular-nums">{formatCurrency(tech.totalExpenses)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Block 3 — Result */}
          <Card className={`border-border/50 ${tech.result >= 0 ? "glow-green" : "glow-red"}`}>
            <CardContent className="py-3 px-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                {tech.result >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                <span className="text-sm font-medium text-muted-foreground">Resultado</span>
              </div>
              <span className={`text-lg font-bold tabular-nums ${tech.result >= 0 ? "text-emerald-400" : "text-destructive"}`}>
                {formatCurrency(tech.result)}
              </span>
            </CardContent>
          </Card>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
