import { useState, useMemo, useCallback } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  PieChart as PieChartIcon, Plus, Save, Trash2, Loader2,
  AlertTriangle, Check, Users, FolderPlus, X, ChevronDown,
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
  group_ids: string[];
  is_active: boolean;
  items: RuleItem[];
  _isNew?: boolean;
  _dirty?: boolean;
}

const normalizeTechnicianName = (value?: string | null) =>
  (value || "").trim().toLowerCase().replace(/\s+/g, " ");

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
  const [groupSearch, setGroupSearch] = useState<Record<string, string>>({});

  // ── Queries ──
  const { data: technicians = [] } = useQuery({
    queryKey: ["technicians"],
    queryFn: async () => {
      const { data, error } = await supabase.from("technicians").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const technicianIdByName = useMemo(
    () => new Map(technicians.map((tech) => [normalizeTechnicianName(tech.name), tech.id])),
    [technicians]
  );

  const resolveTechnicianId = useCallback(
    (ruleName: string) => technicianIdByName.get(normalizeTechnicianName(ruleName)) || "",
    [technicianIdByName]
  );

  const { data: fetchedRules = [], isLoading: rulesLoading } = useQuery({
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
        technician_id: r.technician_id || "",
        group_ids: Array.isArray(r.group_ids) ? r.group_ids.filter(Boolean) : [],
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

  const rules = useMemo(
    () =>
      fetchedRules.map((rule) => ({
        ...rule,
        technician_id: rule.technician_id || resolveTechnicianId(rule.rule_name),
      })),
    [fetchedRules, resolveTechnicianId]
  );

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

  // Group info from service orders
  const availableGroups = useMemo(() => {
    const groups = new Map<string, { count: number; total: number; week: string; techNames: Set<string> }>();
    serviceOrders.forEach((so: any) => {
      const gid = so.group_id;
      if (!gid) return;
      const existing = groups.get(gid) || { count: 0, total: 0, week: so.week || "", techNames: new Set<string>() };
      existing.count += 1;
      existing.total += Number(so.total || 0);
      if (so.week) existing.week = so.week;
      if (so.technician_name) existing.techNames.add(so.technician_name);
      groups.set(gid, existing);
    });
    return groups;
  }, [serviceOrders]);

  // All group_ids already assigned to any active rule
  const assignedGroupIds = useMemo(() => {
    const assigned = new Set<string>();
    const allR = [...rules];
    localRules.forEach(lr => {
      const idx = allR.findIndex(r => r.id === lr.id);
      if (idx >= 0) allR[idx] = lr;
      else allR.push(lr);
    });
    allR.forEach(r => {
      if (r.is_active) r.group_ids.forEach(g => assigned.add(g));
    });
    return assigned;
  }, [rules, localRules]);

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
    getItemsTotal(rule.items) === 100 && rule.technician_id && rule.rule_name.trim() && rule.group_ids.length > 0;

  const getGroupSOs = (groupId: string) =>
    serviceOrders.filter((so: any) => so.group_id === groupId);

  const getGroupRevenue = (groupId: string) =>
    getGroupSOs(groupId).reduce((s: number, so: any) => s + Number(so.total || 0), 0);

  const getRuleRevenue = (rule: ProfitRule) =>
    rule.group_ids.reduce((s, gid) => s + getGroupRevenue(gid), 0);

  const getRuleSOs = (rule: ProfitRule) =>
    rule.group_ids.flatMap(gid => getGroupSOs(gid));

  const handleRuleNameChange = (ruleId: string, value: string) => {
    const nextTechnicianId = resolveTechnicianId(value);

    updateLocalRule(ruleId, (rule) => ({
      ...rule,
      rule_name: value,
      technician_id: nextTechnicianId,
      group_ids:
        nextTechnicianId && rule.technician_id && nextTechnicianId !== rule.technician_id
          ? []
          : rule.group_ids,
    }));
  };

  const hasUnsavedChanges = useCallback((ruleId: string) => {
    return localRules.some(lr => lr.id === ruleId);
  }, [localRules]);

  // Check if a group is assigned to another rule (not this one)
  const groupAssignedToOther = (groupId: string, currentRuleId: string) => {
    return allRules.some(r => r.id !== currentRuleId && r.is_active && r.group_ids.includes(groupId));
  };

  // ── Rule CRUD (local state) ──
  const addRule = () => {
    const newRule: ProfitRule = {
      id: crypto.randomUUID(),
      rule_name: "",
      technician_id: "",
      group_ids: [],
      is_active: true,
      items: [
        { id: crypto.randomUUID(), participant_name: "", percentage: 100, participant_type: "technician" },
      ],
      _isNew: true,
      _dirty: true,
    };
    setLocalRules(prev => [...prev, newRule]);
  };

  const updateLocalRule = (ruleId: string, updater: (r: ProfitRule) => ProfitRule) => {
    setLocalRules(prev => {
      const exists = prev.find(r => r.id === ruleId);
      if (exists) return prev.map(r => r.id === ruleId ? { ...updater(r), _dirty: true } : r);
      const dbRule = rules.find(r => r.id === ruleId);
      if (dbRule) return [...prev, { ...updater({ ...dbRule }), _dirty: true }];
      return prev;
    });
  };

  const toggleGroupInRule = (ruleId: string, groupId: string) => {
    updateLocalRule(ruleId, r => {
      const has = r.group_ids.includes(groupId);
      if (has) {
        return { ...r, group_ids: r.group_ids.filter(g => g !== groupId) };
      }
      // Check if assigned elsewhere
      if (groupAssignedToOther(groupId, ruleId)) {
        if (!confirm(`O grupo "${groupId}" já possui uma regra ativa. Substituir?`)) {
          return r;
        }
      }
      return { ...r, group_ids: [...r.group_ids, groupId] };
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
      const technician_id = rule.technician_id || resolveTechnicianId(rule.rule_name);
      const group_ids = Array.from(new Set(rule.group_ids.filter(Boolean)));
      const participants = rule.items.map((item) => ({
        participant_name: item.participant_name.trim(),
        percentage: Number(item.percentage) || 0,
        participant_type: item.participant_type,
      }));

      if (!technician_id || !rule.rule_name.trim() || group_ids.length === 0 || getItemsTotal(rule.items) !== 100) {
        throw new Error("Regra inválida: nome, técnico, grupos e 100% são obrigatórios");
      }

      console.log("Saving rule:", {
        technician_id,
        group_ids,
        participants,
        isNew: !!rule._isNew,
      });

      let ruleId: string;

      if (rule._isNew) {
        const { data: savedRule, error: ruleError } = await supabase
          .from("profit_rules")
          .insert({
            rule_name: rule.rule_name,
            technician_id,
            group_ids,
            is_active: rule.is_active,
          } as any)
          .select("id")
          .single();
        if (ruleError) throw ruleError;
        ruleId = savedRule.id;
      } else {
        const { error: ruleError } = await supabase
          .from("profit_rules")
          .update({
            rule_name: rule.rule_name,
            technician_id,
            group_ids,
            is_active: rule.is_active,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", rule.id);
        if (ruleError) throw ruleError;
        ruleId = rule.id;
      }
      

      // Upsert items
      await supabase.from("profit_rule_items").delete().eq("rule_id", ruleId);
      const items = participants.map(i => ({
        rule_id: ruleId,
        participant_name: i.participant_name,
        percentage: i.percentage,
        participant_type: i.participant_type,
      }));
      const { error: itemsError } = await supabase.from("profit_rule_items").insert(items);
      if (itemsError) throw itemsError;

      // Generate distributions for all linked groups
      const allSOs = group_ids.flatMap(gid => getGroupSOs(gid));
      if (allSOs.length > 0) {
        const soIds = allSOs.map((so: any) => so.id);
        await supabase.from("service_order_distributions").delete().in("service_order_id", soIds);

        const distributions = allSOs.flatMap((so: any) =>
          participants.map(item => ({
            service_order_id: so.id,
            participant_name: item.participant_name,
            percentage: item.percentage,
            calculated_value: Math.round(Number(so.total || 0) * item.percentage / 100 * 100) / 100,
          }))
        );
        if (distributions.length > 0) {
          await supabase.from("service_order_distributions").insert(distributions);
        }

        // Update technician earnings on SOs
        const techItem = participants.find(i => i.participant_type === "technician");
        if (techItem) {
          for (const so of allSOs) {
            const total = Number((so as any).total || 0);
            const { error: soError } = await supabase.from("service_orders").update({
              technician_id,
              technician_percentage: techItem.percentage,
              technician_earning: Math.round(total * techItem.percentage / 100 * 100) / 100,
              updated_at: new Date().toISOString(),
            }).eq("id", (so as any).id);
            if (soError) throw soError;
          }
        }
      }

      return ruleId;
    },
    onSuccess: async (_ruleId, savedRule) => {
      setLocalRules(prev => prev.filter(rule => rule.id !== savedRule.id));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["profit-rules"] }),
        queryClient.invalidateQueries({ queryKey: ["service_orders"] }),
        queryClient.invalidateQueries({ queryKey: ["technician_earnings_map"] }),
      ]);
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

  // Get groups for a technician (from service orders)
  const getGroupsForTechnician = (techId: string) => {
    const techName = technicians.find(t => t.id === techId)?.name;
    if (!techName) return [];
    const gids = new Set<string>();
    serviceOrders.forEach((so: any) => {
      const matchesTechnician =
        so.technician_id === techId ||
        normalizeTechnicianName(so.technician_name) === normalizeTechnicianName(techName);

      if (matchesTechnician && so.group_id) gids.add(so.group_id);
    });
    return Array.from(gids);
  };

  const renderRuleCard = (rule: ProfitRule) => {
    const itemsTotal = getItemsTotal(rule.items);
    const valid = itemsTotal === 100;
    const totalRevenue = getRuleRevenue(rule);
    const allSOs = getRuleSOs(rule);
    const isDirty = hasUnsavedChanges(rule.id);
    const techName = technicians.find(t => t.id === rule.technician_id)?.name || "";
    const search = (groupSearch[rule.id] || "").toLowerCase();

    // Available groups for this technician
    const techGroups = rule.technician_id ? getGroupsForTechnician(rule.technician_id) : [];
    const filteredGroups = techGroups.filter(gid => {
      if (rule.group_ids.includes(gid)) return false; // already selected
      if (search && !gid.toLowerCase().includes(search)) return false;
      return true;
    });

    return (
      <Card key={rule.id} className="border-border/50">
        <CardHeader className="flex flex-row items-start justify-between pb-3 gap-4">
          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                value={rule.rule_name}
                onChange={(e) => handleRuleNameChange(rule.id, e.target.value)}
                placeholder="Nome da regra / técnico"
                className="h-8 text-sm font-semibold max-w-[250px]"
              />
              <Badge variant={rule.technician_id ? "secondary" : "outline"} className="h-8 px-2 text-[10px]">
                {techName ? `Técnico: ${techName}` : "Técnico não resolvido"}
              </Badge>
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={rule.is_active}
                  onCheckedChange={(v) => updateLocalRule(rule.id, r => ({ ...r, is_active: v }))}
                />
                <span className="text-[10px] text-muted-foreground">{rule.is_active ? "Ativa" : "Inativa"}</span>
              </div>
            </div>
            {techName && (
              <p className="text-[10px] text-muted-foreground">
                Técnico: <span className="font-medium text-foreground">{techName}</span>
                {" · "}{rule.group_ids.length} grupo{rule.group_ids.length !== 1 ? "s" : ""}
                {" · "}{allSOs.length} OS · Receita: {formatCurrency(totalRevenue)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isDirty && (
              <>
                <Button
                  size="icon"
                  className="h-8 w-8"
                  disabled={!isRuleValid(rule) || saveRuleMutation.isPending}
                  onClick={() => saveRuleMutation.mutate(rule)}
                  title="Salvar"
                >
                  {saveRuleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => discardLocalRule(rule.id)} title="Cancelar">
                  <X className="h-4 w-4" />
                </Button>
              </>
            )}
            {!rule._isNew && !isDirty && (
              <Button
                size="icon"
                className="h-8 w-8"
                disabled={!isRuleValid(rule) || saveRuleMutation.isPending}
                onClick={() => saveRuleMutation.mutate(rule)}
                title="Salvar"
                variant="outline"
              >
                <Save className="h-4 w-4" />
              </Button>
            )}
            {!rule._isNew && (
              <Button
                variant="destructive"
                size="icon"
                className="h-8 w-8"
                onClick={() => { if (confirm("Excluir esta regra permanentemente?")) deleteRuleMutation.mutate(rule.id); }}
                disabled={deleteRuleMutation.isPending}
                title="Excluir"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Selected groups */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Grupos vinculados
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {rule.group_ids.length} grupo{rule.group_ids.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            {rule.group_ids.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {rule.group_ids.map(gid => {
                  const info = availableGroups.get(gid);
                  return (
                    <Badge key={gid} variant="outline" className="text-[10px] gap-1 pr-1">
                      <span className="font-mono">{gid}</span>
                      {info && <span className="text-muted-foreground">({info.count} OS · {formatCurrency(info.total)})</span>}
                      <button
                        className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5"
                        onClick={() => toggleGroupInRule(rule.id, gid)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
            {/* Add groups */}
            <div className="space-y-1">
              <Input
                value={groupSearch[rule.id] || ""}
                onChange={(e) => setGroupSearch(prev => ({ ...prev, [rule.id]: e.target.value }))}
                placeholder="Pesquisar grupo..."
                className="h-7 text-xs max-w-[250px]"
              />
              {filteredGroups.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
                  {filteredGroups.map(gid => {
                    const info = availableGroups.get(gid);
                    const isOther = groupAssignedToOther(gid, rule.id);
                    return (
                      <label
                        key={gid}
                        className={`flex items-center gap-1.5 rounded-md border px-2 py-1 cursor-pointer hover:bg-muted/50 transition-colors text-[10px] ${
                          isOther ? "border-amber-500/50" : "border-border"
                        }`}
                      >
                        <Checkbox
                          checked={false}
                          onCheckedChange={() => toggleGroupInRule(rule.id, gid)}
                        />
                        <span className="font-mono">{gid}</span>
                        {info && (
                          <span className="text-muted-foreground">
                            {info.week && `S${info.week} · `}{info.count} OS · {formatCurrency(info.total)}
                          </span>
                        )}
                        {isOther && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                      </label>
                    );
                  })}
                </div>
              )}
              {filteredGroups.length === 0 && rule.technician_id && (
                <p className="text-[10px] text-muted-foreground">Nenhum grupo disponível</p>
              )}
              {!rule.technician_id && (
                <p className="text-[10px] text-muted-foreground">
                  O nome da regra deve corresponder a um técnico existente para carregar os grupos.
                </p>
              )}
            </div>
          </div>

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
                      {formatCurrency(totalRevenue * item.percentage / 100)}
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

          {/* Per-group breakdown */}
          {valid && rule.group_ids.length > 0 && rule.is_active && (
            <div className="mt-4 pt-4 border-t border-border/30 space-y-3">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
                <Users className="h-3.5 w-3.5" />
                Distribuição por Grupo
              </h3>
              {rule.group_ids.map(gid => {
                const groupSOs = getGroupSOs(gid);
                const groupRev = getGroupRevenue(gid);
                if (groupSOs.length === 0) return null;
                return (
                  <div key={gid} className="space-y-1">
                    <p className="text-[10px] font-mono text-muted-foreground">
                      Grupo: {gid} · {groupSOs.length} OS · {formatCurrency(groupRev)}
                    </p>
                    <div className="rounded-lg border border-border/50 overflow-auto max-h-[200px]">
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
                          {groupSOs.map((so: any) => {
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
                          <TableRow className="text-xs font-semibold border-t-2">
                            <TableCell colSpan={2}>TOTAL</TableCell>
                            <TableCell className="text-right">{formatCurrency(groupRev)}</TableCell>
                            {rule.items.map(item => (
                              <TableCell key={item.id} className="text-right">
                                {formatCurrency(Math.round(groupRev * item.percentage / 100 * 100) / 100)}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                );
              })}
              {/* Consolidated total */}
              <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Total Consolidado ({rule.group_ids.length} grupos)</span>
                  <span className="text-sm font-bold">{formatCurrency(totalRevenue)}</span>
                </div>
                <div className="flex flex-wrap gap-3 mt-2">
                  {rule.items.map(item => (
                    <span key={item.id} className="text-[10px] text-muted-foreground">
                      {item.participant_name || item.participant_type}: {formatCurrency(Math.round(totalRevenue * item.percentage / 100 * 100) / 100)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <PieChartIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Distribuição de Lucros</h1>
            <p className="text-xs text-muted-foreground">
              Regras por técnico com múltiplos grupos · Cálculos baseados em Ordens de Serviço reais
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
          <Button variant="outline" size="sm" onClick={() => addRule()}>
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

      {allRules.map(renderRuleCard)}

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
