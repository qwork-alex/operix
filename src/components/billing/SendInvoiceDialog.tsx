import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, Paperclip, CheckCircle2, AlertCircle, Bell } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
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
type Mode = "initial" | "reminder";

const INITIAL_TPL: Record<Lang, { subject: (n: string, c: string) => string; body: (n: string, c: string) => string }> = {
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

const REMINDER_TPL: Record<Lang, { subject: (n: string, c: string, days: number) => string; body: (n: string, c: string, days: number, amount: string) => string }> = {
  pt: {
    subject: (n, c, d) => `Lembrete de pagamento — Fatura ${n} (${d} dias em atraso)`,
    body: (n, c, d, a) =>
`Caro cliente,

Conforme registo, a fatura ${n} no valor de ${a} encontra-se em atraso há ${d} dia(s).

Agradecemos a regularização do pagamento o mais breve possível. Se já efectuou o pagamento, por favor desconsidere esta mensagem.

Permanecemos à disposição para qualquer esclarecimento.

Com os melhores cumprimentos,
${c}`,
  },
  fr: {
    subject: (n, c, d) => `Rappel de paiement — Facture ${n} (${d} jours de retard)`,
    body: (n, c, d, a) =>
`Bonjour,

Sauf erreur de notre part, la facture ${n} d'un montant de ${a} reste impayée depuis ${d} jour(s).

Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais. Si le paiement a déjà été effectué, veuillez ne pas tenir compte de ce message.

Nous restons à votre disposition pour toute précision.

Cordialement,
${c}`,
  },
  en: {
    subject: (n, c, d) => `Payment reminder — Invoice ${n} (${d} days overdue)`,
    body: (n, c, d, a) =>
`Dear customer,

According to our records, invoice ${n} for ${a} is currently ${d} day(s) overdue.

We kindly ask you to settle this payment at your earliest convenience. If payment has already been made, please disregard this message.

We remain at your disposal for any clarification.

Best regards,
${c}`,
  },
  es: {
    subject: (n, c, d) => `Recordatorio de pago — Factura ${n} (${d} días de retraso)`,
    body: (n, c, d, a) =>
`Estimado cliente,

Según nuestros registros, la factura ${n} por importe de ${a} se encuentra vencida desde hace ${d} día(s).

Le rogamos proceder al pago a la mayor brevedad posible. Si ya ha efectuado el pago, por favor ignore este mensaje.

Quedamos a su disposición para cualquier aclaración.

Atentamente,
${c}`,
  },
  it: {
    subject: (n, c, d) => `Sollecito di pagamento — Fattura ${n} (${d} giorni di ritardo)`,
    body: (n, c, d, a) =>
`Gentile cliente,

In base ai nostri registri, la fattura ${n} dell'importo di ${a} risulta scaduta da ${d} giorno/i.

La preghiamo di voler provvedere al pagamento al più presto. Se il pagamento è già stato effettuato, ignori questo messaggio.

Restiamo a disposizione per qualsiasi chiarimento.

Cordiali saluti,
${c}`,
  },
};

function generateInvoicePdfBase64(invoice: any, companyName: string, isReminder: boolean): string {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFontSize(18);
  doc.text(companyName, 14, 18);
  if (isReminder) {
    doc.setFontSize(10);
    doc.setTextColor(180, 60, 60);
    doc.text("LEMBRETE DE PAGAMENTO", 14, 24);
    doc.setTextColor(0, 0, 0);
  }
  doc.setFontSize(11);
  doc.text(`Fatura: ${invoice.invoice_number}`, 14, 34);
  doc.text(`Cliente: ${invoice.customer_name ?? "—"}`, 14, 42);
  doc.text(`Data emissão: ${invoice.issue_date ?? "—"}`, 14, 50);
  doc.text(`Vencimento: ${invoice.due_date ?? "—"}`, 14, 58);
  doc.setFontSize(14);
  const remaining = Number(invoice.remaining_amount ?? invoice.total_amount ?? 0);
  doc.text(`Total: ${Number(invoice.total_amount).toFixed(2)} €`, 14, 74);
  if (isReminder) {
    doc.text(`Em aberto: ${remaining.toFixed(2)} €`, 14, 82);
  }
  if (invoice.notes) {
    doc.setFontSize(10);
    doc.text(String(invoice.notes).slice(0, 600), 14, 100, { maxWidth: 180 });
  }
  const dataUri = doc.output("datauristring");
  return dataUri.split(",")[1] ?? "";
}

export function SendInvoiceDialog({
  open, onOpenChange, invoice, companyName, mode = "initial",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice: any | null;
  companyName: string;
  mode?: Mode;
}) {
  const qc = useQueryClient();
  const lang = (invoice?.customer_snapshot?.language ?? "pt") as Lang;

  const [recipient, setRecipient] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const overdueDays = useMemo(() => {
    if (!invoice?.due_date) return 0;
    try {
      const d = differenceInDays(new Date(), parseISO(invoice.due_date));
      return d > 0 ? d : 0;
    } catch { return 0; }
  }, [invoice?.due_date]);

  useEffect(() => {
    if (!invoice) return;
    const email = invoice.customer_snapshot?.email ?? invoice.customer_email ?? "";
    setRecipient(email);
    setCc("");
    if (mode === "reminder") {
      const tpl = REMINDER_TPL[lang] ?? REMINDER_TPL.pt;
      const remaining = Number(invoice.remaining_amount ?? invoice.total_amount ?? 0).toFixed(2) + " €";
      setSubject(tpl.subject(invoice.invoice_number, companyName, overdueDays));
      setMessage(tpl.body(invoice.invoice_number, companyName, overdueDays, remaining));
    } else {
      const tpl = INITIAL_TPL[lang] ?? INITIAL_TPL.pt;
      setSubject(tpl.subject(invoice.invoice_number, companyName));
      setMessage(tpl.body(invoice.invoice_number, companyName));
    }
  }, [invoice, companyName, lang, mode, overdueDays]);

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

  const reminderStats = useMemo(() => {
    const list = (logsQ.data ?? []) as any[];
    const reminders = list.filter((l) => l.kind === "reminder");
    const last = reminders[0];
    const lastAt = last ? new Date(last.created_at) : null;
    const hoursSince = lastAt ? (Date.now() - lastAt.getTime()) / 36e5 : Infinity;
    return { count: reminders.length, lastAt, throttled: hoursSince < 24 };
  }, [logsQ.data]);

  const send = async () => {
    if (!invoice || !recipient || !subject) {
      toast.error("Preencha destinatário e assunto");
      return;
    }
    if (mode === "reminder" && reminderStats.throttled) {
      toast.error("Uma cobrança já foi enviada nas últimas 24h.");
      return;
    }
    setSending(true);
    try {
      const pdfBase64 = generateInvoicePdfBase64(invoice, companyName, mode === "reminder");
      const idempotencyKey = `inv-${invoice.id}-${mode}-${Date.now()}`;
      const { data, error } = await supabase.functions.invoke("send-invoice-email", {
        body: {
          invoiceId: invoice.id,
          recipient, cc: cc || undefined,
          subject, message,
          pdfBase64,
          pdfFileName: `${invoice.invoice_number}${mode === "reminder" ? "-lembrete" : ""}.pdf`,
          idempotencyKey,
          kind: mode,
        },
      });
      if (error) throw error;
      if ((data as any)?.ok) {
        toast.success(mode === "reminder"
          ? `Cobrança enviada (${(data as any).provider})`
          : `Fatura enviada (${(data as any).provider})`);
        qc.invalidateQueries({ queryKey: ["invoice_send_log", invoice.id] });
        onOpenChange(false);
      } else {
        toast.error(`Falha: ${(data as any)?.error ?? "erro desconhecido"}`);
      }
    } catch (e: any) {
      toast.error(`Erro: ${e.message ?? e}`);
    } finally {
      setSending(false);
    }
  };

  const isReminder = mode === "reminder";
  const Icon = isReminder ? Bell : Send;

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {isReminder ? "Enviar cobrança" : "Enviar fatura"} {invoice?.invoice_number}
            {isReminder && overdueDays > 0 && (
              <Badge variant="outline" className="ml-2 text-[10px] border-destructive/40 text-destructive">
                {overdueDays} dias em atraso
              </Badge>
            )}
            {isReminder && reminderStats.count > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {reminderStats.count}ª cobrança
              </Badge>
            )}
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
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={9} />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Paperclip className="h-3.5 w-3.5" />
            PDF da fatura será gerado e anexado automaticamente
          </div>

          {isReminder && reminderStats.throttled && reminderStats.lastAt && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Última cobrança enviada há menos de 24h ({format(reminderStats.lastAt, "dd/MM HH:mm")}). Aguarde para evitar duplicação.
            </div>
          )}

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
                      <Badge variant="outline" className="text-[9px] h-4">
                        {l.kind === "reminder" ? "cobrança" : "fatura"}
                      </Badge>
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
          <Button
            onClick={send}
            disabled={sending || !recipient || !subject || (isReminder && reminderStats.throttled)}
            variant={isReminder ? "destructive" : "default"}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Icon className="h-3.5 w-3.5 mr-1.5" />}
            {isReminder ? "Enviar cobrança" : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
