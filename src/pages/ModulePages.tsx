import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  PieChart as PieChartIcon, BookOpen, Car, FolderOpen, Users, Settings,
  Plus, Save, Trash2, Upload, FolderPlus, ChevronRight, Loader2, Pencil,
  CheckSquare, MoveRight, Eye, Download, Printer, FileText, Check, X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

// ─── PROFIT DISTRIBUTION ───

function useAutoSaveDistribution() {
  const queryClient = useQueryClient();
  const debounceRef = useState<Record<string, ReturnType<typeof setTimeout>>>(() => ({}))[0];

  const mutation = useMutation({
    mutationFn: async (row: { id?: string; scope: string; target_user_id?: string | null; target_order_id?: string | null; tech_share: number; partner_share: number; company_share: number }) => {
      const payload = {
        scope: row.scope,
        target_user_id: row.target_user_id || null,
        target_order_id: row.target_order_id || null,
        tech_share: row.tech_share,
        partner_share: row.partner_share,
        company_share: row.company_share,
        updated_at: new Date().toISOString(),
      };
      if (row.id) {
        const { error } = await supabase.from("profit_distributions").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("profit_distributions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profit-distributions"] });
      queryClient.invalidateQueries({ queryKey: ["profit-summary"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const save = (key: string, row: Parameters<typeof mutation.mutate>[0]) => {
    if (debounceRef[key]) clearTimeout(debounceRef[key]);
    debounceRef[key] = setTimeout(() => mutation.mutate(row), 600);
  };

  return { save, isPending: mutation.isPending };
}

export function ProfitDistribution() {
  const { t, formatCurrency } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { save, isPending } = useAutoSaveDistribution();

  // Fetch all distributions
  const { data: distributions = [] } = useQuery({
    queryKey: ["profit-distributions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profit_distributions").select("*").order("scope");
      if (error) throw error;
      return data;
    },
  });

  // Fetch profiles for per-user distributions
  const { data: profiles = [] } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      return data;
    },
  });

  // Fetch service orders for per-order overrides
  const { data: orders = [] } = useQuery({
    queryKey: ["service_orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_orders").select("id, car_name, license_plate, total, platform").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: totalRevenue = 0 } = useQuery({
    queryKey: ["profit-summary"],
    queryFn: async () => {
      const { data } = await supabase.from("service_orders").select("total");
      return (data ?? []).reduce((s, o) => s + Number(o.total || 0), 0);
    },
  });

  // Get or create default distribution
  const defaultDist = distributions.find((d: any) => d.scope === "default") || { tech_share: 40, partner_share: 30, company_share: 30 };
  const userDists = distributions.filter((d: any) => d.scope === "user");
  const orderDists = distributions.filter((d: any) => d.scope === "order");

  // Local state for editable rows
  const [localDefault, setLocalDefault] = useState({ tech: 40, partner: 30, company: 30 });
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && distributions.length > 0) {
      const d = distributions.find((d: any) => d.scope === "default");
      if (d) setLocalDefault({ tech: Number(d.tech_share), partner: Number(d.partner_share), company: Number(d.company_share) });
      setInitialized(true);
    }
  }, [distributions, initialized]);

  // Initialize default if none exists
  useEffect(() => {
    if (initialized && !distributions.find((d: any) => d.scope === "default") && user) {
      save("default", { scope: "default", tech_share: 40, partner_share: 30, company_share: 30 });
    }
  }, [initialized, distributions, user]);

  const handleDefaultChange = (field: "tech" | "partner" | "company", value: number) => {
    const updated = { ...localDefault, [field]: value };
    if (field !== "company") updated.company = Math.max(0, 100 - updated.tech - updated.partner);
    setLocalDefault(updated);
    const existing = distributions.find((d: any) => d.scope === "default");
    save("default", {
      id: existing?.id,
      scope: "default",
      tech_share: updated.tech,
      partner_share: updated.partner,
      company_share: updated.company,
    });
  };

  const handleUserOverride = (userId: string, field: "tech_share" | "partner_share", value: number) => {
    const existing = userDists.find((d: any) => d.target_user_id === userId);
    const current = existing || { tech_share: localDefault.tech, partner_share: localDefault.partner, company_share: localDefault.company };
    const updated = { ...current, [field]: value };
    updated.company_share = Math.max(0, 100 - Number(updated.tech_share) - Number(updated.partner_share));
    save(`user-${userId}`, {
      id: existing?.id,
      scope: "user",
      target_user_id: userId,
      tech_share: Number(updated.tech_share),
      partner_share: Number(updated.partner_share),
      company_share: updated.company_share,
    });
  };

  const handleOrderOverride = (orderId: string, field: "tech_share" | "partner_share", value: number) => {
    const existing = orderDists.find((d: any) => d.target_order_id === orderId);
    const current = existing || { tech_share: localDefault.tech, partner_share: localDefault.partner, company_share: localDefault.company };
    const updated = { ...current, [field]: value };
    updated.company_share = Math.max(0, 100 - Number(updated.tech_share) - Number(updated.partner_share));
    save(`order-${orderId}`, {
      id: existing?.id,
      scope: "order",
      target_order_id: orderId,
      tech_share: Number(updated.tech_share),
      partner_share: Number(updated.partner_share),
      company_share: updated.company_share,
    });
  };

  const deleteOverride = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("profit_distributions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profit-distributions"] }),
    onError: (err) => toast.error((err as Error).message),
  });

  const [showUserOverride, setShowUserOverride] = useState(false);
  const [showOrderOverride, setShowOrderOverride] = useState(false);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <PieChartIcon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t("profit.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("profit.subtitle")}</p>
        </div>
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Default distribution + summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-sm">{t("profit.settings")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">{t("profit.techShare")}</Label>
              <Input type="number" min={0} max={100} value={localDefault.tech} onChange={e => handleDefaultChange("tech", Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("profit.partnerShare")}</Label>
              <Input type="number" min={0} max={100} value={localDefault.partner} onChange={e => handleDefaultChange("partner", Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("profit.companyShare")}</Label>
              <Input type="number" value={localDefault.company} disabled className="bg-muted/30" />
            </div>
            {localDefault.company < 0 && <p className="text-xs text-destructive">{t("profit.exceeds100")}</p>}
            <p className="text-[10px] text-muted-foreground italic">{t("profit.autoSaveHint")}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-sm">{t("profit.calculated")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center mb-4">
              <p className="text-xs text-muted-foreground">{t("profit.totalRevenue")}</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="space-y-3">
              {[
                { label: t("label.technician"), pct: localDefault.tech, color: "bg-primary" },
                { label: t("profit.partner"), pct: localDefault.partner, color: "bg-accent" },
                { label: t("profit.company"), pct: Math.max(0, localDefault.company), color: "bg-emerald-500" },
              ].map(item => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{item.label} ({item.pct}%)</span>
                    <span className="font-medium text-foreground">{formatCurrency(totalRevenue * item.pct / 100)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${Math.min(100, item.pct)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-user overrides */}
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">{t("profit.perUser")}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowUserOverride(!showUserOverride)}>
            {showUserOverride ? t("action.cancel") : <><Plus className="h-4 w-4 mr-1" />{t("action.add")}</>}
          </Button>
        </CardHeader>
        <CardContent>
          {userDists.length === 0 && !showUserOverride ? (
            <p className="text-xs text-muted-foreground text-center py-4">{t("profit.noUserOverrides")}</p>
          ) : (
            <div className="rounded-lg border border-border/50 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead>{t("label.name")}</TableHead>
                    <TableHead>{t("profit.techShare")}</TableHead>
                    <TableHead>{t("profit.partnerShare")}</TableHead>
                    <TableHead>{t("profit.companyShare")}</TableHead>
                    <TableHead>{t("label.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userDists.map((d: any) => {
                    const profile = profiles.find((p: any) => p.id === d.target_user_id);
                    return (
                      <TableRow key={d.id} className="text-xs">
                        <TableCell className="font-medium">{profile?.full_name || d.target_user_id?.slice(0, 8)}</TableCell>
                        <TableCell><Input type="number" min={0} max={100} defaultValue={d.tech_share} className="h-7 w-16 text-xs" onChange={e => handleUserOverride(d.target_user_id, "tech_share", Number(e.target.value))} /></TableCell>
                        <TableCell><Input type="number" min={0} max={100} defaultValue={d.partner_share} className="h-7 w-16 text-xs" onChange={e => handleUserOverride(d.target_user_id, "partner_share", Number(e.target.value))} /></TableCell>
                        <TableCell className="text-muted-foreground">{Math.max(0, 100 - Number(d.tech_share) - Number(d.partner_share))}%</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteOverride.mutate(d.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {showUserOverride && (
            <div className="mt-3 flex flex-wrap gap-2">
              {profiles.filter((p: any) => !userDists.find((d: any) => d.target_user_id === p.id)).map((p: any) => (
                <Button key={p.id} variant="outline" size="sm" className="text-xs" onClick={() => {
                  save(`user-${p.id}`, { scope: "user", target_user_id: p.id, tech_share: localDefault.tech, partner_share: localDefault.partner, company_share: localDefault.company });
                  setShowUserOverride(false);
                }}>
                  {p.full_name || p.email}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-order overrides */}
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">{t("profit.perOrder")}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowOrderOverride(!showOrderOverride)}>
            {showOrderOverride ? t("action.cancel") : <><Plus className="h-4 w-4 mr-1" />{t("action.add")}</>}
          </Button>
        </CardHeader>
        <CardContent>
          {orderDists.length === 0 && !showOrderOverride ? (
            <p className="text-xs text-muted-foreground text-center py-4">{t("profit.noOrderOverrides")}</p>
          ) : (
            <div className="rounded-lg border border-border/50 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead>{t("label.car")} / {t("label.plate")}</TableHead>
                    <TableHead>{t("label.total")}</TableHead>
                    <TableHead>{t("profit.techShare")}</TableHead>
                    <TableHead>{t("profit.partnerShare")}</TableHead>
                    <TableHead>{t("profit.companyShare")}</TableHead>
                    <TableHead>{t("label.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderDists.map((d: any) => {
                    const order = orders.find((o: any) => o.id === d.target_order_id);
                    return (
                      <TableRow key={d.id} className="text-xs">
                        <TableCell className="font-medium">{order ? `${order.car_name || ""} ${order.license_plate || ""}`.trim() || d.target_order_id?.slice(0, 8) : d.target_order_id?.slice(0, 8)}</TableCell>
                        <TableCell>{order ? formatCurrency(Number(order.total || 0)) : "—"}</TableCell>
                        <TableCell><Input type="number" min={0} max={100} defaultValue={d.tech_share} className="h-7 w-16 text-xs" onChange={e => handleOrderOverride(d.target_order_id, "tech_share", Number(e.target.value))} /></TableCell>
                        <TableCell><Input type="number" min={0} max={100} defaultValue={d.partner_share} className="h-7 w-16 text-xs" onChange={e => handleOrderOverride(d.target_order_id, "partner_share", Number(e.target.value))} /></TableCell>
                        <TableCell className="text-muted-foreground">{Math.max(0, 100 - Number(d.tech_share) - Number(d.partner_share))}%</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteOverride.mutate(d.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {showOrderOverride && (
            <div className="mt-3 max-h-40 overflow-y-auto space-y-1">
              {orders.filter((o: any) => !orderDists.find((d: any) => d.target_order_id === o.id)).slice(0, 20).map((o: any) => (
                <Button key={o.id} variant="outline" size="sm" className="text-xs w-full justify-start" onClick={() => {
                  save(`order-${o.id}`, { scope: "order", target_order_id: o.id, tech_share: localDefault.tech, partner_share: localDefault.partner, company_share: localDefault.company });
                  setShowOrderOverride(false);
                }}>
                  {`${o.car_name || ""} ${o.license_plate || ""}`.trim() || o.id.slice(0, 8)} — {formatCurrency(Number(o.total || 0))}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
// ─── ACCOUNTING ───
export function Accounting() {
  const { t, formatCurrency, formatDate } = useLanguage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ type: "expense", category: "other", amount: "", label: "", notes: "", status: "confirmed" });

  // Filters
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  const categories = [
    { value: "labor", label: "acc.catLabor" },
    { value: "material", label: "acc.catMaterial" },
    { value: "tax", label: "acc.catTax" },
    { value: "services", label: "acc.catServices" },
    { value: "other", label: "acc.catOther" },
  ];

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["financial_records"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_records").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Filter records
  const filtered = records.filter((r: any) => {
    if (filterType !== "all" && r.type !== filterType) return false;
    if (filterCategory !== "all" && (r.category || "other") !== filterCategory) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      const match = [r.notes, r.source, r.label, r.category].some(v => v && String(v).toLowerCase().includes(s));
      if (!match) return false;
    }
    return true;
  });

  // Summary calculations
  const totalIncome = filtered.filter((r: any) => r.type === "revenue").reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
  const totalExpenses = filtered.filter((r: any) => r.type === "expense").reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
  const netResult = totalIncome - totalExpenses;

  // Monthly data for chart
  const monthlyData = (() => {
    const months: Record<string, { month: string; revenue: number; expense: number }> = {};
    records.forEach((r: any) => {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!months[key]) months[key] = { month: key, revenue: 0, expense: 0 };
      if (r.type === "revenue") months[key].revenue += Number(r.amount || 0);
      else months[key].expense += Number(r.amount || 0);
    });
    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
  })();

  const addMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        type: form.type,
        source: form.label ? "manual" : "manual",
        category: form.category,
        label: form.label || null,
        amount: parseFloat(form.amount) || 0,
        notes: form.notes || null,
        status: form.status,
      };
      if (editId) {
        const { error } = await supabase.from("financial_records").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("financial_records").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial_records"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      setOpen(false);
      setEditId(null);
      setForm({ type: "expense", category: "other", amount: "", label: "", notes: "", status: "confirmed" });
      toast.success(editId ? t("toast.updated") : t("acc.entryAdded"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial_records"] });
      toast.success(t("toast.deleted"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const startEdit = (r: any) => {
    setEditId(r.id);
    setForm({
      type: r.type,
      category: r.category || "other",
      amount: String(r.amount),
      label: r.label || "",
      notes: r.notes || "",
      status: r.status || "confirmed",
    });
    setOpen(true);
  };

  const maxBar = Math.max(...monthlyData.map(m => Math.max(m.revenue, m.expense)), 1);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t("acc.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("acc.subtitle")}</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditId(null); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />{t("acc.addEntry")}</Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader><DialogTitle>{editId ? t("action.edit") : t("acc.newEntry")}</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("label.type")}</Label>
                  <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">{t("acc.expense")}</SelectItem>
                      <SelectItem value="revenue">{t("acc.revenue")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("label.category")}</Label>
                  <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c.value} value={c.value}>{t(c.label)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("label.amount")} (€)</Label>
                  <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("label.status")}</Label>
                  <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="confirmed">{t("status.confirmed")}</SelectItem>
                      <SelectItem value="pending">{t("status.pending")}</SelectItem>
                      <SelectItem value="paid">{t("status.paid")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("acc.label")}</Label>
                <Input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="ex: Facture #123" className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("label.notes")}</Label>
                <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="h-9" />
              </div>
              <Button className="w-full" onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !form.amount}>
                {addMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                {t("action.save")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-[11px] text-muted-foreground mb-1">{t("acc.totalIncome")}</p>
            <p className="text-xl font-bold text-emerald-500 tabular-nums">{formatCurrency(totalIncome)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-[11px] text-muted-foreground mb-1">{t("acc.totalExpenses")}</p>
            <p className="text-xl font-bold text-destructive tabular-nums">{formatCurrency(totalExpenses)}</p>
          </CardContent>
        </Card>
        <Card className={`border-border/50 ${netResult >= 0 ? "bg-emerald-500/5" : "bg-destructive/5"}`}>
          <CardContent className="pt-4 pb-3">
            <p className="text-[11px] text-muted-foreground mb-1">{t("acc.netResult")}</p>
            <p className={`text-xl font-bold tabular-nums ${netResult >= 0 ? "text-emerald-500" : "text-destructive"}`}>
              {netResult >= 0 ? "+" : ""}{formatCurrency(netResult)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly chart */}
      {monthlyData.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{t("acc.monthlyChart")}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-32">
              {monthlyData.map(m => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex gap-0.5 items-end" style={{ height: "100px" }}>
                    <div className="flex-1 bg-emerald-500/80 rounded-t" style={{ height: `${(m.revenue / maxBar) * 100}px` }} title={formatCurrency(m.revenue)} />
                    <div className="flex-1 bg-destructive/80 rounded-t" style={{ height: `${(m.expense / maxBar) * 100}px` }} title={formatCurrency(m.expense)} />
                  </div>
                  <span className="text-[9px] text-muted-foreground">{m.month.slice(5)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-2 justify-center">
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-2 h-2 rounded-sm bg-emerald-500/80" />{t("acc.revenue")}</span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-2 h-2 rounded-sm bg-destructive/80" />{t("acc.expense")}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("action.search")} className="h-8 w-48 text-xs" />
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("acc.allTypes")}</SelectItem>
            <SelectItem value="revenue">{t("acc.revenue")}</SelectItem>
            <SelectItem value="expense">{t("acc.expense")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("acc.allCategories")}</SelectItem>
            {categories.map(c => <SelectItem key={c.value} value={c.value}>{t(c.label)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("acc.allStatuses")}</SelectItem>
            <SelectItem value="confirmed">{t("status.confirmed")}</SelectItem>
            <SelectItem value="pending">{t("status.pending")}</SelectItem>
            <SelectItem value="paid">{t("status.paid")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">{t("acc.noEntries")}</div>
      ) : (
        <div className="rounded-lg border border-border/50 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead>{t("label.type")}</TableHead>
                <TableHead>{t("label.category")}</TableHead>
                <TableHead>{t("acc.label")}</TableHead>
                <TableHead className="text-right">{t("label.amount")}</TableHead>
                <TableHead>{t("label.status")}</TableHead>
                <TableHead>{t("acc.source")}</TableHead>
                <TableHead>{t("label.notes")}</TableHead>
                <TableHead>{t("label.date")}</TableHead>
                <TableHead>{t("label.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r: any) => {
                const catKey = categories.find(c => c.value === (r.category || "other"));
                return (
                  <TableRow key={r.id} className="text-xs">
                    <TableCell>
                      <Badge variant="outline" className={r.type === "revenue" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-destructive/10 text-destructive border-destructive/30"}>
                        {r.type === "revenue" ? t("acc.revenue") : t("acc.expense")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        {catKey ? t(catKey.label) : (r.category || r.source || "—")}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{r.label || "—"}</TableCell>
                    <TableCell className={`text-right font-medium tabular-nums ${r.type === "revenue" ? "text-emerald-500" : "text-destructive"}`}>
                      {r.type === "revenue" ? "+" : "-"}{formatCurrency(r.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        r.status === "paid" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : r.status === "pending" ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/30"
                          : ""
                      }>
                        {t(`status.${r.status}`, r.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[10px]">{r.source || "manual"}</TableCell>
                    <TableCell className="max-w-[150px] truncate text-muted-foreground">{r.notes || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(r)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(r.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
// ─── FLEET ───
export function Fleet() {
  const { t, formatDate } = useLanguage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", license_plate: "", brand: "", model: "", year: "" });

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*, technicians(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        license_plate: form.license_plate,
        brand: form.brand || null,
        model: form.model || null,
        year: form.year ? parseInt(form.year) : null,
      };
      if (editId) {
        const { error } = await supabase.from("vehicles").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vehicles").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setOpen(false);
      setEditId(null);
      setForm({ name: "", license_plate: "", brand: "", model: "", year: "" });
      toast.success(editId ? t("toast.updated") : t("fleet.vehicleAdded"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success(t("toast.deleted"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const startEdit = (v: any) => {
    setEditId(v.id);
    setForm({ name: v.name, license_plate: v.license_plate, brand: v.brand || "", model: v.model || "", year: v.year ? String(v.year) : "" });
    setOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Car className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t("fleet.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("fleet.subtitle")}</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditId(null); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />{t("fleet.addVehicle")}</Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader><DialogTitle>{editId ? t("action.edit") : t("fleet.newVehicle")}</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2"><Label className="text-xs">{t("label.name")}</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder={t("placeholder.vehicleName")} /></div>
              <div className="space-y-2"><Label className="text-xs">{t("label.plate")}</Label><Input value={form.license_plate} onChange={e => setForm(p => ({ ...p, license_plate: e.target.value }))} placeholder="AB-123-CD" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label className="text-xs">{t("fleet.brand")}</Label><Input value={form.brand} onChange={e => setForm(p => ({ ...p, brand: e.target.value }))} /></div>
                <div className="space-y-2"><Label className="text-xs">{t("fleet.model")}</Label><Input value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} /></div>
              </div>
              <div className="space-y-2"><Label className="text-xs">{t("fleet.year")}</Label><Input type="number" value={form.year} onChange={e => setForm(p => ({ ...p, year: e.target.value }))} /></div>
              <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name || !form.license_plate}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}{t("action.save")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : vehicles.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">{t("fleet.noVehicles")}</div>
      ) : (
        <div className="rounded-lg border border-border/50 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead>{t("label.name")}</TableHead>
                <TableHead>{t("label.plate")}</TableHead>
                <TableHead>{t("fleet.brand")}</TableHead>
                <TableHead>{t("fleet.model")}</TableHead>
                <TableHead>{t("fleet.year")}</TableHead>
                <TableHead>{t("fleet.assignedTo")}</TableHead>
                <TableHead>{t("label.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.map((v: any) => (
                <TableRow key={v.id} className="text-xs">
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell className="font-mono">{v.license_plate}</TableCell>
                  <TableCell>{v.brand || "—"}</TableCell>
                  <TableCell>{v.model || "—"}</TableCell>
                  <TableCell>{v.year || "—"}</TableCell>
                  <TableCell>{v.technicians?.name || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(v)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(v.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── DOCUMENTS ───
export function Documents() {
  const { t, formatDate } = useLanguage();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [parentId, setParentId] = useState<string | null>(null);
  const [path, setPath] = useState<{ id: string | null; name: string }[]>([{ id: null, name: t("common.root") }]);
  const [folderName, setFolderName] = useState("");
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [moveTarget, setMoveTarget] = useState<any>(null);
  const [moveDestination, setMoveDestination] = useState<string>("__root__");
  const [newFolderInMove, setNewFolderInMove] = useState("");
  const [previewDoc, setPreviewDoc] = useState<any>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["documents", parentId],
    queryFn: async () => {
      let q = supabase.from("documents").select("*")
        .or("entity_type.is.null,entity_type.eq.documents")
        .order("type", { ascending: true }).order("name");
      q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: allFolders = [] } = useQuery({
    queryKey: ["doc-folders-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, name, parent_id")
        .or("entity_type.is.null,entity_type.eq.documents")
        .eq("type", "folder")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: showMoveDialog,
  });

  const allSelected = docs.length > 0 && docs.every((d: any) => selectedIds.has(d.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(docs.map((d: any) => d.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const createFolder = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("documents").insert({
        name: folderName, type: "folder", parent_id: parentId, uploaded_by: user?.id, entity_type: "documents",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setShowFolderDialog(false);
      setFolderName("");
      toast.success(t("docs.folderCreated"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: any) => {
      if (doc.storage_path) {
        await supabase.storage.from("uploads").remove([doc.storage_path]);
      }
      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success(t("toast.deleted"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const docsToDelete = docs.filter((d: any) => ids.includes(d.id));
      const storagePaths = docsToDelete.filter((d: any) => d.storage_path).map((d: any) => d.storage_path);
      if (storagePaths.length > 0) await supabase.storage.from("uploads").remove(storagePaths);
      const { error } = await supabase.from("documents").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      clearSelection();
      toast.success(t("toast.deleted"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const moveMutation = useMutation({
    mutationFn: async ({ docIds, newParentId }: { docIds: string[]; newParentId: string | null }) => {
      const { error } = await supabase.from("documents").update({ parent_id: newParentId }).in("id", docIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setShowMoveDialog(false);
      setMoveTarget(null);
      clearSelection();
      toast.success(t("toast.updated"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const createFolderInMove = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.from("documents").insert({
        name, type: "folder", parent_id: null, uploaded_by: user?.id, entity_type: "documents",
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["doc-folders-all"] });
      setMoveDestination(id);
      setNewFolderInMove("");
      toast.success(t("docs.folderCreated"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const uploadFile = async (file: File) => {
    const storagePath = `documents/${Date.now()}_${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("uploads").upload(storagePath, file);
    if (uploadErr) { toast.error(uploadErr.message); return; }
    const { error } = await supabase.from("documents").insert({
      name: file.name, type: "file", parent_id: parentId, uploaded_by: user?.id,
      storage_path: storagePath, mime_type: file.type, size_bytes: file.size, entity_type: "documents",
    });
    if (error) toast.error(error.message);
    else {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success(t("docs.fileUploaded"));
    }
  };

  const navigateTo = (id: string | null, name: string) => {
    clearSelection();
    if (id === null) { setParentId(null); setPath([{ id: null, name: t("common.root") }]); return; }
    setParentId(id);
    const idx = path.findIndex(p => p.id === id);
    if (idx >= 0) setPath(path.slice(0, idx + 1));
    else setPath([...path, { id, name }]);
  };

  const handleDownload = async (doc: any) => {
    if (!doc.storage_path) return;
    const { data } = await supabase.storage.from("uploads").createSignedUrl(doc.storage_path, 300);
    if (data?.signedUrl) {
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = doc.name;
      a.click();
    }
  };

  const handlePreview = async (doc: any) => {
    if (!doc.storage_path) return;
    const { data } = await supabase.storage.from("uploads").createSignedUrl(doc.storage_path, 300);
    if (data?.signedUrl) setPreviewDoc({ ...doc, url: data.signedUrl });
  };

  const handlePrint = async (doc: any) => {
    if (!doc.storage_path) return;
    const { data } = await supabase.storage.from("uploads").createSignedUrl(doc.storage_path, 300);
    if (data?.signedUrl) {
      const w = window.open(data.signedUrl, "_blank");
      w?.addEventListener("load", () => w.print());
    }
  };

  const selectedArray = Array.from(selectedIds);
  const isBulkMode = selectedArray.length > 0;

  const openBulkMove = () => {
    setMoveTarget(null);
    setMoveDestination("__root__");
    setNewFolderInMove("");
    setShowMoveDialog(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FolderOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t("docs.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("docs.subtitle")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
            <DialogTrigger asChild><Button variant="outline" size="sm"><FolderPlus className="h-4 w-4 mr-1" />{t("docs.newFolder")}</Button></DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle>{t("docs.createFolder")}</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <Input value={folderName} onChange={e => setFolderName(e.target.value)} placeholder={t("label.name")} />
                <Button className="w-full" onClick={() => createFolder.mutate()} disabled={!folderName.trim()}>{t("action.save")}</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button size="sm" asChild>
            <label className="cursor-pointer">
              <Upload className="h-4 w-4 mr-1" />{t("action.upload")}
              <input type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) uploadFile(e.target.files[0]); e.target.value = ""; }} />
            </label>
          </Button>
        </div>
      </div>

      {/* Bulk action bar */}
      {isBulkMode && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-foreground">
            {selectedArray.length} {t("fm.selected")}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={openBulkMove}>
              <MoveRight className="h-3 w-3 mr-1" />{t("fm.move")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] text-destructive border-destructive/30"
              onClick={() => bulkDeleteMutation.mutate(selectedArray)}
            >
              <Trash2 className="h-3 w-3 mr-1" />{t("action.delete")}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={clearSelection}>
              {t("action.cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {path.map((p, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3" />}
            <button onClick={() => navigateTo(p.id, p.name)} className="hover:text-foreground">{p.name}</button>
          </span>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">{t("docs.emptyFolder")}</div>
      ) : (
        <div className="rounded-lg border border-border/50 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead className="w-8">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label={t("fm.selectAll")} />
                </TableHead>
                <TableHead>{t("label.name")}</TableHead>
                <TableHead>{t("label.type")}</TableHead>
                <TableHead>{t("docs.size")}</TableHead>
                <TableHead>{t("label.date")}</TableHead>
                <TableHead>{t("label.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d: any) => (
                <TableRow key={d.id} className={`text-xs ${selectedIds.has(d.id) ? "bg-primary/5" : ""}`}>
                  <TableCell className="w-8">
                    <Checkbox checked={selectedIds.has(d.id)} onCheckedChange={() => toggleSelect(d.id)} />
                  </TableCell>
                  <TableCell className="font-medium flex items-center gap-2 cursor-pointer" onClick={() => d.type === "folder" && navigateTo(d.id, d.name)}>
                    {d.type === "folder" ? <FolderOpen className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                    {d.name}
                  </TableCell>
                  <TableCell><Badge variant="outline">{d.type === "folder" ? t("common.folder") : t("common.file")}</Badge></TableCell>
                  <TableCell>{d.size_bytes ? `${(d.size_bytes / 1024).toFixed(1)} KB` : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(d.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {d.type === "file" && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePreview(d)} title={t("fm.preview")}>
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(d)} title={t("fm.download")}>
                            <Download className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrint(d)} title={t("fm.print")}>
                            <Printer className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                        setMoveTarget(d);
                        setMoveDestination("__root__");
                        setNewFolderInMove("");
                        setShowMoveDialog(true);
                      }} title={t("fm.move")}>
                        <MoveRight className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(d); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Move dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>{t("fm.moveTo")}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">
              {moveTarget
                ? <>{t("fm.moveFile")}: <strong>{moveTarget.name}</strong></>
                : <>{selectedArray.length} {t("fm.selected")}</>
              }
            </p>
            <Select value={moveDestination} onValueChange={setMoveDestination}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={t("fm.selectFolder")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__root__">{t("common.root")}</SelectItem>
                {allFolders
                  .filter((f: any) => f.id !== moveTarget?.id && !selectedIds.has(f.id))
                  .map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                value={newFolderInMove}
                onChange={(e) => setNewFolderInMove(e.target.value)}
                placeholder={t("fm.newFolderName")}
                className="h-8 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs shrink-0"
                disabled={!newFolderInMove.trim()}
                onClick={() => createFolderInMove.mutate(newFolderInMove.trim())}
              >
                <FolderPlus className="h-3 w-3 mr-1" />{t("action.add")}
              </Button>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                const ids = moveTarget ? [moveTarget.id] : selectedArray;
                const dest = moveDestination === "__root__" ? null : moveDestination;
                moveMutation.mutate({ docIds: ids, newParentId: dest });
              }}
            >
              {t("fm.move")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="bg-card border-border max-w-3xl max-h-[80vh]">
          <DialogHeader><DialogTitle>{previewDoc?.name}</DialogTitle></DialogHeader>
          <div className="overflow-auto max-h-[65vh]">
            {previewDoc?.mime_type?.startsWith("image/") ? (
              <img src={previewDoc.url} alt={previewDoc.name} className="max-w-full rounded" />
            ) : previewDoc?.mime_type === "application/pdf" ? (
              <iframe src={previewDoc.url} className="w-full h-[60vh] rounded" />
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <a href={previewDoc?.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{t("fm.download")}</a>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── USERS ───
export function UsersPage() {
  const { t, formatDate } = useLanguage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", role: "technician" });

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const roleMap = new Map(roles.map((r: any) => [r.user_id, r.role]));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("profiles").update({
          full_name: form.full_name,
          email: form.email || null,
          phone: form.phone || null,
          updated_at: new Date().toISOString(),
        }).eq("id", editId);
        if (error) throw error;

        const currentRole = roleMap.get(editId);
        if (currentRole !== form.role) {
          if (currentRole) {
            const { error: re } = await supabase.from("user_roles").update({ role: form.role as any }).eq("user_id", editId);
            if (re) throw re;
          } else {
            const { error: re } = await supabase.from("user_roles").insert({ user_id: editId, role: form.role as any });
            if (re) throw re;
          }
        }
      } else {
        const { data: authData, error: authErr } = await supabase.auth.signUp({
          email: form.email,
          password: "TempPass123!",
          options: { data: { full_name: form.full_name } },
        });
        if (authErr) throw authErr;
        if (authData.user) {
          await supabase.from("user_roles").insert({ user_id: authData.user.id, role: form.role as any });
          if (form.phone) {
            await supabase.from("profiles").update({ phone: form.phone }).eq("id", authData.user.id);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["all-roles"] });
      setOpen(false);
      setEditId(null);
      setForm({ full_name: "", email: "", phone: "", role: "technician" });
      toast.success(editId ? t("toast.updated") : t("users.userCreated"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: re } = await supabase.from("user_roles").delete().eq("user_id", id);
      if (re) throw re;
      const { error } = await supabase.from("profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["all-roles"] });
      setDeleteTarget(null);
      toast.success(t("toast.deleted"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const updateRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      const existingRole = roleMap.get(userId);
      if (existingRole) {
        const { error } = await supabase.from("user_roles").update({ role: newRole as any }).eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole as any });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-roles"] });
      toast.success(t("toast.updated"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const startEdit = (p: any) => {
    setEditId(p.id);
    setForm({ full_name: p.full_name || "", email: p.email || "", phone: p.phone || "", role: roleMap.get(p.id) || "technician" });
    setOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t("users.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("users.subtitle")}</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm({ full_name: "", email: "", phone: "", role: "technician" }); } }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />{t("users.addUser")}</Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader><DialogTitle>{editId ? t("users.editUser") : t("users.addUser")}</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-xs">{t("label.name")}</Label>
                <Input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t("label.email")}</Label>
                <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} disabled={!!editId} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t("users.phone")}</Label>
                <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t("label.role")}</Label>
                <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t("role.admin")}</SelectItem>
                    <SelectItem value="partner">{t("role.partner")}</SelectItem>
                    <SelectItem value="technician">{t("role.technician")}</SelectItem>
                    <SelectItem value="client">{t("role.client")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.full_name || !form.email}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                {t("action.save")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>{t("users.deleteConfirm")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("users.deleteWarning")}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>{t("action.cancel")}</Button>
            <Button variant="destructive" size="sm" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              {t("action.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">{t("users.noUsers")}</div>
      ) : (
        <div className="rounded-lg border border-border/50 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead>{t("label.name")}</TableHead>
                <TableHead>{t("label.email")}</TableHead>
                <TableHead>{t("users.phone")}</TableHead>
                <TableHead>{t("label.role")}</TableHead>
                <TableHead>{t("users.joined")}</TableHead>
                <TableHead>{t("label.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p: any) => (
                <TableRow key={p.id} className="text-xs">
                  <TableCell className="font-medium">{p.full_name || "—"}</TableCell>
                  <TableCell>{p.email || "—"}</TableCell>
                  <TableCell>{p.phone || "—"}</TableCell>
                  <TableCell>
                    <Select value={roleMap.get(p.id) || ""} onValueChange={(v) => updateRole.mutate({ userId: p.id, newRole: v })}>
                      <SelectTrigger className="h-7 w-[120px] text-xs">
                        <SelectValue placeholder={t("users.noRole")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">{t("role.admin")}</SelectItem>
                        <SelectItem value="partner">{t("role.partner")}</SelectItem>
                        <SelectItem value="technician">{t("role.technician")}</SelectItem>
                        <SelectItem value="client">{t("role.client")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(p.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(p)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(p.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── SETTINGS ───
export function SettingsPage() {
  const { t } = useLanguage();
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { settings, isLoading: settingsLoading, saveMutation: saveCompany } = useCompanySettings();
  const [profileForm, setProfileForm] = useState({ full_name: "", email: "" });
  const [companyForm, setCompanyForm] = useState({ company_name: "", siret: "", tva_number: "", address: "", logo_url: "" });

  useEffect(() => {
    if (profile) {
      setProfileForm({ full_name: profile.full_name || "", email: profile.email || "" });
    }
  }, [profile]);

  useEffect(() => {
    if (settings) {
      setCompanyForm({
        company_name: settings.company_name || "",
        siret: settings.siret || "",
        tva_number: settings.tva_number || "",
        address: settings.address || "",
        logo_url: settings.logo_url || "",
      });
    }
  }, [settings]);

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("profiles").update({ full_name: profileForm.full_name }).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      toast.success(t("toast.updated"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t("settings.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("settings.subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-sm">{t("settings.company")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label className="text-xs">{t("settings.companyName")}</Label><Input value={companyForm.company_name} onChange={e => setCompanyForm(p => ({ ...p, company_name: e.target.value }))} /></div>
            <div className="space-y-2"><Label className="text-xs">{t("settings.siret")}</Label><Input value={companyForm.siret} onChange={e => setCompanyForm(p => ({ ...p, siret: e.target.value }))} placeholder="XXX XXX XXX XXXXX" /></div>
            <div className="space-y-2"><Label className="text-xs">{t("settings.tva")}</Label><Input value={companyForm.tva_number} onChange={e => setCompanyForm(p => ({ ...p, tva_number: e.target.value }))} placeholder="FRXX XXXXXXXXX" /></div>
            <div className="space-y-2"><Label className="text-xs">{t("settings.address")}</Label><Input value={companyForm.address} onChange={e => setCompanyForm(p => ({ ...p, address: e.target.value }))} /></div>
            <Button size="sm" onClick={() => saveCompany.mutate(companyForm)} disabled={saveCompany.isPending}>
              {saveCompany.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              {t("settings.saveCompany")}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-sm">{t("settings.profile")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">{t("settings.fullName")}</Label>
              <Input value={profileForm.full_name} onChange={e => setProfileForm(p => ({ ...p, full_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("label.email")}</Label>
              <Input value={profileForm.email} disabled className="bg-muted/30" />
            </div>
            <Button size="sm" onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
              {updateProfile.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              {t("settings.saveProfile")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
