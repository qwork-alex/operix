import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart as PieChartIcon, Plus, Save, Trash2, Loader2, AlertTriangle, Check, Users } from "lucide-react";

// ─── Types ───

interface DistributionRule {
  id: string;
  name: string;
  percentage: number;
  type: "technician" | "partner" | "company" | "client" | "custom";
}

interface CalculatedShare {
  name: string;
  type: string;
  percentage: number;
  amount: number;
}

const RULE_TYPES = [
  { value: "technician", label: "Técnico" },
  { value: "partner", label: "Sócio" },
  { value: "company", label: "Empresa" },
  { value: "client", label: "Cliente" },
  { value: "custom", label: "Personalizado" },
] as const;

const TYPE_COLORS: Record<string, string> = {
  technician: "bg-primary text-primary-foreground",
  partner: "bg-accent text-accent-foreground",
  company: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  client: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  custom: "bg-muted text-muted-foreground",
};

// ─── Component ───

export function ProfitDistribution() {
  const { formatCurrency } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── State ──
  const [rules, setRules] = useState<DistributionRule[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Queries ──
  const { data: distributions = [], isLoading: distLoading } = useQuery({
    queryKey: ["profit-distributions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profit_distributions").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: serviceOrders = [], isLoading: soLoading } = useQuery({
    queryKey: ["service_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("*, clients(name), technicians(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: paymentOrders = [] } = useQuery({
    queryKey: ["payment_orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_orders").select("total");
      if (error) throw error;
      return data;
    },
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ["technicians"],
    queryFn: async () => {
      const { data, error } = await supabase.from("technicians").select("id, name");
      if (error) throw error;
      return data;
    },
  });

  // ── Initialize rules from DB ──
  useEffect(() => {
    if (initialized || distLoading) return;

    if (distributions.length > 0) {
      // Load existing rules from the "default" scope distributions
      // We store rules as individual rows with scope='rule'
      const ruleRows = distributions.filter((d: any) => d.scope === "rule");
      if (ruleRows.length > 0) {
        setRules(ruleRows.map((r: any) => ({
          id: r.id,
          name: r.notes || "Sem nome",
          percentage: Number(r.tech_share), // We repurpose tech_share as the percentage field
          type: (r.partner_share === 1 ? "partner" : r.partner_share === 2 ? "company" : r.partner_share === 3 ? "client" : r.partner_share === 4 ? "custom" : "technician") as DistributionRule["type"],
        })));
      } else {
        // Migrate from old format: create default rules from the default distribution
        const def = distributions.find((d: any) => d.scope === "default");
        if (def) {
          setRules([
            { id: crypto.randomUUID(), name: "Técnico", percentage: Number(def.tech_share), type: "technician" },
            { id: crypto.randomUUID(), name: "Sócio", percentage: Number(def.partner_share), type: "partner" },
            { id: crypto.randomUUID(), name: "Empresa", percentage: Number(def.company_share), type: "company" },
          ]);
        } else {
          setRules([
            { id: crypto.randomUUID(), name: "Técnico", percentage: 40, type: "technician" },
            { id: crypto.randomUUID(), name: "Sócio", percentage: 30, type: "partner" },
            { id: crypto.randomUUID(), name: "Empresa", percentage: 30, type: "company" },
          ]);
        }
      }
    } else {
      // No distributions exist — create defaults
      setRules([
        { id: crypto.randomUUID(), name: "Técnico", percentage: 40, type: "technician" },
        { id: crypto.randomUUID(), name: "Sócio", percentage: 30, type: "partner" },
        { id: crypto.randomUUID(), name: "Empresa", percentage: 30, type: "company" },
      ]);
    }
    setInitialized(true);
  }, [distributions, distLoading, initialized]);

  // ── Derived values ──
  const totalPercentage = useMemo(() => rules.reduce((s, r) => s + r.percentage, 0), [rules]);
  const isValid = totalPercentage === 100;
  const totalRevenue = useMemo(() => (paymentOrders ?? []).reduce((s, o: any) => s + Number(o.total || 0), 0), [paymentOrders]);

  // ── Rule CRUD ──
  const addRule = () => {
    setRules(prev => [...prev, {
      id: crypto.randomUUID(),
      name: "",
      percentage: Math.max(0, 100 - totalPercentage),
      type: "custom",
    }]);
  };

  const updateRule = (id: string, field: keyof DistributionRule, value: string | number) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const deleteRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  // ── Save rules to DB ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!isValid) throw new Error("O total deve ser exatamente 100%");

      // Delete all existing rule-scope rows
      await supabase.from("profit_distributions").delete().eq("scope", "rule");
      // Also clean up old default/user/order scopes
      await supabase.from("profit_distributions").delete().in("scope", ["default", "user", "order"]);

      // Map type to a numeric code stored in partner_share for type encoding
      const typeCode = (t: string) =>
        t === "partner" ? 1 : t === "company" ? 2 : t === "client" ? 3 : t === "custom" ? 4 : 0;

      const payload = rules.map(r => ({
        scope: "rule" as string,
        tech_share: r.percentage, // repurpose as percentage
        partner_share: typeCode(r.type), // repurpose as type code
        company_share: 0,
        notes: r.name,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from("profit_distributions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profit-distributions"] });
      toast.success("Regras de distribuição salvas com sucesso");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // ── Automatic Distribution Calculation ──
  const calculatedDistributions = useMemo(() => {
    if (!isValid || serviceOrders.length === 0) return [];

    // Count unique technicians across all orders
    const technicianIds = new Set<string>();
    serviceOrders.forEach((so: any) => {
      if (so.technician_id) technicianIds.add(so.technician_id);
    });
    const techCount = Math.max(1, technicianIds.size);

    const results: CalculatedShare[] = [];

    rules.forEach(rule => {
      if (rule.type === "technician" && techCount > 1) {
        // Split technician share equally among all technicians
        technicianIds.forEach(techId => {
          const tech = technicians.find((t: any) => t.id === techId);
          results.push({
            name: tech?.name || techId.slice(0, 8),
            type: "technician",
            percentage: Number((rule.percentage / techCount).toFixed(2)),
            amount: totalRevenue * (rule.percentage / 100) / techCount,
          });
        });
      } else {
        results.push({
          name: rule.name,
          type: rule.type,
          percentage: rule.percentage,
          amount: totalRevenue * rule.percentage / 100,
        });
      }
    });

    return results;
  }, [rules, serviceOrders, technicians, totalRevenue, isValid]);

  // ── Per-order breakdown ──
  const orderBreakdown = useMemo(() => {
    if (!isValid) return [];

    return serviceOrders.slice(0, 20).map((so: any) => {
      const orderTotal = Number(so.total || 0);
      const shares = rules.map(rule => ({
        name: rule.name,
        type: rule.type,
        amount: orderTotal * rule.percentage / 100,
      }));
      return {
        id: so.id,
        car: `${so.car_name || ""} ${so.license_plate || ""}`.trim() || so.id.slice(0, 8),
        total: orderTotal,
        technician: (so as any).technicians?.name || "—",
        shares,
      };
    });
  }, [serviceOrders, rules, isValid]);

  // ── Loading ──
  if (distLoading || soLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <PieChartIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Distribuição de Lucros</h1>
            <p className="text-xs text-muted-foreground">Configure as regras e veja a distribuição automática</p>
          </div>
        </div>
        {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* SECTION 1: Regras de Distribuição          */}
      {/* ══════════════════════════════════════════ */}
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Regras de Distribuição</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={addRule}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar regra
            </Button>
            <Button
              size="sm"
              disabled={!isValid || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              <Save className="h-4 w-4 mr-1" /> Salvar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Validation banner */}
          {!isValid && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive font-medium">
                O total deve ser exatamente 100%. Atual: {totalPercentage}%
              </p>
            </div>
          )}
          {isValid && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                Total: 100% — Regras válidas
              </p>
            </div>
          )}

          {/* Rules table */}
          <div className="rounded-lg border border-border/50 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[11px]">
                  <TableHead className="w-[200px]">Nome</TableHead>
                  <TableHead className="w-[100px]">Percentagem</TableHead>
                  <TableHead className="w-[160px]">Tipo</TableHead>
                  <TableHead className="w-[80px] text-right">Valor (€)</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id} className="text-xs">
                    <TableCell>
                      <Input
                        value={rule.name}
                        onChange={(e) => updateRule(rule.id, "name", e.target.value)}
                        placeholder="Nome do participante"
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={rule.percentage}
                          onChange={(e) => updateRule(rule.id, "percentage", Number(e.target.value))}
                          className="h-8 w-20 text-xs"
                        />
                        <span className="text-muted-foreground">%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={rule.type}
                        onValueChange={(v) => updateRule(rule.id, "type", v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RULE_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value} className="text-xs">
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(totalRevenue * rule.percentage / 100)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteRule(rule.id)}
                        disabled={rules.length <= 1}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Distribuição total</span>
              <span className={totalPercentage === 100 ? "text-emerald-600" : "text-destructive"}>
                {totalPercentage}%
              </span>
            </div>
            <div className="h-3 rounded-full bg-muted flex overflow-hidden">
              {rules.map((rule, i) => (
                <div
                  key={rule.id}
                  className={`h-full transition-all ${
                    rule.type === "technician" ? "bg-primary" :
                    rule.type === "partner" ? "bg-accent" :
                    rule.type === "company" ? "bg-emerald-500" :
                    rule.type === "client" ? "bg-amber-500" :
                    "bg-muted-foreground/40"
                  }`}
                  style={{ width: `${Math.min(rule.percentage, 100)}%` }}
                  title={`${rule.name}: ${rule.percentage}%`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {rules.map(rule => (
                <div key={rule.id} className="flex items-center gap-1.5 text-[10px]">
                  <div className={`h-2 w-2 rounded-full ${
                    rule.type === "technician" ? "bg-primary" :
                    rule.type === "partner" ? "bg-accent" :
                    rule.type === "company" ? "bg-emerald-500" :
                    rule.type === "client" ? "bg-amber-500" :
                    "bg-muted-foreground/40"
                  }`} />
                  <span className="text-muted-foreground">{rule.name} ({rule.percentage}%)</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════ */}
      {/* SECTION 2: Distribuição Automática          */}
      {/* ══════════════════════════════════════════ */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Distribuição Automática</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Calculada automaticamente com base na receita real ({formatCurrency(totalRevenue)}) e nas ordens de serviço
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isValid ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              Corrija as regras (total = 100%) para ver a distribuição automática.
            </p>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border border-border/50 p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Receita Real</p>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(totalRevenue)}</p>
                </div>
                <div className="rounded-lg border border-border/50 p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Ordens de Serviço</p>
                  <p className="text-lg font-bold text-foreground">{serviceOrders.length}</p>
                </div>
                <div className="rounded-lg border border-border/50 p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Técnicos Ativos</p>
                  <p className="text-lg font-bold text-foreground">
                    {new Set(serviceOrders.map((so: any) => so.technician_id).filter(Boolean)).size}
                  </p>
                </div>
                <div className="rounded-lg border border-border/50 p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Participantes</p>
                  <p className="text-lg font-bold text-foreground">{calculatedDistributions.length}</p>
                </div>
              </div>

              {/* Calculated shares */}
              <div className="rounded-lg border border-border/50 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[11px]">
                      <TableHead>Participante</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Valor (€)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calculatedDistributions.map((share, i) => (
                      <TableRow key={i} className="text-xs">
                        <TableCell className="font-medium">{share.name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`text-[10px] ${TYPE_COLORS[share.type] || ""}`}>
                            {RULE_TYPES.find(t => t.value === share.type)?.label || share.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{share.percentage.toFixed(2)}%</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(share.amount)}</TableCell>
                      </TableRow>
                    ))}
                    {calculatedDistributions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-xs">
                          Nenhuma ordem de serviço encontrada
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Per-order breakdown */}
              {orderBreakdown.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-foreground mb-2">Distribuição por Ordem</h3>
                  <div className="rounded-lg border border-border/50 overflow-auto max-h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[11px]">
                          <TableHead>Veículo</TableHead>
                          <TableHead>Técnico</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          {rules.map(r => (
                            <TableHead key={r.id} className="text-right">{r.name} ({r.percentage}%)</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderBreakdown.map(ob => (
                          <TableRow key={ob.id} className="text-xs">
                            <TableCell className="font-medium">{ob.car}</TableCell>
                            <TableCell>{ob.technician}</TableCell>
                            <TableCell className="text-right">{formatCurrency(ob.total)}</TableCell>
                            {ob.shares.map((s, i) => (
                              <TableCell key={i} className="text-right text-muted-foreground">
                                {formatCurrency(s.amount)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
