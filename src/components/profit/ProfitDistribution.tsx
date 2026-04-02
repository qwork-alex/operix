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
import { PieChart as PieChartIcon, Plus, Save, Trash2, Loader2, AlertTriangle, Check, Users, FolderPlus } from "lucide-react";

// ─── Types ───

interface RuleUser {
  id: string;
  name: string;
  percentage: number;
  type: "technician" | "partner" | "company" | "client" | "custom";
}

interface RuleGroup {
  id: string;
  name: string;
  users: RuleUser[];
}

interface CalculatedShare {
  name: string;
  type: string;
  percentage: number;
  amount: number;
}

interface CorrectionEntry {
  orderId: string;
  car_name: string;
  license_plate: string;
  client_name: string;
  total: number;
}

const RULE_TYPES = [
  { value: "technician", label: "Técnico" },
  { value: "partner", label: "Sócio" },
  { value: "company", label: "Empresa" },
  { value: "client", label: "Cliente" },
  { value: "custom", label: "Outros" },
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
  const [ruleGroups, setRuleGroups] = useState<RuleGroup[]>([]);
  const [initialized, setInitialized] = useState(false);

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

  // ── Initialize rule groups from DB ──
  useEffect(() => {
    if (initialized || distLoading) return;

    const ruleRows = distributions.filter((d: any) => d.scope === "rule");
    if (ruleRows.length > 0) {
      // Group by notes field which stores "groupId::groupName"
      const groupMap = new Map<string, { name: string; users: RuleUser[] }>();
      ruleRows.forEach((r: any) => {
        const notesStr = r.notes || "";
        const [groupId, groupName, userName, userType] = notesStr.split("::");
        const gid = groupId || crypto.randomUUID();
        if (!groupMap.has(gid)) {
          groupMap.set(gid, { name: groupName || "Regra", users: [] });
        }
        groupMap.get(gid)!.users.push({
          id: r.id,
          name: userName || "Sem nome",
          percentage: Number(r.tech_share),
          type: (userType as RuleUser["type"]) || "custom",
        });
      });
      const groups: RuleGroup[] = [];
      groupMap.forEach((val, key) => {
        groups.push({ id: key, name: val.name, users: val.users });
      });
      setRuleGroups(groups);
    } else {
      // Migrate from old format or create defaults
      const def = distributions.find((d: any) => d.scope === "default");
      const defaultUsers: RuleUser[] = [
        { id: crypto.randomUUID(), name: "Técnico", percentage: 40, type: "technician" },
        { id: crypto.randomUUID(), name: "Sócio", percentage: 30, type: "partner" },
        { id: crypto.randomUUID(), name: "Empresa", percentage: 30, type: "company" },
      ];
      if (def) {
        defaultUsers[0].percentage = Number(def.tech_share);
        defaultUsers[1].percentage = Number(def.partner_share);
        defaultUsers[2].percentage = Number(def.company_share);
      }
      setRuleGroups([{ id: crypto.randomUUID(), name: "Regra Principal", users: defaultUsers }]);
    }
    setInitialized(true);
  }, [distributions, distLoading, initialized]);

  // ── Derived values ──
  const totalRevenue = useMemo(() => (paymentOrders ?? []).reduce((s, o: any) => s + Number(o.total || 0), 0), [paymentOrders]);

  const getGroupTotal = (group: RuleGroup) => group.users.reduce((s, u) => s + u.percentage, 0);
  const isGroupValid = (group: RuleGroup) => getGroupTotal(group) === 100;
  const allValid = ruleGroups.length > 0 && ruleGroups.every(isGroupValid);

  // ── Rule Group CRUD ──
  const addRuleGroup = () => {
    setRuleGroups(prev => [...prev, {
      id: crypto.randomUUID(),
      name: `Regra ${prev.length + 1}`,
      users: [
        { id: crypto.randomUUID(), name: "", percentage: 100, type: "custom" },
      ],
    }]);
  };

  const deleteRuleGroup = (groupId: string) => {
    setRuleGroups(prev => prev.filter(g => g.id !== groupId));
  };

  const updateGroupName = (groupId: string, name: string) => {
    setRuleGroups(prev => prev.map(g => g.id === groupId ? { ...g, name } : g));
  };

  const addUserToGroup = (groupId: string) => {
    setRuleGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      const remaining = Math.max(0, 100 - getGroupTotal(g));
      return {
        ...g,
        users: [...g.users, {
          id: crypto.randomUUID(),
          name: "",
          percentage: remaining,
          type: "custom" as const,
        }],
      };
    }));
  };

  const updateUser = (groupId: string, userId: string, field: keyof RuleUser, value: string | number) => {
    setRuleGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        users: g.users.map(u => u.id === userId ? { ...u, [field]: value } : u),
      };
    }));
  };

  const deleteUser = (groupId: string, userId: string) => {
    setRuleGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      if (g.users.length <= 1) return g; // keep at least 1
      return { ...g, users: g.users.filter(u => u.id !== userId) };
    }));
  };

  // ── Save to DB ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!allValid) throw new Error("Todas as regras devem totalizar 100%");

      // Delete all existing rule rows
      await supabase.from("profit_distributions").delete().eq("scope", "rule");
      await supabase.from("profit_distributions").delete().in("scope", ["default", "user", "order"]);

      // Insert one row per user per group
      const payload = ruleGroups.flatMap(group =>
        group.users.map(u => ({
          scope: "rule" as string,
          tech_share: u.percentage,
          partner_share: 0,
          company_share: 0,
          notes: `${group.id}::${group.name}::${u.name}::${u.type}`,
          updated_at: new Date().toISOString(),
        }))
      );

      const { error } = await supabase.from("profit_distributions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profit-distributions"] });
      toast.success("Regras de distribuição salvas com sucesso");
    },
    onError: (err: any) => {
      console.error("Profit distribution save error:", err);
      toast.error(err?.message || "Erro ao salvar configuração");
    },
  });

  // ── Automatic Distribution per Rule Group ──
  const getGroupDistributions = (group: RuleGroup): CalculatedShare[] => {
    if (!isGroupValid(group) || serviceOrders.length === 0) return [];

    const technicianIds = new Set<string>();
    serviceOrders.forEach((so: any) => {
      if (so.technician_id) technicianIds.add(so.technician_id);
    });
    const techCount = Math.max(1, technicianIds.size);

    const results: CalculatedShare[] = [];

    group.users.forEach(u => {
      if (u.type === "technician" && techCount > 1) {
        // Match technician by name if possible, otherwise split equally
        const matchedTech = technicians.find((t: any) => t.name?.toLowerCase() === u.name?.toLowerCase());
        if (matchedTech) {
          // Get revenue from service orders for this specific technician
          const techRevenue = serviceOrders
            .filter((so: any) => so.technician_id === matchedTech.id)
            .reduce((s: number, so: any) => s + Number(so.total || 0), 0);
          results.push({
            name: u.name,
            type: "technician",
            percentage: u.percentage,
            amount: techRevenue * u.percentage / 100,
          });
        } else {
          // Split among all technicians
          technicianIds.forEach(techId => {
            const tech = technicians.find((t: any) => t.id === techId);
            results.push({
              name: tech?.name || techId.slice(0, 8),
              type: "technician",
              percentage: Number((u.percentage / techCount).toFixed(2)),
              amount: totalRevenue * (u.percentage / 100) / techCount,
            });
          });
        }
      } else {
        results.push({
          name: u.name,
          type: u.type,
          percentage: u.percentage,
          amount: totalRevenue * u.percentage / 100,
        });
      }
    });

    return results;
  };

  // ── Correction entries: orders missing technician ──
  const correctionEntries = useMemo<CorrectionEntry[]>(() => {
    return serviceOrders
      .filter((so: any) => !so.technician_id && Number(so.total || 0) > 0)
      .map((so: any) => ({
        orderId: so.id,
        car_name: so.car_name || "—",
        license_plate: so.license_plate || "—",
        client_name: (so as any).clients?.name || "—",
        total: Number(so.total || 0),
      }));
  }, [serviceOrders]);

  const [correctionTechNames, setCorrectionTechNames] = useState<Record<string, string>>({});

  const assignTechnician = async (orderId: string) => {
    const techName = correctionTechNames[orderId]?.trim();
    if (!techName) {
      toast.error("Informe o nome do técnico");
      return;
    }
    // Find or match technician
    const matchedTech = technicians.find((t: any) => t.name?.toLowerCase() === techName.toLowerCase());
    const techId = matchedTech?.id;

    if (!techId) {
      toast.error("Técnico não encontrado. Cadastre-o primeiro.");
      return;
    }

    const { error } = await supabase
      .from("service_orders")
      .update({ technician_id: techId, updated_at: new Date().toISOString() })
      .eq("id", orderId);

    if (error) {
      console.error("Assign technician error:", error);
      toast.error("Erro ao atribuir técnico");
      return;
    }

    setCorrectionTechNames(prev => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    queryClient.invalidateQueries({ queryKey: ["service_orders"] });
    toast.success("Técnico atribuído com sucesso");
  };

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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addRuleGroup}>
            <FolderPlus className="h-4 w-4 mr-1" /> Criar Nova Regra
          </Button>
          <Button
            size="sm"
            disabled={!allValid || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* RULE GROUPS                                */}
      {/* ══════════════════════════════════════════ */}
      {ruleGroups.map((group) => {
        const groupTotal = getGroupTotal(group);
        const valid = groupTotal === 100;
        const groupDistributions = getGroupDistributions(group);

        return (
          <Card key={group.id} className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Input
                  value={group.name}
                  onChange={(e) => updateGroupName(group.id, e.target.value)}
                  className="h-8 text-sm font-semibold max-w-[250px]"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => addUserToGroup(group.id)}>
                  <Plus className="h-4 w-4 mr-1" /> Adicionar usuário
                </Button>
                {ruleGroups.length > 1 && (
                  <Button variant="destructive" size="sm" onClick={() => deleteRuleGroup(group.id)}>
                    <Trash2 className="h-4 w-4 mr-1" /> Excluir regra
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Validation banner */}
              {!valid && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                  <p className="text-xs text-destructive font-medium">
                    O total deve ser exatamente 100%. Atual: {groupTotal}%
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

              {/* Users table */}
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
                    {group.users.map((u) => (
                      <TableRow key={u.id} className="text-xs">
                        <TableCell>
                          <Input
                            value={u.name}
                            onChange={(e) => updateUser(group.id, u.id, "name", e.target.value)}
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
                              value={u.percentage}
                              onChange={(e) => updateUser(group.id, u.id, "percentage", Number(e.target.value))}
                              className="h-8 w-20 text-xs"
                            />
                            <span className="text-muted-foreground">%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={u.type}
                            onValueChange={(v) => updateUser(group.id, u.id, "type", v)}
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
                          {formatCurrency(totalRevenue * u.percentage / 100)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => deleteUser(group.id, u.id)}
                            disabled={group.users.length <= 1}
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
                  <span className={groupTotal === 100 ? "text-emerald-600" : "text-destructive"}>
                    {groupTotal}%
                  </span>
                </div>
                <div className="h-3 rounded-full bg-muted flex overflow-hidden">
                  {group.users.map((u) => (
                    <div
                      key={u.id}
                      className={`h-full transition-all ${
                        u.type === "technician" ? "bg-primary" :
                        u.type === "partner" ? "bg-accent" :
                        u.type === "company" ? "bg-emerald-500" :
                        u.type === "client" ? "bg-amber-500" :
                        "bg-muted-foreground/40"
                      }`}
                      style={{ width: `${Math.min(u.percentage, 100)}%` }}
                      title={`${u.name}: ${u.percentage}%`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-3 mt-2">
                  {group.users.map(u => (
                    <div key={u.id} className="flex items-center gap-1.5 text-[10px]">
                      <div className={`h-2 w-2 rounded-full ${
                        u.type === "technician" ? "bg-primary" :
                        u.type === "partner" ? "bg-accent" :
                        u.type === "company" ? "bg-emerald-500" :
                        u.type === "client" ? "bg-amber-500" :
                        "bg-muted-foreground/40"
                      }`} />
                      <span className="text-muted-foreground">{u.name || "—"} ({u.percentage}%)</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Distribuição Automática for this rule group ── */}
              {valid && groupDistributions.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border/30">
                  <h3 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    Distribuição Automática — {group.name}
                  </h3>
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
                        {groupDistributions.map((share, i) => (
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
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* ══════════════════════════════════════════ */}
      {/* SUMMARY                                    */}
      {/* ══════════════════════════════════════════ */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Resumo Geral</CardTitle>
        </CardHeader>
        <CardContent>
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
              <p className="text-[10px] text-muted-foreground">Regras Criadas</p>
              <p className="text-lg font-bold text-foreground">{ruleGroups.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════ */}
      {/* CORREÇÃO DE DISTRIBUIÇÃO                   */}
      {/* ══════════════════════════════════════════ */}
      {correctionEntries.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Correção de Distribuição
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              As ordens abaixo não possuem técnico atribuído. Atribua para incluir na distribuição.
            </p>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border/50 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead>Veículo</TableHead>
                    <TableHead>Placa</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-[200px]">Técnico</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {correctionEntries.map(entry => (
                    <TableRow key={entry.orderId} className="text-xs">
                      <TableCell>{entry.car_name}</TableCell>
                      <TableCell className="font-mono">{entry.license_plate}</TableCell>
                      <TableCell>{entry.client_name}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(entry.total)}</TableCell>
                      <TableCell>
                        <Select
                          value={correctionTechNames[entry.orderId] || ""}
                          onValueChange={(v) => setCorrectionTechNames(prev => ({ ...prev, [entry.orderId]: v }))}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Selecionar técnico" />
                          </SelectTrigger>
                          <SelectContent>
                            {technicians.map((t: any) => (
                              <SelectItem key={t.id} value={t.name} className="text-xs">
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
                          disabled={!correctionTechNames[entry.orderId]}
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
