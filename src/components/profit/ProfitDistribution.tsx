import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  PieChart as PieChartIcon, Plus, Save, Trash2, Loader2,
  AlertTriangle, Check, Users, FolderPlus, X,
} from "lucide-react";

// ─── Types ───

interface RuleItem {
  id: string;
  participant_name: string;
  percentage: number;
  participant_type: "technician" | "partner" | "company" | "client" | "other";
}

interface ProfitRule {
  id: string;
  rule_name: string;
  technician_id: string;
  is_active: boolean;
  items: RuleItem[];
  _isNew?: boolean; // client-only flag for unsaved rules
}

interface CorrectionEntry {
  orderId: string;
  car_name: string;
  license_plate: string;
  client_name: string;
  platform: string;
  week: string;
  total: number;
}

const PARTICIPANT_TYPES = [
  { value: "technician", label: "Técnico" },
  { value: "partner", label: "Sócio" },
  { value: "company", label: "Empresa" },
  { value: "client", label: "Cliente" },
  { value: "other", label: "Outros" },
] as const;

const TYPE_COLORS: Record<string, string> = {
  technician: "bg-primary text-primary-foreground",
  partner: "bg-accent text-accent-foreground",
  company: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  client: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  other: "bg-muted text-muted-foreground",
};

// ─── Component ───

export function ProfitDistribution() {
  const { formatCurrency } = useLanguage();
  const queryClient = useQueryClient();

  // ── Local state for new/editing rules ──
  const [localRules, setLocalRules] = useState<ProfitRule[]>([]);

  // ── Queries ──
  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ["profit-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profit_rules")
        .select("*, profit_rule_items(*)")
        .order("created_at");
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        rule_name: r.rule_name,
        technician_id: r.technician_id,
        is_active: r.is_active,
        items: (r.profit_rule_items || []).map((item: any) => ({
          id: item.id,
          participant_name: item.participant_name,
          percentage: Number(item.percentage),
          participant_type: item.participant_type,
        })),
      })) as ProfitRule[];
    },
  });

  const { data: serviceOrders = [], isLoading: soLoading } = useQuery({
    queryKey: ["service_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("*, clients(name)")
        .order("created_at", { ascending: false });
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

  // Combine DB rules with local unsaved rules
  const allRules = useMemo(() => {
    const dbIds = new Set(rules.map(r => r.id));
    const merged = [...rules];
    localRules.forEach(lr => {
      if (!dbIds.has(lr.id)) merged.push(lr);
      else {
        const idx = merged.findIndex(r => r.id === lr.id);
        if (idx >= 0) merged[idx] = lr;
      }
    });
    return merged;
  }, [rules, localRules]);

  // ── Helpers ──
  const getItemsTotal = (items: RuleItem[]) => items.reduce((s, i) => s + i.percentage, 0);
  const isRuleValid = (rule: ProfitRule) => getItemsTotal(rule.items) === 100 && rule.technician_id && rule.rule_name.trim();

  const getTechName = (techId: string) => technicians.find(t => t.id === techId)?.name || "—";

  // Get service orders for a specific technician
  const getTechServiceOrders = (techId: string) =>
    serviceOrders.filter((so: any) => so.technician_id === techId);

  const getTechRevenue = (techId: string) =>
    getTechServiceOrders(techId).reduce((s: number, so: any) => s + Number(so.total || 0), 0);

  // Check if technician already has an active rule (excluding current rule)
  const techHasRule = (techId: string, excludeRuleId?: string) =>
    allRules.some(r => r.technician_id === techId && r.is_active && r.id !== excludeRuleId);

  // ── Rule CRUD (local state) ──
  const addRule = () => {
    const newRule: ProfitRule = {
      id: crypto.randomUUID(),
      rule_name: "",
      technician_id: "",
      is_active: true,
      items: [
        { id: crypto.randomUUID(), participant_name: "", percentage: 100, participant_type: "technician" },
      ],
      _isNew: true,
    };
    setLocalRules(prev => [...prev, newRule]);
  };

  const updateLocalRule = (ruleId: string, updater: (r: ProfitRule) => ProfitRule) => {
    setLocalRules(prev => {
      const exists = prev.find(r => r.id === ruleId);
      if (exists) return prev.map(r => r.id === ruleId ? updater(r) : r);
      // Copy from DB rules to local for editing
      const dbRule = rules.find(r => r.id === ruleId);
      if (dbRule) return [...prev, updater({ ...dbRule })];
      return prev;
    });
  };

  const addItemToRule = (ruleId: string) => {
    updateLocalRule(ruleId, r => {
      const remaining = Math.max(0, 100 - getItemsTotal(r.items));
      return {
        ...r,
        items: [...r.items, {
          id: crypto.randomUUID(),
          participant_name: "",
          percentage: remaining,
          participant_type: "other",
        }],
      };
    });
  };

  const updateItem = (ruleId: string, itemId: string, field: string, value: any) => {
    updateLocalRule(ruleId, r => ({
      ...r,
      items: r.items.map(i => i.id === itemId ? { ...i, [field]: value } : i),
    }));
  };

  const deleteItem = (ruleId: string, itemId: string) => {
    updateLocalRule(ruleId, r => ({
      ...r,
      items: r.items.length <= 1 ? r.items : r.items.filter(i => i.id !== itemId),
    }));
  };

  const discardLocalRule = (ruleId: string) => {
    setLocalRules(prev => prev.filter(r => r.id !== ruleId));
  };

  // ── Save single rule ──
  const saveRuleMutation = useMutation({
    mutationFn: async (rule: ProfitRule) => {
      if (!isRuleValid(rule)) throw new Error("Regra inválida: nome, técnico e 100% são obrigatórios");

      if (techHasRule(rule.technician_id, rule.id)) {
        throw new Error("Este técnico já possui uma regra ativa");
      }

      // Upsert rule
      const { data: savedRule, error: ruleError } = await supabase
        .from("profit_rules")
        .upsert({
          id: rule._isNew ? undefined : rule.id,
          rule_name: rule.rule_name,
          technician_id: rule.technician_id,
          is_active: rule.is_active,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" })
        .select("id")
        .single();

      if (ruleError) throw ruleError;
      const ruleId = savedRule.id;

      // Delete old items
      await supabase.from("profit_rule_items").delete().eq("rule_id", ruleId);

      // Insert new items
      const items = rule.items.map(i => ({
        rule_id: ruleId,
        participant_name: i.participant_name,
        percentage: i.percentage,
        participant_type: i.participant_type,
      }));
      const { error: itemsError } = await supabase.from("profit_rule_items").insert(items);
      if (itemsError) throw itemsError;

      // Auto-generate distributions for all SOs of this technician
      const techSOs = serviceOrders.filter((so: any) => so.technician_id === rule.technician_id);
      if (techSOs.length > 0) {
        // Delete old distributions for these SOs
        const soIds = techSOs.map((so: any) => so.id);
        await supabase.from("service_order_distributions").delete().in("service_order_id", soIds);

        // Create new distributions
        const distributions = techSOs.flatMap((so: any) =>
          rule.items.map(item => ({
            service_order_id: so.id,
            participant_name: item.participant_name,
            percentage: item.percentage,
            calculated_value: Math.round(Number(so.total || 0) * item.percentage / 100 * 100) / 100,
          }))
        );
        if (distributions.length > 0) {
          await supabase.from("service_order_distributions").insert(distributions);
        }

        // Update technician_percentage and technician_earning on service_orders
        const techItem = rule.items.find(i => i.participant_type === "technician");
        if (techItem) {
          for (const so of techSOs) {
            const total = Number(so.total || 0);
            await supabase.from("service_orders").update({
              technician_percentage: techItem.percentage,
              technician_earning: Math.round(total * techItem.percentage / 100 * 100) / 100,
              updated_at: new Date().toISOString(),
            }).eq("id", so.id);
          }
        }
      }

      return ruleId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profit-rules"] });
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      queryClient.invalidateQueries({ queryKey: ["technician_earnings_map"] });
      // Clear local edits for saved rules
      setLocalRules([]);
      toast.success("Regra salva com sucesso");
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao salvar regra"),
  });

  // ── Delete rule ──
  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase.from("profit_rules").delete().eq("id", ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profit-rules"] });
      queryClient.invalidateQueries({ queryKey: ["technician_earnings_map"] });
      toast.success("Regra excluída");
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao excluir"),
  });

  // ── Delete all rules ──
  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profit_rules").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
    },
    onSuccess: () => {
      setLocalRules([]);
      queryClient.invalidateQueries({ queryKey: ["profit-rules"] });
      queryClient.invalidateQueries({ queryKey: ["technician_earnings_map"] });
      toast.success("Todas as regras excluídas");
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao excluir"),
  });

  // ── Correction entries: SOs without technician ──
  const correctionEntries = useMemo<CorrectionEntry[]>(() => {
    return serviceOrders
      .filter((so: any) => !so.technician_id && Number(so.total || 0) > 0)
      .map((so: any) => ({
        orderId: so.id,
        car_name: so.car_name || "—",
        license_plate: so.license_plate || "—",
        client_name: so.client_name || (so as any).clients?.name || "—",
        platform: so.platform || "—",
        week: so.week || "—",
        total: Number(so.total || 0),
      }));
  }, [serviceOrders]);

  const [correctionTechIds, setCorrectionTechIds] = useState<Record<string, string>>({});

  const assignTechnician = async (orderId: string) => {
    const techId = correctionTechIds[orderId];
    if (!techId) { toast.error("Selecione um técnico"); return; }

    const tech = technicians.find(t => t.id === techId);
    const { error } = await supabase
      .from("service_orders")
      .update({
        technician_id: techId,
        technician_name: tech?.name || "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (error) { toast.error("Erro ao atribuir técnico"); return; }

    // Auto-apply profit rule if exists
    const rule = allRules.find(r => r.technician_id === techId && r.is_active);
    if (rule) {
      const so = serviceOrders.find((s: any) => s.id === orderId);
      const total = Number(so?.total || 0);
      const techItem = rule.items.find(i => i.participant_type === "technician");

      // Update technician earnings
      if (techItem) {
        await supabase.from("service_orders").update({
          technician_percentage: techItem.percentage,
          technician_earning: Math.round(total * techItem.percentage / 100 * 100) / 100,
        }).eq("id", orderId);
      }

      // Create distributions
      await supabase.from("service_order_distributions").delete().eq("service_order_id", orderId);
      const dists = rule.items.map(item => ({
        service_order_id: orderId,
        participant_name: item.participant_name,
        percentage: item.percentage,
        calculated_value: Math.round(total * item.percentage / 100 * 100) / 100,
      }));
      await supabase.from("service_order_distributions").insert(dists);
    }

    setCorrectionTechIds(prev => { const n = { ...prev }; delete n[orderId]; return n; });
    queryClient.invalidateQueries({ queryKey: ["service_orders"] });
    toast.success("Técnico atribuído e distribuição aplicada");
  };

  // ── Total revenue from service orders ──
  const totalSORevenue = useMemo(() =>
    serviceOrders.reduce((s: number, so: any) => s + Number(so.total || 0), 0), [serviceOrders]);

  // ── Loading ──
  if (rulesLoading || soLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
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
            <p className="text-xs text-muted-foreground">
              Regras vinculadas a técnicos · Cálculos baseados em Ordens de Serviço reais
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {allRules.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { if (confirm("Excluir TODAS as regras?")) deleteAllMutation.mutate(); }}
              disabled={deleteAllMutation.isPending}
            >
              {deleteAllMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Excluir Todas
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={addRule}>
            <FolderPlus className="h-4 w-4 mr-1" /> Nova Regra
          </Button>
        </div>
      </div>

      {/* ═══ RULES ═══ */}
      {allRules.length === 0 && (
        <Card className="border-dashed border-2 border-muted-foreground/20">
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <PieChartIcon className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">Nenhuma regra criada</p>
            <p className="text-xs mt-1">Clique em "Nova Regra" para começar</p>
          </CardContent>
        </Card>
      )}

      {allRules.map((rule) => {
        const itemsTotal = getItemsTotal(rule.items);
        const valid = itemsTotal === 100;
        const techRevenue = rule.technician_id ? getTechRevenue(rule.technician_id) : 0;
        const techSOs = rule.technician_id ? getTechServiceOrders(rule.technician_id) : [];
        const isLocal = localRules.some(lr => lr.id === rule.id);
        const hasChanges = isLocal || rule._isNew;

        return (
          <Card key={rule.id} className="border-border/50">
            <CardHeader className="flex flex-row items-start justify-between pb-3 gap-4">
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    value={rule.rule_name}
                    onChange={(e) => updateLocalRule(rule.id, r => ({ ...r, rule_name: e.target.value }))}
                    placeholder="Nome da regra"
                    className="h-8 text-sm font-semibold max-w-[250px]"
                  />
                  <Select
                    value={rule.technician_id || ""}
                    onValueChange={(v) => updateLocalRule(rule.id, r => ({ ...r, technician_id: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs w-[200px]">
                      <SelectValue placeholder="Selecionar técnico" />
                    </SelectTrigger>
                    <SelectContent>
                      {technicians.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">
                          {t.name}
                          {techHasRule(t.id, rule.id) ? " (já tem regra)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={(v) => updateLocalRule(rule.id, r => ({ ...r, is_active: v }))}
                    />
                    <span className="text-[10px] text-muted-foreground">{rule.is_active ? "Ativa" : "Inativa"}</span>
                  </div>
                </div>
                {rule.technician_id && (
                  <p className="text-[10px] text-muted-foreground">
                    Técnico: <span className="font-medium text-foreground">{getTechName(rule.technician_id)}</span>
                    {" · "}{techSOs.length} OS · Receita: {formatCurrency(techRevenue)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Save button INSIDE the rule */}
                <Button
                  size="sm"
                  disabled={!isRuleValid(rule) || saveRuleMutation.isPending}
                  onClick={() => saveRuleMutation.mutate(rule)}
                >
                  {saveRuleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Salvar
                </Button>
                {rule._isNew && (
                  <Button variant="ghost" size="sm" onClick={() => discardLocalRule(rule.id)}>
                    <X className="h-4 w-4 mr-1" /> Cancelar
                  </Button>
                )}
                {!rule._isNew && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => { if (confirm("Excluir esta regra permanentemente?")) deleteRuleMutation.mutate(rule.id); }}
                    disabled={deleteRuleMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Excluir
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Validation */}
              {!valid && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                  <p className="text-xs text-destructive font-medium">
                    O total deve ser 100%. Atual: {itemsTotal}%
                  </p>
                </div>
              )}
              {valid && (
                <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                    Total: 100% — Regra válida
                  </p>
                </div>
              )}

              {/* Items table */}
              <div className="rounded-lg border border-border/50 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[11px]">
                      <TableHead className="w-[200px]">Participante</TableHead>
                      <TableHead className="w-[100px]">Percentagem</TableHead>
                      <TableHead className="w-[160px]">Tipo</TableHead>
                      <TableHead className="w-[100px] text-right">Valor (€)</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rule.items.map((item) => (
                      <TableRow key={item.id} className="text-xs">
                        <TableCell>
                          <Input
                            value={item.participant_name}
                            onChange={(e) => updateItem(rule.id, item.id, "participant_name", e.target.value)}
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
                              value={item.percentage}
                              onChange={(e) => updateItem(rule.id, item.id, "percentage", Number(e.target.value))}
                              className="h-8 w-20 text-xs"
                            />
                            <span className="text-muted-foreground">%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={item.participant_type}
                            onValueChange={(v) => updateItem(rule.id, item.id, "participant_type", v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PARTICIPANT_TYPES.map(t => (
                                <SelectItem key={t.value} value={t.value} className="text-xs">
                                  {t.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(techRevenue * item.percentage / 100)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => deleteItem(rule.id, item.id)}
                            disabled={rule.items.length <= 1}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Button variant="outline" size="sm" onClick={() => addItemToRule(rule.id)}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar participante
              </Button>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Distribuição total</span>
                  <span className={itemsTotal === 100 ? "text-emerald-600" : "text-destructive"}>
                    {itemsTotal}%
                  </span>
                </div>
                <div className="h-3 rounded-full bg-muted flex overflow-hidden">
                  {rule.items.map((item) => (
                    <div
                      key={item.id}
                      className={`h-full transition-all ${
                        item.participant_type === "technician" ? "bg-primary" :
                        item.participant_type === "partner" ? "bg-accent" :
                        item.participant_type === "company" ? "bg-emerald-500" :
                        item.participant_type === "client" ? "bg-amber-500" :
                        "bg-muted-foreground/40"
                      }`}
                      style={{ width: `${Math.min(item.percentage, 100)}%` }}
                      title={`${item.participant_name}: ${item.percentage}%`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-3 mt-2">
                  {rule.items.map(item => (
                    <div key={item.id} className="flex items-center gap-1.5 text-[10px]">
                      <div className={`h-2 w-2 rounded-full ${
                        item.participant_type === "technician" ? "bg-primary" :
                        item.participant_type === "partner" ? "bg-accent" :
                        item.participant_type === "company" ? "bg-emerald-500" :
                        item.participant_type === "client" ? "bg-amber-500" :
                        "bg-muted-foreground/40"
                      }`} />
                      <span className="text-muted-foreground">{item.participant_name || "—"} ({item.percentage}%)</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Distribution per SO */}
              {valid && techSOs.length > 0 && rule.is_active && (
                <div className="mt-4 pt-4 border-t border-border/30">
                  <h3 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    Distribuição por Ordem de Serviço — {rule.rule_name}
                  </h3>
                  <div className="rounded-lg border border-border/50 overflow-auto max-h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[11px]">
                          <TableHead>Veículo</TableHead>
                          <TableHead>Placa</TableHead>
                          <TableHead className="text-right">Total OS</TableHead>
                          {rule.items.map(item => (
                            <TableHead key={item.id} className="text-right">
                              {item.participant_name || item.participant_type} ({item.percentage}%)
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {techSOs.map((so: any) => {
                          const soTotal = Number(so.total || 0);
                          return (
                            <TableRow key={so.id} className="text-xs">
                              <TableCell>{so.car_name || "—"}</TableCell>
                              <TableCell className="font-mono">{so.license_plate || "—"}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(soTotal)}</TableCell>
                              {rule.items.map(item => (
                                <TableCell key={item.id} className="text-right">
                                  {formatCurrency(Math.round(soTotal * item.percentage / 100 * 100) / 100)}
                                </TableCell>
                              ))}
                            </TableRow>
                          );
                        })}
                        {/* Totals row */}
                        <TableRow className="text-xs font-semibold border-t-2">
                          <TableCell colSpan={2}>TOTAL</TableCell>
                          <TableCell className="text-right">{formatCurrency(techRevenue)}</TableCell>
                          {rule.items.map(item => (
                            <TableCell key={item.id} className="text-right">
                              {formatCurrency(Math.round(techRevenue * item.percentage / 100 * 100) / 100)}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* ═══ SUMMARY ═══ */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Resumo Geral</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border/50 p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Receita Total (OS)</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(totalSORevenue)}</p>
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
              <p className="text-[10px] text-muted-foreground">Regras Criadas</p>
              <p className="text-lg font-bold text-foreground">{rules.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ CORREÇÃO DE DISTRIBUIÇÃO ═══ */}
      {correctionEntries.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Correção de Distribuição
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Ordens sem técnico atribuído. Atribua para aplicar a regra de distribuição automaticamente.
            </p>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border/50 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead>Cliente</TableHead>
                    <TableHead>Plataforma</TableHead>
                    <TableHead>Semana</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Placa</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-[200px]">Técnico</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {correctionEntries.map(entry => (
                    <TableRow key={entry.orderId} className="text-xs">
                      <TableCell>{entry.client_name}</TableCell>
                      <TableCell>{entry.platform}</TableCell>
                      <TableCell>{entry.week}</TableCell>
                      <TableCell>{entry.car_name}</TableCell>
                      <TableCell className="font-mono">{entry.license_plate}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(entry.total)}</TableCell>
                      <TableCell>
                        <Select
                          value={correctionTechIds[entry.orderId] || ""}
                          onValueChange={(v) => setCorrectionTechIds(prev => ({ ...prev, [entry.orderId]: v }))}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Selecionar técnico" />
                          </SelectTrigger>
                          <SelectContent>
                            {technicians.map((t) => (
                              <SelectItem key={t.id} value={t.id} className="text-xs">
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={!correctionTechIds[entry.orderId]}
                          onClick={() => assignTechnician(entry.orderId)}
                        >
                          Atribuir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
