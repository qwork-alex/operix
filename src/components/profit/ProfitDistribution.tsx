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
  group_id: string;
  is_active: boolean;
  items: RuleItem[];
  _isNew?: boolean;
}

const PARTICIPANT_TYPES = [
  { value: "technician", label: "Técnico" },
  { value: "partner", label: "Sócio" },
  { value: "company", label: "Empresa" },
  { value: "client", label: "Cliente" },
  { value: "other", label: "Outros" },
] as const;

// ─── Component ───

export function ProfitDistribution() {
  const { formatCurrency } = useLanguage();
  const queryClient = useQueryClient();

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
        group_id: r.group_id || "",
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
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Get distinct group_ids from service orders
  const availableGroups = useMemo(() => {
    const groups = new Map<string, { count: number; total: number }>();
    serviceOrders.forEach((so: any) => {
      const gid = so.group_id;
      if (!gid) return;
      const existing = groups.get(gid) || { count: 0, total: 0 };
      groups.set(gid, {
        count: existing.count + 1,
        total: existing.total + Number(so.total || 0),
      });
    });
    return groups;
  }, [serviceOrders]);

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
  const isRuleValid = (rule: ProfitRule) =>
    getItemsTotal(rule.items) === 100 && rule.group_id.trim() && rule.rule_name.trim();

  const groupHasRule = (groupId: string, excludeRuleId?: string) =>
    allRules.some(r => r.group_id === groupId && r.is_active && r.id !== excludeRuleId);

  const getGroupSOs = (groupId: string) =>
    serviceOrders.filter((so: any) => so.group_id === groupId);

  const getGroupRevenue = (groupId: string) =>
    getGroupSOs(groupId).reduce((s: number, so: any) => s + Number(so.total || 0), 0);

  // ── Rule CRUD (local state) ──
  const addRule = () => {
    const newRule: ProfitRule = {
      id: crypto.randomUUID(),
      rule_name: "",
      group_id: "",
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
      if (!isRuleValid(rule)) throw new Error("Regra inválida: nome, group_id e 100% são obrigatórios");

      if (groupHasRule(rule.group_id, rule.id)) {
        throw new Error("Este grupo já possui uma regra ativa");
      }

      // Upsert rule
      const { data: savedRule, error: ruleError } = await supabase
        .from("profit_rules")
        .upsert({
          id: rule._isNew ? undefined : rule.id,
          rule_name: rule.rule_name,
          group_id: rule.group_id,
          technician_id: null,
          is_active: rule.is_active,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "id" })
        .select("id")
        .single();

      if (ruleError) throw ruleError;
      const ruleId = savedRule.id;

      // Delete old items, insert new
      await supabase.from("profit_rule_items").delete().eq("rule_id", ruleId);
      const items = rule.items.map(i => ({
        rule_id: ruleId,
        participant_name: i.participant_name,
        percentage: i.percentage,
        participant_type: i.participant_type,
      }));
      const { error: itemsError } = await supabase.from("profit_rule_items").insert(items);
      if (itemsError) throw itemsError;

      // Auto-generate distributions for all SOs in this group
      const groupSOs = serviceOrders.filter((so: any) => so.group_id === rule.group_id);
      if (groupSOs.length > 0) {
        const soIds = groupSOs.map((so: any) => so.id);
        await supabase.from("service_order_distributions").delete().in("service_order_id", soIds);

        const distributions = groupSOs.flatMap((so: any) =>
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

        // Update technician_percentage/earning on SOs that have a technician item
        const techItem = rule.items.find(i => i.participant_type === "technician");
        if (techItem) {
          for (const so of groupSOs) {
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

  // ── Total revenue ──
  const totalSORevenue = useMemo(() =>
    serviceOrders.reduce((s: number, so: any) => s + Number(so.total || 0), 0), [serviceOrders]);

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
              Regras vinculadas a grupos (group_id) · Cálculos baseados em Ordens de Serviço reais
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
        const groupRevenue = rule.group_id ? getGroupRevenue(rule.group_id) : 0;
        const groupSOs = rule.group_id ? getGroupSOs(rule.group_id) : [];
        const isLocal = localRules.some(lr => lr.id === rule.id);
        const groupInfo = rule.group_id ? availableGroups.get(rule.group_id) : null;

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
                  {/* Group ID selector */}
                  <Select
                    value={rule.group_id || ""}
                    onValueChange={(v) => updateLocalRule(rule.id, r => ({ ...r, group_id: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs w-[220px]">
                      <SelectValue placeholder="Selecionar grupo (group_id)" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(availableGroups.entries()).map(([gid, info]) => (
                        <SelectItem key={gid} value={gid} className="text-xs">
                          {gid} ({info.count} OS)
                          {groupHasRule(gid, rule.id) ? " — já tem regra" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Manual group_id input */}
                  <Input
                    value={rule.group_id}
                    onChange={(e) => updateLocalRule(rule.id, r => ({ ...r, group_id: e.target.value }))}
                    placeholder="ou digitar group_id"
                    className="h-8 text-xs max-w-[180px]"
                  />
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={(v) => updateLocalRule(rule.id, r => ({ ...r, is_active: v }))}
                    />
                    <span className="text-[10px] text-muted-foreground">{rule.is_active ? "Ativa" : "Inativa"}</span>
                  </div>
                </div>
                {rule.group_id && (
                  <p className="text-[10px] text-muted-foreground">
                    Grupo: <span className="font-medium text-foreground font-mono">{rule.group_id}</span>
                    {" · "}{groupSOs.length} OS · Receita: {formatCurrency(groupRevenue)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
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
                          {formatCurrency(groupRevenue * item.percentage / 100)}
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
              {valid && groupSOs.length > 0 && rule.is_active && (
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
                          <TableHead>Técnico</TableHead>
                          <TableHead className="text-right">Total OS</TableHead>
                          {rule.items.map(item => (
                            <TableHead key={item.id} className="text-right">
                              {item.participant_name || item.participant_type} ({item.percentage}%)
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupSOs.map((so: any) => {
                          const soTotal = Number(so.total || 0);
                          return (
                            <TableRow key={so.id} className="text-xs">
                              <TableCell>{so.car_name || "—"}</TableCell>
                              <TableCell className="font-mono">{so.license_plate || "—"}</TableCell>
                              <TableCell>{so.technician_name || "—"}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(soTotal)}</TableCell>
                              {rule.items.map(item => (
                                <TableCell key={item.id} className="text-right">
                                  {formatCurrency(Math.round(soTotal * item.percentage / 100 * 100) / 100)}
                                </TableCell>
                              ))}
                            </TableRow>
                          );
                        })}
                        <TableRow className="text-xs font-semibold border-t-2">
                          <TableCell colSpan={3}>TOTAL</TableCell>
                          <TableCell className="text-right">{formatCurrency(groupRevenue)}</TableCell>
                          {rule.items.map(item => (
                            <TableCell key={item.id} className="text-right">
                              {formatCurrency(Math.round(groupRevenue * item.percentage / 100 * 100) / 100)}
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
              <p className="text-[10px] text-muted-foreground">Grupos com OS</p>
              <p className="text-lg font-bold text-foreground">{availableGroups.size}</p>
            </div>
            <div className="rounded-lg border border-border/50 p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Regras Criadas</p>
              <p className="text-lg font-bold text-foreground">{rules.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
