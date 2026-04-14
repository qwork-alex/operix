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
  ChevronDown, ChevronRight, Plus, Trash2, TrendingUp, TrendingDown, AlertTriangle,
  Check, X, UserPlus, Users,
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
  status: "positive" | "negative";
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

        const techExpenses = expenseRecords
          .filter((r: any) => {
            const notes = r.notes || "";
            return notes.includes(tech.id) || notes.toLowerCase().includes(tech.name.toLowerCase());
          })
          .map((r: any) => ({ id: r.id, label: r.label || r.category || "Outro", amount: Number(r.amount || 0) }));

        const totalExpenses = techExpenses.reduce((s: number, e: any) => s + e.amount, 0);
        const result = received - totalExpenses;

        return {
          name: tech.name,
          technicianId: tech.id,
          expectedRevenue: expected,
          receivedRevenue: received,
          difference: expected - received,
          expenses: techExpenses,
          totalExpenses,
          result,
          status: result >= 0 ? "positive" : "negative",
        };
      }).sort((a, b) => b.receivedRevenue - a.receivedRevenue);
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["technician-financials"] });
      toast.success("Técnico adicionado");
    },
    onError: (e) => toast.error("Erro: " + (e as Error).message),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["technician-financials"] });
      qc.invalidateQueries({ queryKey: ["reconciliation-summary"] });
      toast.success("Despesa adicionada");
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["technician-financials"] });
      qc.invalidateQueries({ queryKey: ["reconciliation-summary"] });
      toast.success("Despesa removida");
    },
    onError: (e) => toast.error("Erro: " + (e as Error).message),
  });
}

const DEFAULT_EXPENSE_TYPES = ["Combustível", "Hotel", "Seguro", "Ferramentas", "Outros"];

export default function TechnicianDetailTab() {
  const { data: techData = [], isLoading } = useTechnicianFinancials();
  const { formatCurrency } = useLanguage();
  const [showAddModal, setShowAddModal] = useState(false);

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Análise por técnico</h3>
        <Button variant="outline" size="sm" onClick={() => setShowAddModal(true)}>
          <UserPlus className="h-4 w-4 mr-1" /> Adicionar técnico
        </Button>
      </div>

      {/* Empty state */}
      {techData.length === 0 && (
        <Card className="border-border/50 bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Adicione técnicos para começar a análise financeira</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              Os dados de receita serão calculados automaticamente a partir das ordens de serviço e pagamento.
            </p>
            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar técnico
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Alerts */}
      {techData.some(t => t.status === "negative") && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4" />
          {techData.filter(t => t.status === "negative").length} técnico(s) em dívida com a empresa
        </div>
      )}

      {/* Technician cards */}
      {techData.map((tech) => (
        <TechnicianCard key={tech.technicianId} tech={tech} formatCurrency={formatCurrency} />
      ))}

      {/* Add Technician Modal */}
      <AddTechnicianModal open={showAddModal} onOpenChange={setShowAddModal} />
    </div>
  );
}

function AddTechnicianModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState("");
  const addTech = useAddTechnician();

  const handleSubmit = () => {
    if (!name.trim()) return;
    addTech.mutate({ name: name.trim() }, {
      onSuccess: () => { setName(""); onOpenChange(false); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar técnico</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nome do técnico *</Label>
            <Input
              placeholder="Nome completo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || addTech.isPending}>
            {addTech.isPending ? "Salvando..." : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TechnicianCard({ tech, formatCurrency }: { tech: TechFinancials; formatCurrency: (v: number) => string }) {
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [showForm, setShowForm] = useState(false);
  const addExpense = useAddTechExpense();
  const deleteExpense = useDeleteTechExpense();

  const isPositive = tech.result >= 0;

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
              <span className="text-base">{isPositive ? "🟢" : "🔴"}</span>
              <span className="font-medium text-foreground">{tech.name}</span>
              <Badge variant={isPositive ? "outline" : "destructive"} className="text-[10px]">
                {isPositive ? "Empresa deve pagar" : "Em dívida"}
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              <span className={`text-sm font-medium tabular-nums ${isPositive ? "text-emerald-400" : "text-destructive"}`}>
                {formatCurrency(Math.abs(tech.result))}
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
          {/* Revenue (read-only) */}
          <Card className="border-border/50">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Receitas (automático)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Receita esperada (OS)</span>
                <span className="tabular-nums">{formatCurrency(tech.expectedRevenue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Receita recebida (OP)</span>
                <span className="tabular-nums">{formatCurrency(tech.receivedRevenue)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium border-t border-border/50 pt-1">
                <span className="text-muted-foreground">Diferença</span>
                <span className={`tabular-nums ${tech.difference > 0 ? "text-destructive" : tech.difference < 0 ? "text-emerald-400" : "text-foreground"}`}>
                  {tech.difference > 0 ? "-" : tech.difference < 0 ? "+" : ""}{formatCurrency(Math.abs(tech.difference))}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Expenses (editable) */}
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

          {/* Result */}
          <Card className={`border-border/50 ${isPositive ? "glow-green" : "glow-red"}`}>
            <CardContent className="py-3 px-4">
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  {isPositive ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                  <span className="text-sm font-medium text-muted-foreground">Resultado</span>
                </div>
                <span className={`text-lg font-bold tabular-nums ${isPositive ? "text-emerald-400" : "text-destructive"}`}>
                  {formatCurrency(Math.abs(tech.result))}
                </span>
              </div>
              <p className={`text-xs mt-1 ${isPositive ? "text-emerald-400/80" : "text-destructive/80"}`}>
                {isPositive
                  ? `Empresa deve pagar ao técnico: ${formatCurrency(tech.result)}`
                  : `Técnico está em dívida com a empresa: ${formatCurrency(Math.abs(tech.result))}`}
              </p>
            </CardContent>
          </Card>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
