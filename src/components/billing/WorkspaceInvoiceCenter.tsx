import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download, ExternalLink, CheckCircle2, Clock, AlertTriangle, XCircle } from "lucide-react";
import { useWorkspaceInvoices, bucketOf, type InvoiceBucket, type WorkspaceInvoice } from "@/hooks/useWorkspaceInvoices";
import { Skeleton } from "@/components/ui/skeleton";

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

export function WorkspaceInvoiceCenter() {
  const { data: invoices = [], isLoading } = useWorkspaceInvoices();
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
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList className="h-8 flex-wrap">
            <TabsTrigger value="all" className="text-xs">Todas</TabsTrigger>
            <TabsTrigger value="paid" className="text-xs">Pagas · {counts.paid}</TabsTrigger>
            <TabsTrigger value="pending" className="text-xs">Pendentes · {counts.pending}</TabsTrigger>
            <TabsTrigger value="overdue" className="text-xs">Vencidas · {counts.overdue}</TabsTrigger>
            <TabsTrigger value="failed" className="text-xs">Falhadas · {counts.failed}</TabsTrigger>
          </TabsList>
        </Tabs>
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
          {filtered.map((inv) => <InvoiceRow key={inv.id} inv={inv} />)}
        </div>
      )}
    </Card>
  );
}

function InvoiceRow({ inv }: { inv: WorkspaceInvoice }) {
  const bucket = bucketOf(inv);
  const meta = BUCKET_META[bucket];
  const Icon = meta.icon;
  const hostedUrl: string | undefined = (inv.metadata as any)?.hosted_invoice_url;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-card/40 hover:bg-card/70 transition-colors">
      <div className={`h-9 w-9 rounded-md grid place-items-center bg-background/60 border border-border/40 ${meta.tone}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">{inv.invoice_number}</span>
          <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>{meta.label}</Badge>
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
      {hostedUrl && (
        <Button asChild size="sm" variant="ghost">
          <a href={hostedUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir fatura">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      )}
      {(inv.metadata as any)?.invoice_pdf && (
        <Button asChild size="sm" variant="ghost">
          <a href={(inv.metadata as any).invoice_pdf} target="_blank" rel="noopener noreferrer" aria-label="Descarregar PDF">
            <Download className="h-3.5 w-3.5" />
          </a>
        </Button>
      )}
    </div>
  );
}
