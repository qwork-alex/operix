import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search, Plus, Filter, Download, MoreHorizontal, Eye, Pencil, Trash2,
  ChevronLeft, ChevronRight, Loader2, Upload, FileText, CreditCard,
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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getCurrentUserId } from "@/lib/authUser";
import type { Database } from "@/integrations/supabase/types";

type PaymentStatus = Database["public"]["Enums"]["billing_payment_status"];
type Payment = Database["public"]["Tables"]["billing_payments"]["Row"];
type Method = Database["public"]["Tables"]["billing_payment_methods"]["Row"];
type Invoice = Pick<
  Database["public"]["Tables"]["billing_invoices"]["Row"],
  "id" | "invoice_number" | "customer_name" | "total_amount" | "paid_amount" | "remaining_amount" | "status"
>;
type Attachment = Database["public"]["Tables"]["billing_attachments"]["Row"];

const STATUS_STYLES: Record<PaymentStatus, string> = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  refunded: "bg-muted/40 text-muted-foreground border-border",
};

const STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Pendente",
  completed: "Concluído",
  failed: "Falhado",
  refunded: "Reembolsado",
};

function StatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant="outline" className={cn("text-[10px]", STATUS_STYLES[status])}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const fmt = (n: number | null | undefined) =>
  `€ ${(Number(n) || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface FormState {
  invoice_id: string;
  payment_method_id: string;
  amount: string;
  payment_date: string;
  reference: string;
  notes: string;
  status: PaymentStatus;
  account: string;
}

const blankForm = (): FormState => ({
  invoice_id: "",
  payment_method_id: "",
  amount: "",
  payment_date: new Date().toISOString().slice(0, 10),
  reference: "",
  notes: "",
  status: "completed",
  account: "",
});

export default function PaymentsScreen() {
  const qc = useQueryClient();

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PaymentStatus>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [form, setForm] = useState<FormState>(blankForm());
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"total" | "partial">("total");

  // Detail panel
  const [detailId, setDetailId] = useState<string | null>(null);

  // Delete
  const [toDelete, setToDelete] = useState<Payment | null>(null);

  // Queries
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["billing_payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_payments")
        .select("*")
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: methods = [] } = useQuery({
    queryKey: ["billing_payment_methods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_payment_methods")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["billing_invoices_for_payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_invoices")
        .select("id, invoice_number, customer_name, total_amount, paid_amount, remaining_amount, status")
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["billing_attachments_for_payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_attachments")
        .select("*")
        .not("payment_id", "is", null);
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
  });

  const methodMap = useMemo(() => Object.fromEntries(methods.map((m) => [m.id, m])), [methods]);
  const invoiceMap = useMemo(() => Object.fromEntries(invoices.map((i) => [i.id, i])), [invoices]);
  const attachmentsByPayment = useMemo(() => {
    const m: Record<string, Attachment[]> = {};
    for (const a of attachments) {
      if (!a.payment_id) continue;
      (m[a.payment_id] ||= []).push(a);
    }
    return m;
  }, [attachments]);

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (methodFilter !== "all" && p.payment_method_id !== methodFilter) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      const inv = p.invoice_id ? invoiceMap[p.invoice_id] : null;
      return [
        p.reference, p.notes, inv?.invoice_number, inv?.customer_name,
      ].filter(Boolean).some((v) => String(v).toLowerCase().includes(s));
    });
  }, [payments, statusFilter, methodFilter, search, invoiceMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = page > totalPages ? 1 : page;
  const pageData = filtered.slice((current - 1) * pageSize, current * pageSize);

  const totalAmount = filtered.reduce((s, p) => s + Number(p.amount || 0), 0);
  const completedCount = filtered.filter((p) => p.status === "completed").length;
  const pendingCount = filtered.filter((p) => p.status === "pending").length;

  // Open form
  const openCreate = () => {
    setEditing(null);
    setForm(blankForm());
    setReceiptFile(null);
    setPaymentMode("total");
    setFormOpen(true);
  };

  const openEdit = (p: Payment) => {
    setEditing(p);
    setForm({
      invoice_id: p.invoice_id,
      payment_method_id: p.payment_method_id ?? "",
      amount: String(p.amount ?? ""),
      payment_date: p.payment_date,
      reference: p.reference ?? "",
      notes: p.notes ?? "",
      status: p.status,
      account: "",
    });
    setReceiptFile(null);
    setPaymentMode("partial");
    setFormOpen(true);
  };

  // When invoice + mode change, auto-fill amount
  useEffect(() => {
    if (!form.invoice_id || editing) return;
    const inv = invoiceMap[form.invoice_id];
    if (!inv) return;
    if (paymentMode === "total") {
      const remaining = Number(inv.remaining_amount ?? Number(inv.total_amount) - Number(inv.paid_amount));
      setForm((f) => ({ ...f, amount: remaining > 0 ? remaining.toFixed(2) : "0.00" }));
    }
  }, [form.invoice_id, paymentMode, invoiceMap, editing]);

  // Save
  const handleSave = async () => {
    if (!form.invoice_id) return toast({ title: "Selecione uma fatura", variant: "destructive" });
    const amt = Number(form.amount);
    if (!amt || amt <= 0) return toast({ title: "Valor inválido", variant: "destructive" });

    setSaving(true);
    try {
      const userId = await getCurrentUserId();
      const payload = {
        invoice_id: form.invoice_id,
        payment_method_id: form.payment_method_id || null,
        amount: amt,
        payment_date: form.payment_date,
        reference: form.reference || null,
        notes: [form.notes, form.account ? `Conta: ${form.account}` : ""].filter(Boolean).join(" · ") || null,
        status: form.status,
      };

      let paymentId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("billing_payments").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("billing_payments")
          .insert({ ...payload, created_by: userId })
          .select("id")
          .single();
        if (error) throw error;
        paymentId = data.id;
      }

      // Upload receipt
      if (receiptFile && paymentId) {
        const ext = receiptFile.name.split(".").pop() || "bin";
        const path = `${userId}/${paymentId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("billing-receipts")
          .upload(path, receiptFile, { upsert: false });
        if (upErr) throw upErr;
        const { error: attErr } = await supabase.from("billing_attachments").insert({
          payment_id: paymentId,
          invoice_id: form.invoice_id,
          file_name: receiptFile.name,
          mime_type: receiptFile.type || null,
          size_bytes: receiptFile.size,
          storage_path: path,
          uploaded_by: userId,
        });
        if (attErr) throw attErr;
      }

      toast({ title: editing ? "Pagamento atualizado" : "Pagamento registado" });
      setFormOpen(false);
      qc.invalidateQueries({ queryKey: ["billing_payments"] });
      qc.invalidateQueries({ queryKey: ["billing_invoices_for_payments"] });
      qc.invalidateQueries({ queryKey: ["billing_invoices"] });
      qc.invalidateQueries({ queryKey: ["billing_attachments_for_payments"] });
    } catch (e: any) {
      toast({ title: "Erro ao guardar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      const { error } = await supabase.from("billing_payments").delete().eq("id", toDelete.id);
      if (error) throw error;
      toast({ title: "Pagamento eliminado" });
      qc.invalidateQueries({ queryKey: ["billing_payments"] });
      qc.invalidateQueries({ queryKey: ["billing_invoices_for_payments"] });
      qc.invalidateQueries({ queryKey: ["billing_invoices"] });
    } catch (e: any) {
      toast({ title: "Erro ao eliminar", description: e.message, variant: "destructive" });
    } finally {
      setToDelete(null);
    }
  };

  const openReceipt = async (att: Attachment) => {
    const { data, error } = await supabase.storage
      .from("billing-receipts")
      .createSignedUrl(att.storage_path, 3600);
    if (error || !data) {
      toast({ title: "Não foi possível abrir comprovante", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  // Export CSV
  const exportCSV = () => {
    const rows = [
      ["Data", "Fatura", "Cliente", "Método", "Valor", "Estado", "Referência", "Notas"],
      ...filtered.map((p) => {
        const inv = p.invoice_id ? invoiceMap[p.invoice_id] : null;
        return [
          p.payment_date,
          inv?.invoice_number ?? "",
          inv?.customer_name ?? "",
          p.payment_method_id ? methodMap[p.payment_method_id]?.name ?? "" : "",
          String(p.amount ?? 0),
          STATUS_LABEL[p.status],
          p.reference ?? "",
          (p.notes ?? "").replace(/\n/g, " "),
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pagamentos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const detailPayment = detailId ? payments.find((p) => p.id === detailId) : null;
  const detailInvoice = detailPayment?.invoice_id ? invoiceMap[detailPayment.invoice_id] : null;
  const detailAttachments = detailPayment ? attachmentsByPayment[detailPayment.id] ?? [] : [];

  const formInvoice = form.invoice_id ? invoiceMap[form.invoice_id] : null;
  const formInvoiceRemaining = formInvoice
    ? Number(formInvoice.remaining_amount ?? Number(formInvoice.total_amount) - Number(formInvoice.paid_amount))
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs */}
      <Breadcrumb>
        <BreadcrumbList className="text-xs">
          <BreadcrumbItem>
            <BreadcrumbLink href="/billing/faturas">Faturamento</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Pagamentos</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pagamentos</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Histórico financeiro, comprovantes e vinculação automática às faturas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar
          </Button>
          <Button size="sm" className="h-8" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Registar pagamento
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="text-lg font-semibold tabular-nums">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Montante</p>
            <p className="text-lg font-semibold text-primary tabular-nums">{fmt(totalAmount)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Concluídos</p>
            <p className="text-lg font-semibold text-emerald-400 tabular-nums">{completedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pendentes</p>
            <p className="text-lg font-semibold text-amber-400 tabular-nums">{pendingCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="pt-4 pb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Pesquisar por fatura, cliente, referência..."
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <Filter className="h-3 w-3 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os estados</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="failed">Falhado</SelectItem>
              <SelectItem value="refunded">Reembolsado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={methodFilter} onValueChange={(v) => { setMethodFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <CreditCard className="h-3 w-3 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os métodos</SelectItem>
              {methods.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
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
                <TableHead className="w-[100px]">Data</TableHead>
                <TableHead>Fatura</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Método</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-center w-[60px]">Comp.</TableHead>
                <TableHead className="w-[60px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    <span className="text-xs text-muted-foreground">A carregar...</span>
                  </TableCell>
                </TableRow>
              ) : pageData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-xs text-muted-foreground">
                    Nenhum pagamento encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                pageData.map((p) => {
                  const inv = p.invoice_id ? invoiceMap[p.invoice_id] : null;
                  const att = attachmentsByPayment[p.id] ?? [];
                  return (
                    <TableRow key={p.id} className="text-xs animate-fade-in cursor-pointer" onClick={() => setDetailId(p.id)}>
                      <TableCell className="text-muted-foreground">{p.payment_date}</TableCell>
                      <TableCell className="font-mono text-[11px] text-primary">
                        {inv?.invoice_number ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium">{inv?.customer_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.payment_method_id ? methodMap[p.payment_method_id]?.name ?? "—" : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmt(p.amount)}</TableCell>
                      <TableCell><StatusBadge status={p.status} /></TableCell>
                      <TableCell className="text-center">
                        {att.length > 0 ? (
                          <FileText className="h-3.5 w-3.5 text-primary inline" />
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs">
                            <DropdownMenuItem onClick={() => setDetailId(p.id)}>
                              <Eye className="h-3.5 w-3.5 mr-2" />Detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(p)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" />Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => setToDelete(p)}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" />Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border/50 px-4 py-2.5 text-xs text-muted-foreground">
          <span>Página {current} de {totalPages} · {filtered.length} registros</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={current <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={current >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Form dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar pagamento" : "Registar pagamento"}</DialogTitle>
            <DialogDescription className="text-xs">
              O saldo da fatura é atualizado automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Fatura *</Label>
              <Select value={form.invoice_id} onValueChange={(v) => setForm((f) => ({ ...f, invoice_id: v }))}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecionar fatura..." />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map((i) => (
                    <SelectItem key={i.id} value={i.id} className="text-xs">
                      {i.invoice_number} — {i.customer_name ?? "s/cliente"} · saldo {fmt(i.remaining_amount ?? Number(i.total_amount) - Number(i.paid_amount))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formInvoice && (
                <p className="text-[10px] text-muted-foreground">
                  Total {fmt(formInvoice.total_amount)} · Pago {fmt(formInvoice.paid_amount)} · <span className="text-primary">Saldo {fmt(formInvoiceRemaining)}</span>
                </p>
              )}
            </div>

            {!editing && (
              <div className="col-span-2 flex gap-2">
                <Button
                  type="button" size="sm" variant={paymentMode === "total" ? "default" : "outline"}
                  className="h-8 text-xs flex-1" onClick={() => setPaymentMode("total")}
                >
                  Pagamento total
                </Button>
                <Button
                  type="button" size="sm" variant={paymentMode === "partial" ? "default" : "outline"}
                  className="h-8 text-xs flex-1" onClick={() => setPaymentMode("partial")}
                >
                  Pagamento parcial
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Valor *</Label>
              <Input type="number" step="0.01" min="0" className="h-9 text-xs"
                value={form.amount}
                disabled={!editing && paymentMode === "total"}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data *</Label>
              <Input type="date" className="h-9 text-xs" value={form.payment_date}
                onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Método</Label>
              <Select value={form.payment_method_id} onValueChange={(v) => setForm((f) => ({ ...f, payment_method_id: v }))}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  {methods.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Estado</Label>
              <Select value={form.status} onValueChange={(v: PaymentStatus) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="failed">Falhado</SelectItem>
                  <SelectItem value="refunded">Reembolsado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Conta bancária</Label>
              <Input className="h-9 text-xs" value={form.account}
                placeholder="IBAN / referência da conta"
                onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Referência</Label>
              <Input className="h-9 text-xs" value={form.reference}
                placeholder="Nº transação..."
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Observação</Label>
              <Textarea rows={2} className="text-xs" value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" /> Comprovante (PDF / imagem)
              </Label>
              <Input type="file" accept="image/*,application/pdf" className="h-9 text-xs"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
              {receiptFile && (
                <p className="text-[10px] text-muted-foreground">
                  {receiptFile.name} · {(receiptFile.size / 1024).toFixed(1)} KB
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {editing ? "Guardar" : "Registar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail sheet */}
      <Sheet open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base">Pagamento</SheetTitle>
            <SheetDescription className="text-xs">
              {detailPayment?.payment_date}
            </SheetDescription>
          </SheetHeader>
          {detailPayment && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Card className="border-border/50"><CardContent className="pt-3 pb-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Valor</p>
                  <p className="text-base font-semibold text-primary">{fmt(detailPayment.amount)}</p>
                </CardContent></Card>
                <Card className="border-border/50"><CardContent className="pt-3 pb-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Estado</p>
                  <div className="mt-1"><StatusBadge status={detailPayment.status} /></div>
                </CardContent></Card>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Fatura</span>
                  <span className="font-mono text-primary">{detailInvoice?.invoice_number ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span>
                  <span>{detailInvoice?.customer_name ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Método</span>
                  <span>{detailPayment.payment_method_id ? methodMap[detailPayment.payment_method_id]?.name ?? "—" : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Referência</span>
                  <span>{detailPayment.reference ?? "—"}</span></div>
                {detailPayment.notes && (
                  <div className="pt-2 border-t border-border/50">
                    <p className="text-muted-foreground mb-1">Observação</p>
                    <p>{detailPayment.notes}</p>
                  </div>
                )}
              </div>

              {detailInvoice && (
                <Card className="border-border/50">
                  <CardContent className="pt-3 pb-3 space-y-1 text-xs">
                    <p className="text-[10px] uppercase text-muted-foreground mb-1">Saldo da fatura</p>
                    <div className="flex justify-between"><span>Total</span><span className="tabular-nums">{fmt(detailInvoice.total_amount)}</span></div>
                    <div className="flex justify-between"><span>Pago</span><span className="tabular-nums text-emerald-400">{fmt(detailInvoice.paid_amount)}</span></div>
                    <div className="flex justify-between font-semibold"><span>Restante</span>
                      <span className="tabular-nums text-primary">
                        {fmt(detailInvoice.remaining_amount ?? Number(detailInvoice.total_amount) - Number(detailInvoice.paid_amount))}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div>
                <p className="text-[10px] uppercase text-muted-foreground mb-2">Comprovantes</p>
                {detailAttachments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum comprovante anexado.</p>
                ) : (
                  <div className="space-y-1.5">
                    {detailAttachments.map((a) => (
                      <button key={a.id}
                        onClick={() => openReceipt(a)}
                        className="w-full text-left text-xs px-2 py-1.5 rounded border border-border/50 hover:bg-accent/50 flex items-center gap-2 transition"
                      >
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        <span className="flex-1 truncate">{a.file_name}</span>
                        <span className="text-muted-foreground text-[10px]">
                          {a.size_bytes ? `${(a.size_bytes / 1024).toFixed(0)} KB` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete dialog */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O saldo da fatura será recalculado automaticamente. Esta ação é irreversível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
