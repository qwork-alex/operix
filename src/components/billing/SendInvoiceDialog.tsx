import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, Paperclip, CheckCircle2, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import jsPDF from "jspdf";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

type Lang = "pt" | "fr" | "en" | "es" | "it";

const TEMPLATES: Record<Lang, { subject: (n: string, c: string) => string; body: (n: string, c: string) => string }> = {
  pt: {
    subject: (n, c) => `Fatura ${n} - ${c}`,
    body: (n, c) => `Caro cliente,\n\nSegue em anexo a fatura ${n} para a sua referência.\n\nObrigado pela confiança.\n\nAtenciosamente,\n${c}`,
  },
  fr: {
    subject: (n, c) => `Facture ${n} - ${c}`,
    body: (n, c) => `Bonjour,\n\nVeuillez trouver ci-joint la facture ${n}.\n\nMerci pour votre confiance.\n\nCordialement,\n${c}`,
  },
  en: {
    subject: (n, c) => `Invoice ${n} - ${c}`,
    body: (n, c) => `Hello,\n\nPlease find attached invoice ${n} for your reference.\n\nThank you for your business.\n\nBest regards,\n${c}`,
  },
  es: {
    subject: (n, c) => `Factura ${n} - ${c}`,
    body: (n, c) => `Estimado cliente,\n\nAdjunto encontrará la factura ${n}.\n\nGracias por su confianza.\n\nAtentamente,\n${c}`,
  },
  it: {
    subject: (n, c) => `Fattura ${n} - ${c}`,
    body: (n, c) => `Gentile cliente,\n\nIn allegato la fattura ${n}.\n\nGrazie per la fiducia.\n\nCordiali saluti,\n${c}`,
  },
};

function generateInvoicePdfBase64(invoice: any, companyName: string): string {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFontSize(18);
  doc.text(companyName, 14, 18);
  doc.setFontSize(11);
  doc.text(`Fatura: ${invoice.invoice_number}`, 14, 30);
  doc.text(`Cliente: ${invoice.customer_name ?? "—"}`, 14, 38);
  doc.text(`Data emissão: ${invoice.issue_date ?? "—"}`, 14, 46);
  doc.text(`Vencimento: ${invoice.due_date ?? "—"}`, 14, 54);
  doc.setFontSize(14);
  doc.text(`Total: ${Number(invoice.total_amount).toFixed(2)} €`, 14, 70);
  if (invoice.notes) {
    doc.setFontSize(10);
    doc.text(String(invoice.notes).slice(0, 600), 14, 90, { maxWidth: 180 });
  }
  const dataUri = doc.output("datauristring");
  return dataUri.split(",")[1] ?? "";
}

export function SendInvoiceDialog({
  open, onOpenChange, invoice, companyName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice: any | null;
  companyName: string;
}) {
  const qc = useQueryClient();
  const lang = (invoice?.customer_snapshot?.language ?? "pt") as Lang;
  const tpl = TEMPLATES[lang] ?? TEMPLATES.pt;

  const [recipient, setRecipient] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    const email = invoice.customer_snapshot?.email ?? "";
    setRecipient(email);
    setCc("");
    setSubject(tpl.subject(invoice.invoice_number, companyName));
    setMessage(tpl.body(invoice.invoice_number, companyName));
  }, [invoice, companyName, lang]);

  const logsQ = useQuery({
    queryKey: ["invoice_send_log", invoice?.id],
    enabled: !!invoice?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_send_log" as any)
        .select("*")
        .eq("invoice_id", invoice.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const send = async () => {
    if (!invoice || !recipient || !subject) {
      toast.error("Preencha destinatário e assunto");
      return;
    }
    setSending(true);
    try {
      const pdfBase64 = generateInvoicePdfBase64(invoice, companyName);
      const idempotencyKey = `inv-${invoice.id}-${Date.now()}`;
      const { data, error } = await supabase.functions.invoke("send-invoice-email", {
        body: {
          invoiceId: invoice.id,
          recipient, cc: cc || undefined,
          subject, message,
          pdfBase64,
          pdfFileName: `${invoice.invoice_number}.pdf`,
          idempotencyKey,
        },
      });
      if (error) throw error;
      if ((data as any)?.ok) {
        toast.success(`Fatura enviada (${(data as any).provider})`);
        qc.invalidateQueries({ queryKey: ["invoice_send_log", invoice.id] });
        onOpenChange(false);
      } else {
        toast.error(`Falha no envio: ${(data as any)?.error ?? "erro desconhecido"}`);
      }
    } catch (e: any) {
      toast.error(`Erro: ${e.message ?? e}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" /> Enviar fatura {invoice?.invoice_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Destinatário *</Label>
              <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} type="email" />
            </div>
            <div>
              <Label className="text-xs">CC</Label>
              <Input value={cc} onChange={(e) => setCc(e.target.value)} type="email" placeholder="opcional" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Assunto *</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Mensagem</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={7} />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Paperclip className="h-3.5 w-3.5" />
            PDF da fatura será gerado e anexado automaticamente
          </div>

          {/* History */}
          {(logsQ.data ?? []).length > 0 && (
            <div className="border-t border-border/50 pt-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Histórico de envios</p>
              <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                {(logsQ.data ?? []).map((l: any) => (
                  <li key={l.id} className="flex items-center justify-between text-xs rounded border border-border/40 px-2 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {l.status === "sent" || l.status === "opened" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : l.status === "failed" ? (
                        <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      )}
                      <span className="truncate">{l.recipient}</span>
                      <Badge variant="outline" className="text-[9px] h-4">{l.provider}</Badge>
                    </div>
                    <span className="text-muted-foreground text-[10px] shrink-0">
                      {format(parseISO(l.created_at), "dd/MM HH:mm")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
          <Button onClick={send} disabled={sending || !recipient || !subject}>
            {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
