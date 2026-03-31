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
} from "lucide-react";

// ─── PROFIT DISTRIBUTION ───
export function ProfitDistribution() {
  const { t, formatCurrency } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [techShare, setTechShare] = useState(40);
  const [partnerShare, setPartnerShare] = useState(30);
  const companyShare = 100 - techShare - partnerShare;
  const [loaded, setLoaded] = useState(false);

  // Load persisted shares from company_settings
  const { data: companySettings } = useQuery({
    queryKey: ["company-settings-profit", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("tech_share, partner_share, company_share")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (companySettings && !loaded) {
      setTechShare(Number(companySettings.tech_share ?? 40));
      setPartnerShare(Number(companySettings.partner_share ?? 30));
      setLoaded(true);
    }
  }, [companySettings, loaded]);

  const saveProfitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const shares = { tech_share: techShare, partner_share: partnerShare, company_share: Math.max(0, companyShare) };

      const { data: existing } = await supabase
        .from("company_settings")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("company_settings")
          .update({ ...shares, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_settings")
          .insert({ user_id: user.id, ...shares });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings-profit"] });
      toast.success(t("toast.updated"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const { data: summary } = useQuery({
    queryKey: ["profit-summary"],
    queryFn: async () => {
      const { data } = await supabase.from("service_orders").select("total");
      return (data ?? []).reduce((s, o) => s + Number(o.total || 0), 0);
    },
  });

  const totalRevenue = summary ?? 0;

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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-sm">{t("profit.settings")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">{t("profit.techShare")}</Label>
              <Input type="number" min={0} max={100} value={techShare} onChange={e => setTechShare(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("profit.partnerShare")}</Label>
              <Input type="number" min={0} max={100} value={partnerShare} onChange={e => setPartnerShare(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("profit.companyShare")}</Label>
              <Input type="number" value={companyShare} disabled className="bg-muted/30" />
            </div>
            {companyShare < 0 && <p className="text-xs text-destructive">{t("profit.exceeds100")}</p>}
            <Button size="sm" onClick={() => saveProfitMutation.mutate()} disabled={saveProfitMutation.isPending || companyShare < 0}>
              {saveProfitMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              {t("action.save")}
            </Button>
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
                { label: t("label.technician"), pct: techShare, color: "bg-primary" },
                { label: t("profit.partner"), pct: partnerShare, color: "bg-accent" },
                { label: t("profit.company"), pct: Math.max(0, companyShare), color: "bg-emerald-500" },
              ].map(item => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{item.label} ({item.pct}%)</span>
                    <span className="font-medium text-foreground">{formatCurrency(totalRevenue * item.pct / 100)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── ACCOUNTING ───
export function Accounting() {
  const { t, formatCurrency, formatDate } = useLanguage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ type: "expense", category: "", amount: "", date: new Date().toISOString().split("T")[0], notes: "" });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["financial_records"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_records").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("financial_records").update({
          type: form.type,
          source: form.category || "manual",
          amount: parseFloat(form.amount) || 0,
          notes: form.notes || null,
        }).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("financial_records").insert({
          type: form.type,
          source: form.category || "manual",
          amount: parseFloat(form.amount) || 0,
          notes: form.notes || null,
          status: "confirmed",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial_records"] });
      setOpen(false);
      setEditId(null);
      setForm({ type: "expense", category: "", amount: "", date: new Date().toISOString().split("T")[0], notes: "" });
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
    setForm({ type: r.type, category: r.source, amount: String(r.amount), date: r.created_at?.split("T")[0] || "", notes: r.notes || "" });
    setOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
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
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-xs">{t("label.type")}</Label>
                <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">{t("acc.expense")}</SelectItem>
                    <SelectItem value="revenue">{t("acc.revenue")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t("label.category")}</Label>
                <Input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder={t("placeholder.categoryExample")} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t("label.amount")} (€)</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t("label.notes")}</Label>
                <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
              <Button className="w-full" onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
                {addMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                {t("action.save")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">{t("acc.noEntries")}</div>
      ) : (
        <div className="rounded-lg border border-border/50 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead>{t("label.type")}</TableHead>
                <TableHead>{t("label.category")}</TableHead>
                <TableHead className="text-right">{t("label.amount")}</TableHead>
                <TableHead>{t("label.status")}</TableHead>
                <TableHead>{t("label.notes")}</TableHead>
                <TableHead>{t("label.date")}</TableHead>
                <TableHead>{t("label.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r: any) => (
                <TableRow key={r.id} className="text-xs">
                  <TableCell>
                    <Badge variant="outline" className={r.type === "revenue" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-destructive/10 text-destructive border-destructive/30"}>
                      {r.type === "revenue" ? t("acc.revenue") : t("acc.expense")}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.source}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatCurrency(r.amount)}</TableCell>
                  <TableCell><Badge variant="outline">{t(`status.${r.status}`, r.status)}</Badge></TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">{r.notes || "—"}</TableCell>
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
              ))}
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

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["documents", parentId],
    queryFn: async () => {
      let q = supabase.from("documents").select("*").order("type", { ascending: true }).order("name");
      q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const createFolder = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("documents").insert({
        name: folderName, type: "folder", parent_id: parentId, uploaded_by: user?.id,
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

  const uploadFile = async (file: File) => {
    const storagePath = `documents/${Date.now()}_${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("uploads").upload(storagePath, file);
    if (uploadErr) { toast.error(uploadErr.message); return; }

    const { error } = await supabase.from("documents").insert({
      name: file.name, type: "file", parent_id: parentId, uploaded_by: user?.id,
      storage_path: storagePath, mime_type: file.type, size_bytes: file.size,
    });
    if (error) toast.error(error.message);
    else {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success(t("docs.fileUploaded"));
    }
  };

  const navigateTo = (id: string | null, name: string) => {
    if (id === null) { setParentId(null); setPath([{ id: null, name: t("common.root") }]); return; }
    setParentId(id);
    const idx = path.findIndex(p => p.id === id);
    if (idx >= 0) setPath(path.slice(0, idx + 1));
    else setPath([...path, { id, name }]);
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
                <TableHead>{t("label.name")}</TableHead>
                <TableHead>{t("label.type")}</TableHead>
                <TableHead>{t("docs.size")}</TableHead>
                <TableHead>{t("label.date")}</TableHead>
                <TableHead>{t("label.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d: any) => (
                <TableRow key={d.id} className="text-xs">
                  <TableCell className="font-medium flex items-center gap-2 cursor-pointer" onClick={() => d.type === "folder" && navigateTo(d.id, d.name)}>
                    {d.type === "folder" ? <FolderOpen className="h-4 w-4 text-primary" /> : <FolderOpen className="h-4 w-4 text-muted-foreground" />}
                    {d.name}
                  </TableCell>
                  <TableCell><Badge variant="outline">{d.type === "folder" ? t("common.folder") : t("common.file")}</Badge></TableCell>
                  <TableCell>{d.size_bytes ? `${(d.size_bytes / 1024).toFixed(1)} KB` : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(d.created_at)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(d); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
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
