import { useState, useMemo, useCallback, useEffect } from "react";
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
import { BulkDeleteDialog } from "@/components/shared/BulkDeleteDialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  PieChart as PieChartIcon, Plus, Save, Trash2, Loader2,
  AlertTriangle, Check, Users, FolderPlus, X, ChevronDown, ChevronRight, Search,
} from "lucide-react";
import { splitCents, toCents } from "@/lib/distributionMath";

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
  group_ids: string[];
  is_active: boolean;
  items: RuleItem[];
  _isNew?: boolean;
  _dirty?: boolean;
}

const PARTICIPANT_TYPES = [
  { value: "technician", label: "Técnico" },
  { value: "partner", label: "Sócio" },
  { value: "company", label: "Empresa" },
  { value: "client", label: "Cliente" },
  { value: "other", label: "Outros" },
] as const;

// ─── Color System ───

type ParticipantType = RuleItem["participant_type"];

const TYPE_PALETTES: Record<ParticipantType, string[]> = {
  client:     ["#FACC15", "#FBBF24", "#F59E0B"],
  technician: ["#60A5FA", "#3B82F6", "#2563EB"],
  partner:    ["#34D399", "#10B981", "#059669"],
  company:    ["#A78BFA", "#8B5CF6", "#7C3AED"],
  other:      ["#F87171", "#EF4444", "#DC2626"],
};

function getColor(type: ParticipantType, index: number): string {
  const palette = TYPE_PALETTES[type] || TYPE_PALETTES.other;
  return palette[index % palette.length];
}

function getGlowStyle(color: string): React.CSSProperties {
  // Extract rgb for text-shadow
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return {
    color,
    textShadow: `0 0 6px rgba(${r}, ${g}, ${b}, 0.25)`,
  };
}

/** Compute stable index for a participant within its type group */
function getTypeIndex(items: RuleItem[], itemId: string): number {
  const item = items.find(i => i.id === itemId);
  if (!item) return 0;
  const sameType = items.filter(i => i.participant_type === item.participant_type);
  return sameType.findIndex(i => i.id === itemId);
}

// ─── Component ───

export function ProfitDistribution() {
  const { formatCurrency } = useLanguage();
  const queryClient = useQueryClient();

  const [localRules, setLocalRules] = useState<ProfitRule[]>([]);
  const [groupPopoverSearch, setGroupPopoverSearch] = useState<Record<string, string>>({});
  const [deleteRuleTarget, setDeleteRuleTarget] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [search, setSearch] = useState("");
  const [openRules, setOpenRules] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem("profit-rules-open");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem("profit-rules-open", JSON.stringify(openRules)); } catch {}
  }, [openRules]);

  const toggleOpen = (id: string) => setOpenRules(prev => ({ ...prev, [id]: !prev[id] }));

  // ── Queries ──
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

  const rules = fetchedRules;

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
    getItemsTotal(rule.items) === 100 && rule.rule_name.trim().length > 0 && rule.group_ids.length > 0;

  const getGroupSOs = (groupId: string) =>
    serviceOrders.filter((so: any) => so.group_id === groupId);

  const getGroupRevenue = (groupId: string) =>
    getGroupSOs(groupId).reduce((s: number, so: any) => s + Number(so.total || 0), 0);

  const getRuleRevenue = (rule: ProfitRule) =>
    rule.group_ids.reduce((s, gid) => s + getGroupRevenue(gid), 0);

  const getRuleSOs = (rule: ProfitRule) =>
    rule.group_ids.flatMap(gid => getGroupSOs(gid));

  const handleRuleNameChange = (ruleId: string, value: string) => {
    updateLocalRule(ruleId, (rule) => ({
      ...rule,
      rule_name: value,
    }));
  };

  const hasUnsavedChanges = useCallback((ruleId: string) => {
    return localRules.some(lr => lr.id === ruleId);
  }, [localRules]);

  const groupAssignedToOther = (groupId: string, currentRuleId: string) => {
    return allRules.some(r => r.id !== currentRuleId && r.is_active && r.group_ids.includes(groupId));
  };

  // ── Rule CRUD (local state) ──
  const addRule = () => {
    const newRule: ProfitRule = {
      id: crypto.randomUUID(),
      rule_name: "",
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
      const group_ids = Array.from(new Set(rule.group_ids.filter(Boolean)));
      const participants = rule.items.map((item) => ({
        participant_name: item.participant_name.trim(),
        percentage: Number(item.percentage) || 0,
        participant_type: item.participant_type,
      }));

      if (!rule.rule_name.trim()) throw new Error("Nome da regra é obrigatório");
      if (group_ids.length === 0) throw new Error("Selecione pelo menos um grupo");
      if (getItemsTotal(rule.items) !== 100) throw new Error("A soma das percentagens deve ser 100%");

      console.log("Saving rule:", { rule_name: rule.rule_name, group_ids, participants, isNew: !!rule._isNew });

      let ruleId: string;

      if (rule._isNew) {
        const { data: savedRule, error: ruleError } = await supabase
          .from("profit_rules")
          .insert({ rule_name: rule.rule_name, group_ids, is_active: rule.is_active } as any)
          .select("id")
          .single();
        if (ruleError) throw ruleError;
        ruleId = savedRule.id;
      } else {
        const { error: ruleError } = await supabase
          .from("profit_rules")
          .update({ rule_name: rule.rule_name, group_ids, is_active: rule.is_active, updated_at: new Date().toISOString() } as any)
          .eq("id", rule.id);
        if (ruleError) throw ruleError;
        ruleId = rule.id;
      }

      await supabase.from("profit_rule_items").delete().eq("rule_id", ruleId);
      const items = participants.map(i => ({
        rule_id: ruleId,
        participant_name: i.participant_name,
        percentage: i.percentage,
        participant_type: i.participant_type,
      }));
      const { error: itemsError } = await supabase.from("profit_rule_items").insert(items);
      if (itemsError) throw itemsError;

      const allSOs = group_ids.flatMap(gid => getGroupSOs(gid));
      if (allSOs.length > 0) {
        const soIds = allSOs.map((so: any) => so.id);
        await supabase.from("service_order_distributions").delete().in("service_order_id", soIds);

        // Use SHARED canonical integer-cents splitter from
        // src/lib/distributionMath.ts — same as useParticipantAggregation.
        const pctsArr = participants.map((p) => p.percentage);
        const distributions = allSOs.flatMap((so: any) => {
          const totalCents = toCents(so.total);
          const parts = splitCents(totalCents, pctsArr);
          return participants.map((item, i) => ({
            service_order_id: so.id,
            participant_name: item.participant_name,
            percentage: item.percentage,
            calculated_value: parts[i] / 100,
          }));
        });
        if (distributions.length > 0) {
          await supabase.from("service_order_distributions").insert(distributions);
        }

        const techIdx = participants.findIndex(i => i.participant_type === "technician");
        if (techIdx >= 0) {
          const techPct = participants[techIdx].percentage;
          for (const so of allSOs) {
            const totalCents = toCents((so as any).total);
            const parts = splitCents(totalCents, pctsArr);
            await supabase.from("service_orders").update({
              technician_percentage: techPct,
              technician_earning: parts[techIdx] / 100,
              updated_at: new Date().toISOString(),
            }).eq("id", (so as any).id);
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
      setDeleteRuleTarget(null);
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
      setShowDeleteAll(false);
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

  const renderRuleCard = (rule: ProfitRule) => {
    const itemsTotal = getItemsTotal(rule.items);
    const valid = itemsTotal === 100;
    const totalRevenue = getRuleRevenue(rule);
    const allSOs = getRuleSOs(rule);
    const isDirty = hasUnsavedChanges(rule.id);
    const popoverSearch = (groupPopoverSearch[rule.id] || "").toLowerCase();

    const allGroupIds = Array.from(availableGroups.keys());
    const unselectedGroups = allGroupIds.filter(gid => {
      if (rule.group_ids.includes(gid)) return false;
      if (popoverSearch) {
        const info = availableGroups.get(gid);
        const searchStr = `${gid} ${info?.week || ""} ${Array.from(info?.techNames || []).join(" ")}`.toLowerCase();
        if (!searchStr.includes(popoverSearch)) return false;
      }
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
                placeholder="Nome da regra"
                className="h-8 text-sm font-semibold max-w-[250px]"
              />
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={rule.is_active}
                  onCheckedChange={(v) => updateLocalRule(rule.id, r => ({ ...r, is_active: v }))}
                />
                <span className="text-[10px] text-muted-foreground">{rule.is_active ? "Ativa" : "Inativa"}</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {rule.group_ids.length} grupo{rule.group_ids.length !== 1 ? "s" : ""}
              {" · "}{allSOs.length} OS · Receita: {formatCurrency(totalRevenue)}
            </p>
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
                onClick={() => setDeleteRuleTarget(rule.id)}
                disabled={deleteRuleMutation.isPending}
                title="Excluir"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Selected groups + dropdown multi-select */}
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
                      {info && <span className="text-muted-foreground">({info.week && `S${info.week} · `}{info.count} OS · {formatCurrency(info.total)})</span>}
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
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Selecionar grupos
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[340px] p-2" align="start">
                <Input
                  value={groupPopoverSearch[rule.id] || ""}
                  onChange={(e) => setGroupPopoverSearch(prev => ({ ...prev, [rule.id]: e.target.value }))}
                  placeholder="Pesquisar grupo..."
                  className="h-7 text-xs mb-2"
                />
                <div className="max-h-[220px] overflow-y-auto space-y-0.5">
                  {unselectedGroups.length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-4">Nenhum grupo disponível</p>
                  )}
                  {unselectedGroups.map(gid => {
                    const info = availableGroups.get(gid);
                    const isOther = groupAssignedToOther(gid, rule.id);
                    return (
                      <label
                        key={gid}
                        className={`flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors text-xs ${
                          isOther ? "border border-destructive/50" : ""
                        }`}
                      >
                        <Checkbox
                          checked={false}
                          onCheckedChange={() => toggleGroupInRule(rule.id, gid)}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-[10px]">{gid}</span>
                          {info && (
                            <span className="text-muted-foreground text-[10px] ml-1.5">
                              {info.week && `Semana ${info.week} · `}{info.count} OS · {formatCurrency(info.total)}
                            </span>
                          )}
                        </div>
                        {isOther && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
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
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3">
              <Check className="h-4 w-4 text-primary shrink-0" />
              <p className="text-xs text-primary font-medium">
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
                {rule.items.map((item) => {
                  const typeIdx = getTypeIndex(rule.items, item.id);
                  const itemColor = getColor(item.participant_type, typeIdx);
                  const glowStyle = getGlowStyle(itemColor);
                  return (
                    <TableRow key={item.id} className="text-xs">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: itemColor }} />
                          <Input
                            value={item.participant_name}
                            onChange={(e) => updateItem(rule.id, item.id, "participant_name", e.target.value)}
                            placeholder="Nome do participante"
                            className="h-8 text-xs"
                          />
                        </div>
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
                        <span style={glowStyle}>
                          {formatCurrency(totalRevenue * item.percentage / 100)}
                        </span>
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
                  );
                })}
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
              <span className={itemsTotal === 100 ? "text-primary" : "text-destructive"}>
                {itemsTotal}%
              </span>
            </div>
            <div className="h-3 rounded-full bg-muted flex overflow-hidden">
              {rule.items.map((item) => {
                const typeIdx = getTypeIndex(rule.items, item.id);
                const itemColor = getColor(item.participant_type, typeIdx);
                return (
                  <div
                    key={item.id}
                    className="h-full transition-all"
                    style={{
                      width: `${Math.min(item.percentage, 100)}%`,
                      backgroundColor: itemColor,
                    }}
                    title={`${item.participant_name}: ${item.percentage}%`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {rule.items.map(item => {
                const typeIdx = getTypeIndex(rule.items, item.id);
                const itemColor = getColor(item.participant_type, typeIdx);
                return (
                  <div key={item.id} className="flex items-center gap-1.5 text-[10px]">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: itemColor }} />
                    <span className="text-muted-foreground">{item.participant_name || "—"} ({item.percentage}%)</span>
                  </div>
                );
              })}
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
                            {rule.items.map(item => {
                              const typeIdx = getTypeIndex(rule.items, item.id);
                              const itemColor = getColor(item.participant_type, typeIdx);
                              return (
                                <TableHead key={item.id} className="text-right">
                                  <span style={getGlowStyle(itemColor)}>
                                    {item.participant_name || item.participant_type} ({item.percentage}%)
                                  </span>
                                </TableHead>
                              );
                            })}
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
                                {rule.items.map(item => {
                                  const typeIdx = getTypeIndex(rule.items, item.id);
                                  const itemColor = getColor(item.participant_type, typeIdx);
                                  return (
                                    <TableCell key={item.id} className="text-right">
                                      <span style={getGlowStyle(itemColor)}>
                                        {formatCurrency(Math.round(soTotal * item.percentage / 100 * 100) / 100)}
                                      </span>
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            );
                          })}
                          <TableRow className="text-xs font-semibold border-t-2">
                            <TableCell colSpan={2}>TOTAL</TableCell>
                            <TableCell className="text-right">{formatCurrency(groupRev)}</TableCell>
                            {rule.items.map(item => {
                              const typeIdx = getTypeIndex(rule.items, item.id);
                              const itemColor = getColor(item.participant_type, typeIdx);
                              return (
                                <TableCell key={item.id} className="text-right">
                                  <span style={getGlowStyle(itemColor)}>
                                    {formatCurrency(Math.round(groupRev * item.percentage / 100 * 100) / 100)}
                                  </span>
                                </TableCell>
                              );
                            })}
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
                  {rule.items.map(item => {
                    const typeIdx = getTypeIndex(rule.items, item.id);
                    const itemColor = getColor(item.participant_type, typeIdx);
                    return (
                      <span key={item.id} className="text-[10px]" style={getGlowStyle(itemColor)}>
                        {item.participant_name || item.participant_type}: {formatCurrency(Math.round(totalRevenue * item.percentage / 100 * 100) / 100)}
                      </span>
                    );
                  })}
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
      {/* Delete single rule confirmation */}
      <AlertDialog open={!!deleteRuleTarget} onOpenChange={(v) => !v && setDeleteRuleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Confirmar exclusão
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta regra? Esta ação <strong className="text-destructive">não pode ser desfeita</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteRuleTarget(null)}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => deleteRuleTarget && deleteRuleMutation.mutate(deleteRuleTarget)}
              disabled={deleteRuleMutation.isPending}
            >
              {deleteRuleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Excluir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete all rules confirmation */}
      <AlertDialog open={showDeleteAll} onOpenChange={(v) => !v && setShowDeleteAll(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Excluir TODAS as regras
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong className="text-foreground">TODAS as regras</strong>? Esta ação <strong className="text-destructive">não pode ser desfeita</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteAll(false)}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => deleteAllMutation.mutate()}
              disabled={deleteAllMutation.isPending}
            >
              {deleteAllMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Excluir Todas
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <PieChartIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Distribuição de Lucros</h1>
            <p className="text-xs text-muted-foreground">
              Regras com múltiplos grupos · Cálculos baseados em Ordens de Serviço reais
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {allRules.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteAll(true)}
              disabled={deleteAllMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Excluir Todas
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => addRule()}>
            <FolderPlus className="h-4 w-4 mr-1" /> Nova Regra
          </Button>
        </div>
      </div>

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

      {/* Summary */}
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
