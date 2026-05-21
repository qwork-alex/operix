import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { useBillingProfile } from "@/hooks/useBilling";
import { useWorkspace } from "@/hooks/useWorkspace";

interface Props {
  invoice: {
    invoice_number?: string;
    issued_at?: string;
    due_date?: string;
    subtotal?: number;
    vat_amount?: number;
    total?: number;
    currency?: string;
    vat_exemption?: string | null;
    items?: Array<{ description: string; quantity: number; unit_price: number; total: number }>;
  };
  bankInstructions?: { bank_name?: string; iban?: string; bic?: string; reference?: string } | null;
}

export function InvoicePDFView({ invoice, bankInstructions }: Props) {
  const { workspaceName } = useWorkspace();
  const { data: profile } = useBillingProfile();
  const letter = (workspaceName || "Q").trim().charAt(0).toUpperCase();
  const items = invoice.items ?? [{ description: "Subscrição", quantity: 1, unit_price: invoice.subtotal ?? 0, total: invoice.subtotal ?? 0 }];
  const cur = invoice.currency || profile?.preferred_currency || "EUR";

  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden">
        <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Imprimir / PDF</Button>
      </div>
      <Card className="mx-auto max-w-3xl bg-background p-10 print:shadow-none print:border-0">
        <header className="flex items-start justify-between border-b border-border pb-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 grid place-items-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground font-bold text-xl">{letter}</div>
            <div>
              <div className="text-lg font-semibold">{workspaceName}</div>
              <div className="text-xs text-muted-foreground">Fatura emitida pela plataforma</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-mono">{invoice.invoice_number ?? "INV-DRAFT"}</div>
            <div className="text-xs text-muted-foreground">Emitida {invoice.issued_at ? new Date(invoice.issued_at).toLocaleDateString("pt-PT") : "—"}</div>
            <div className="text-xs text-muted-foreground">Vence {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("pt-PT") : "—"}</div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 py-6 text-sm">
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Faturado para</div>
            <div className="font-medium">{profile?.legal_name || workspaceName}</div>
            {profile?.company_name && <div className="text-muted-foreground">{profile.company_name}</div>}
            {profile?.billing_address && <div>{profile.billing_address}</div>}
            <div>{[profile?.postal_code, profile?.city].filter(Boolean).join(" ")}</div>
            <div>{profile?.country}</div>
            {profile?.vat_number && <div className="mt-1 text-xs">IVA: {profile.vat_number}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-muted-foreground mb-1">Email</div>
            <div>{profile?.billing_email}</div>
          </div>
        </section>

        <table className="w-full text-sm">
          <thead className="border-y border-border">
            <tr className="text-left text-xs uppercase text-muted-foreground">
              <th className="py-2">Descrição</th>
              <th className="py-2 text-right">Qtd</th>
              <th className="py-2 text-right">Preço</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-2">{it.description}</td>
                <td className="py-2 text-right">{it.quantity}</td>
                <td className="py-2 text-right">{it.unit_price.toFixed(2)} {cur}</td>
                <td className="py-2 text-right">{it.total.toFixed(2)} {cur}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{(invoice.subtotal ?? 0).toFixed(2)} {cur}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span>{(invoice.vat_amount ?? 0).toFixed(2)} {cur}</span></div>
          {invoice.vat_exemption && <div className="text-xs text-amber-500">Isenção: {invoice.vat_exemption}</div>}
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><span>Total</span><span>{(invoice.total ?? 0).toFixed(2)} {cur}</span></div>
        </section>

        {bankInstructions && (
          <section className="mt-8 rounded-lg border border-border bg-muted/30 p-4 text-xs">
            <div className="font-semibold mb-1">Instruções de pagamento — Transferência bancária</div>
            <div>Banco: {bankInstructions.bank_name}</div>
            <div>IBAN: {bankInstructions.iban}</div>
            {bankInstructions.bic && <div>BIC: {bankInstructions.bic}</div>}
            {bankInstructions.reference && <div>Referência: <strong>{bankInstructions.reference}</strong></div>}
          </section>
        )}

        <footer className="mt-10 border-t border-border pt-4 text-center text-[10px] text-muted-foreground">
          Documento gerado automaticamente pela plataforma {workspaceName}.
        </footer>
      </Card>
    </div>
  );
}
