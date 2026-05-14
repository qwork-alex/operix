import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search, Plus, Filter, MoreHorizontal, Pencil, Trash2, Loader2,
  Building2, Wrench, Cog, Fuel, PaintBucket, HardHat, UserCog,
  Paperclip, Receipt, CreditCard, Upload, FileText, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getCurrentUserId } from "@/lib/authUser";
import type { Database } from "@/integrations/supabase/types";

type Supplier = Database["public"]["Tables"]["billing_suppliers"]["Row"] & {
  category?: string | null; iban?: string | null; bank?: string | null; document_number?: string | null;
};
type Invoice = Database["public"]["Tables"]["billing_invoices"]["Row"];
type Payment = Database["public"]["Tables"]["billing_payments"]["Row"];
type Attachment = Database["public"]["Tables"]["billing_attachments"]["Row"];

const CATEGORIES = [
  { id: "oficina",    label: "Oficina",     icon: Wrench,      tone: "text-orange-400 border-orange-500/40 bg-orange-500/10" },
  { id: "pecas",      label: "Peças",       icon: Cog,         tone: "text-amber-400 border-amber-500/40 bg-amber-500/10" },
  { id: "combustivel",label: "Combustível", icon: Fuel,        tone: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" },
  { id: "funilaria",  label: "Funilaria",   icon: PaintBucket, tone: "text-purple-400 border-purple-500/40 bg-purple-500/10" },
  { id: "prestador",  label: "Prestador",   icon: HardHat,     tone: "text-primary border-primary/40 bg-primary/10" },
  { id: "funcionario",label: "Funcionário", icon: UserCog,     tone: "text-cyan-400 border-cyan-500/40 bg-cyan-500/10" },
] as const;

const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v || 0);
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const empty = {
  name: "", category: "prestador", iban: "", bank: "", phone: "", email: "",
  document_number: "", tax_id: "", address: "", notes: "", is_active: true,
};

export default function SuppliersScreen() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<typeof empty>(empty);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Supplier | null>(null);
  const [detail, setDetail] = useState<Supplier | null>(null);

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["billing-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_suppliers")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });

  const filtered = useMemo(() => {
    return suppliers.filter((s) => {
      if (catFilter !== "all" && (s.category ?? "") !== catFilter) return false;
      if (statusFilter === "active" && !s.is_active) return false;
      if (statusFilter === "inactive" && s.is_active) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return [s.name, s.email, s.phone, s.tax_id, s.document_number, s.iban]
        .some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [suppliers, search, catFilter, statusFilter]);

  const openCreate = () => {
    setForm(empty);
    setEditing(null);
    setCreating(true);
  };
  const openEdit = (s: Supplier) => {
    setForm({
      name: s.name ?? "",
      category: (s.category as string) ?? "prestador",
      iban: s.iban ?? "",
      bank: s.bank ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      document_number: s.document_number ?? "",
      tax_id: s.tax_id ?? "",
      address: s.address ?? "",
      notes: s.notes ?? "",
      is_active: s.is_active,
    });
    setEditing(s);
    setCreating(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const uid = await getCurrentUserId();
      const payload: any = {
        name: form.name.trim(),
        category: form.category || null,
        iban: form.iban || null,
        bank: form.bank || null,
        phone: form.phone || null,
        email: form.email || null,
        document_number: form.document_number || null,
        tax_id: form.tax_id || null,
        address: form.address || null,
        notes: form.notes || null,
        is_active: form.is_active,
      };
      if (editing) {
        const { error } = await supabase.from("billing_suppliers").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast({ title: "Fornecedor atualizado" });
      } else {
        const { error } = await supabase.from("billing_suppliers").insert({ ...payload, created_by: uid });
        if (error) throw error;
        toast({ title: "Fornecedor criado" });
      }
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["billing-suppliers"] });
    } catch (e: any) {
      toast({ title: "Erro ao guardar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      const { error } = await supabase.from("billing_suppliers").delete().eq("id", toDelete.id);
      if (error) throw error;
      toast({ title: "Fornecedor removido" });
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["billing-suppliers"] });
    } catch (e: any) {
      toast({ title: "Erro ao remover", description: e.message, variant: "destructive" });
    }
  };

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: suppliers.length };
    for (const c of CATEGORIES) m[c.id] = 0;
    for (const s of suppliers) {
      const k = (s.category as string) ?? "prestador";
      if (m[k] !== undefined) m[k]++;
    }
    return m;
  }, [suppliers]);

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumb>
        <BreadcrumbList className="text-xs">
          <BreadcrumbItem><BreadcrumbLink href="/billing/faturas">Faturamento</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Fornecedores</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Fornecedores</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Cadastro de oficinas, peças, prestadores e funcionários
          </p>
        </div>
        <Button size="sm" className="h-8" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Novo fornecedor
        </Button>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCatFilter("all")}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-all",
            catFilter === "all"
              ? "bg-primary/15 text-primary border-primary/40"
              : "border-border/50 text-muted-foreground hover:text-foreground"
          )}
        >
          <Building2 className="h-3.5 w-3.5" />
          Todos
          <Badge variant="outline" className="ml-1 text-[10px] h-4 px-1">{counts.all}</Badge>
        </button>
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const active = catFilter === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setCatFilter(c.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-all",
                active ? c.tone : "border-border/50 text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {c.label}
              <Badge variant="outline" className="ml-1 text-[10px] h-4 px-1">{counts[c.id] ?? 0}</Badge>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="pt-4 pb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por nome, email, telefone, IBAN, documento..."
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <Filter className="h-3 w-3 mr-1.5" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border/50 overflow-hidden">
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[10px] uppercase tracking-wider">
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>IBAN / Banco</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[60px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                </TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-12 text-xs text-muted-foreground">
                  Nenhum fornecedor encontrado.
                </TableCell></TableRow>
              ) : filtered.map((s) => {
                const cat = CAT_MAP[(s.category as string) ?? ""];
                const Icon = cat?.icon ?? Building2;
                return (
                  <TableRow
                    key={s.id} className="text-xs cursor-pointer animate-fade-in"
                    onClick={() => setDetail(s)}
                  >
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      {cat ? (
                        <Badge variant="outline" className={cn("text-[10px]", cat.tone)}>
                          <Icon className="h-2.5 w-2.5 mr-1" />{cat.label}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div>{s.email ?? "—"}</div>
                      <div className="text-[10px]">{s.phone ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-[10px]">
                      <div>{s.iban ?? "—"}</div>
                      <div>{s.bank ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-[10px]">
                      {s.document_number ?? s.tax_id ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(
                        "text-[10px]",
                        s.is_active
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : "bg-muted/40 text-muted-foreground border-border"
                      )}>
                        {s.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs">
                          <DropdownMenuItem onClick={() => setDetail(s)}>
                            <Receipt className="h-3.5 w-3.5 mr-2" />Ver histórico
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(s)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" />Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setToDelete(s)}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" />Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-[10px] uppercase tracking-wider">Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={120} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider">Categoria</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider">Documento (NIF/BI)</Label>
              <Input value={form.document_number}
                onChange={(e) => setForm({ ...form, document_number: e.target.value })}
                maxLength={40} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider">Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                maxLength={40} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider">Email</Label>
              <Input type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                maxLength={120} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider">IBAN</Label>
              <Input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })}
                maxLength={40} className="h-8 text-xs font-mono" placeholder="PT50..." />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider">Banco</Label>
              <Input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}
                maxLength={80} className="h-8 text-xs" />
            </div>
            <div className="col-span-2">
              <Label className="text-[10px] uppercase tracking-wider">Morada</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                maxLength={200} className="h-8 text-xs" />
            </div>
            <div className="col-span-2">
              <Label className="text-[10px] uppercase tracking-wider">Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                maxLength={500} rows={3} className="text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {editing ? "Atualizar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Faturas vinculadas permanecem mas perdem a referência.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Details panel */}
      <SupplierDetail
        supplier={detail}
        open={!!detail}
        onClose={() => setDetail(null)}
        onEdit={(s) => { setDetail(null); openEdit(s); }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Supplier detail panel
// ─────────────────────────────────────────────────────────────
function SupplierDetail({
  supplier, open, onClose, onEdit,
}: {
  supplier: Supplier | null; open: boolean; onClose: () => void; onEdit: (s: Supplier) => void;
}) {
  const qc = useQueryClient();
  const id = supplier?.id;

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["supplier-invoices", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_invoices")
        .select("*")
        .eq("supplier_id", id!)
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });

  const invoiceIds = invoices.map((i) => i.id);

  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ["supplier-payments", id, invoiceIds.length],
    enabled: !!id && invoiceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_payments")
        .select("*")
        .in("invoice_id", invoiceIds)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
  });

  const { data: attachments = [], refetch: refetchAtt } = useQuery<Attachment[]>({
    queryKey: ["supplier-attachments", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_attachments")
        .select("*")
        .eq("supplier_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
  });

  const totals = useMemo(() => {
    const total = invoices.reduce((s, i) => s + Number(i.total_amount ?? 0), 0);
    const paid = invoices.reduce((s, i) => s + Number(i.paid_amount ?? 0), 0);
    return { total, paid, remaining: total - paid };
  }, [invoices]);

  const handleUpload = async (file: File) => {
    if (!id) return;
    try {
      const uid = await getCurrentUserId();
      const path = `${uid}/${id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("billing-receipts").upload(path, file);
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("billing_attachments").insert({
        supplier_id: id, file_name: file.name, storage_path: path,
        mime_type: file.type, size_bytes: file.size, uploaded_by: uid,
      });
      if (insErr) throw insErr;
      toast({ title: "Anexo adicionado" });
      refetchAtt();
    } catch (e: any) {
      toast({ title: "Erro ao anexar", description: e.message, variant: "destructive" });
    }
  };

  const removeAttachment = async (a: Attachment) => {
    try {
      await supabase.storage.from("billing-receipts").remove([a.storage_path]);
      await supabase.from("billing_attachments").delete().eq("id", a.id);
      toast({ title: "Anexo removido" });
      refetchAtt();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const openAttachment = async (a: Attachment) => {
    const { data } = await supabase.storage
      .from("billing-receipts").createSignedUrl(a.storage_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (!supplier) return null;
  const cat = CAT_MAP[(supplier.category as string) ?? ""];
  const Icon = cat?.icon ?? Building2;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", cat?.tone.split(" ")[0])} />
            {supplier.name}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-2">
            <Card className="border-border/50">
              <CardContent className="pt-3 pb-2">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Total faturado</p>
                <p className="text-sm font-semibold tabular-nums">{fmt(totals.total)}</p>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="pt-3 pb-2">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Pago</p>
                <p className="text-sm font-semibold text-emerald-400 tabular-nums">{fmt(totals.paid)}</p>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="pt-3 pb-2">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Em dívida</p>
                <p className="text-sm font-semibold text-amber-400 tabular-nums">{fmt(totals.remaining)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Identification */}
          <Card className="border-border/50">
            <CardContent className="pt-3 pb-3 text-xs space-y-1.5">
              <Row k="Documento" v={supplier.document_number ?? supplier.tax_id} />
              <Row k="Email" v={supplier.email} />
              <Row k="Telefone" v={supplier.phone} />
              <Row k="IBAN" v={supplier.iban} mono />
              <Row k="Banco" v={supplier.bank} />
              <Row k="Morada" v={supplier.address} />
              {supplier.notes && (
                <div className="pt-2 mt-2 border-t border-border/50">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Observações</p>
                  <p className="mt-1">{supplier.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="invoices">
            <TabsList className="grid grid-cols-3 h-8">
              <TabsTrigger value="invoices" className="text-xs">
                <Receipt className="h-3 w-3 mr-1" />Faturas
              </TabsTrigger>
              <TabsTrigger value="payments" className="text-xs">
                <CreditCard className="h-3 w-3 mr-1" />Pagamentos
              </TabsTrigger>
              <TabsTrigger value="attachments" className="text-xs">
                <Paperclip className="h-3 w-3 mr-1" />Anexos
              </TabsTrigger>
            </TabsList>

            <TabsContent value="invoices" className="mt-3 space-y-1.5">
              {invoices.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Sem faturas registadas.</p>
              ) : invoices.map((i) => (
                <div key={i.id} className="flex items-center justify-between p-2 rounded-md border border-border/50 text-xs">
                  <div>
                    <p className="font-mono text-primary">{i.invoice_number}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Emit. {fmtDate(i.issue_date)} · Venc. {fmtDate(i.due_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{fmt(Number(i.total_amount))}</p>
                    <Badge variant="outline" className="text-[9px] mt-0.5">{i.status}</Badge>
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="payments" className="mt-3 space-y-1.5">
              {payments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Sem pagamentos.</p>
              ) : payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded-md border border-border/50 text-xs">
                  <div>
                    <p>{fmtDate(p.payment_date)}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{p.reference ?? "—"}</p>
                  </div>
                  <p className="font-semibold tabular-nums text-emerald-400">{fmt(Number(p.amount))}</p>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="attachments" className="mt-3 space-y-2">
              <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-border/50 rounded-md cursor-pointer hover:border-primary/40 transition-colors text-xs text-muted-foreground">
                <Upload className="h-3.5 w-3.5" />
                Carregar documento
                <input
                  type="file" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                />
              </label>
              {attachments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Sem anexos.</p>
              ) : attachments.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-2 rounded-md border border-border/50 text-xs">
                  <button onClick={() => openAttachment(a)} className="flex items-center gap-2 min-w-0 flex-1 text-left hover:text-primary">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{a.file_name}</span>
                  </button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeAttachment(a)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => onEdit(supplier)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />Editar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ k, v, mono }: { k: string; v?: string | null; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground text-[10px] uppercase tracking-wider shrink-0">{k}</span>
      <span className={cn("text-right truncate", mono && "font-mono text-[11px]")}>{v ?? "—"}</span>
    </div>
  );
}
