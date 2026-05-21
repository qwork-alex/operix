import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileText, Download, ExternalLink, CheckCircle2, Clock, AlertTriangle, XCircle,
  RefreshCw, MoreVertical, FileJson, Sheet,
} from "lucide-react";
import { useWorkspaceInvoices, bucketOf, type InvoiceBucket, type WorkspaceInvoice } from "@/hooks/useWorkspaceInvoices";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { requestInvoicePdf, getInvoicePdfSignedUrl } from "@/lib/invoices/invoiceEngine";

const BUCKET_META: Record<InvoiceBucket | "all", { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  all:     { label: "Todas",     tone: "text-muted-foreground",                                icon: FileText },
  paid:    { label: "Pagas",     tone: "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.45)]", icon: CheckCircle2 },
  pending: { label: "Pendentes", tone: "text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.45)]",   icon: Clock },
  overdue: { label: "Vencidas",  tone: "text-orange-400 drop-shadow-[0_0_8px_rgba(249,115,22,0.45)]",  icon: AlertTriangle },
  failed:  { label: "Falhadas",  tone: "text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.45)]",      icon: XCircle },
};

function fmtMoney(v: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
}

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function WorkspaceInvoiceCenter() {
  const { data: invoices = [], isLoading, refetch } = useWorkspaceInvoices();
  const [filter, setFilter] = useState<InvoiceBucket | "all">("all");

  const counts = useMemo(() => {
    const c = { paid: 0, pending: 0, overdue: 0, failed: 0 } as Record<InvoiceBucket, number>;
    invoices.forEach((i) => { c[bucketOf(i)] += 1; });
    return c;
  }, [invoices]);

  const filtered = useMemo(() => {
    if (filter === "all") return invoices;
    return invoices.filter((i) => bucketOf(i) === filter);
  }, [invoices, filter]);

  const exportCsv = () => {
    const head = ["number", "issue_date", "due_date", "status", "subtotal", "vat", "total", "vat_mode"].join(",");
    const body = invoices.map((i) => [
      i.invoice_number, i.issue_date, i.due_date ?? "", i.status,
      i.subtotal ?? "", i.vat_amount ?? "", i.total_amount, i.vat_mode ?? "",
    ].map(String).map((s) => `"${s.replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadFile(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, `${head}\n${body}`, "text/csv;charset=utf-8");
  };

  const exportJson = () => {
    downloadFile(
      `invoices-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(invoices, null, 2),
      "application/json",
    );
  };

  return (
    <Card className="p-5 surface-card">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Centro de faturas
          </h3>
          <p className="text-xs text-muted-foreground">Histórico financeiro da workspace</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList className="h-8 flex-wrap">
              <TabsTrigger value="all" className="text-xs">Todas</TabsTrigger>
              <TabsTrigger value="paid" className="text-xs">Pagas · {counts.paid}</TabsTrigger>
              <TabsTrigger value="pending" className="text-xs">Pendentes · {counts.pending}</TabsTrigger>
              <TabsTrigger value="overdue" className="text-xs">Vencidas · {counts.overdue}</TabsTrigger>
              <TabsTrigger value="failed" className="text-xs">Falhadas · {counts.failed}</TabsTrigger>
            </TabsList>
          </Tabs>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1">
                <Download className="h-3.5 w-3.5" /> Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCsv}><Sheet className="h-3.5 w-3.5 mr-2" />CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={exportJson}><FileJson className="h-3.5 w-3.5 mr-2" />JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Sem faturas {filter !== "all" ? `(${BUCKET_META[filter].label.toLowerCase()})` : "ainda"}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((inv) => <InvoiceRow key={inv.id} inv={inv} onChanged={refetch} />)}
        </div>
      )}
    </Card>
  );
}

function InvoiceRow({ inv, onChanged }: { inv: WorkspaceInvoice; onChanged: () => void }) {
  const bucket = bucketOf(inv);
  const meta = BUCKET_META[bucket];
  const Icon = meta.icon;
  const hostedUrl: string | undefined = (inv.metadata as any)?.hosted_invoice_url;
  const [busy, setBusy] = useState<null | "pdf" | "open">(null);

  const handleOpenPdf = async () => {
    setBusy("open");
    try {
      if (inv.pdf_path) {
        const { url } = await getInvoicePdfSignedUrl(inv.pdf_path);
        if (url) { window.open(url, "_blank", "noopener,noreferrer"); return; }
      }
      // No PDF yet → generate then open
      const { data, error } = await requestInvoicePdf(inv.id);
      if (error) throw error;
      const signed = (data as any)?.signedUrl;
      if (signed) window.open(signed, "_blank", "noopener,noreferrer");
      onChanged();
    } catch (e: any) {
      toast.error(`Falha ao abrir PDF: ${e?.message ?? e}`);
    } finally { setBusy(null); }
  };

  const handleRegenerate = async () => {
    setBusy("pdf");
    try {
      const { error } = await requestInvoicePdf(inv.id);
      if (error) throw error;
      toast.success("PDF regenerado");
      onChanged();
    } catch (e: any) {
      toast.error(`Falha ao gerar PDF: ${e?.message ?? e}`);
    } finally { setBusy(null); }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-card/40 hover:bg-card/70 transition-colors">
      <div className={`h-9 w-9 rounded-md grid place-items-center bg-background/60 border border-border/40 ${meta.tone}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">{inv.invoice_number}</span>
          <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>{meta.label}</Badge>
          {inv.vat_mode && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {inv.vat_mode === "with_vat" ? "TVA" : inv.vat_mode === "no_vat" ? "Sem TVA" : "Reverse charge"}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Emitida {new Date(inv.issue_date).toLocaleDateString("pt-PT")}
          {inv.due_date ? ` · Vence ${new Date(inv.due_date).toLocaleDateString("pt-PT")}` : ""}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold">{fmtMoney(Number(inv.total_amount))}</p>
        {Number(inv.remaining_amount) > 0 && (
          <p className="text-[10px] text-muted-foreground">Em falta: {fmtMoney(Number(inv.remaining_amount))}</p>
        )}
      </div>
      <Button size="sm" variant="ghost" onClick={handleOpenPdf} disabled={busy !== null} aria-label="Ver PDF">
        {busy === "open" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" aria-label="Mais ações"><MoreVertical className="h-3.5 w-3.5" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleRegenerate} disabled={busy !== null}>
            <RefreshCw className={`h-3.5 w-3.5 mr-2 ${busy === "pdf" ? "animate-spin" : ""}`} />
            Regenerar PDF
          </DropdownMenuItem>
          {hostedUrl && (
            <DropdownMenuItem asChild>
              <a href={hostedUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-2" /> Abrir no Stripe
              </a>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
