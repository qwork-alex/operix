import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Landmark, Upload, Copy, CheckCircle2, FileUp, Banknote, Shuffle } from "lucide-react";
import { toast } from "sonner";
import {
  useBankAccounts, useSubmitManualTransfer, uploadPaymentProof,
} from "@/hooks/useManualPayments";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { WorkspaceInvoice } from "@/hooks/useWorkspaceInvoices";

const METHOD_LABELS: Record<string, { label: string; icon: typeof Banknote }> = {
  bank_transfer: { label: "Transferência bancária", icon: Banknote },
  sepa: { label: "SEPA", icon: Shuffle },
  wise: { label: "Wise (manual)", icon: Landmark },
};

interface Props {
  invoice: WorkspaceInvoice | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ManualPaymentDialog({ invoice, open, onOpenChange }: Props) {
  const { workspaceId } = useWorkspace();
  const vatMode = invoice?.vat_mode ?? null;
  const { data: accounts = [], isLoading: loadingAccounts } = useBankAccounts(vatMode);
  const submit = useSubmitManualTransfer();

  const [method, setMethod] = useState<string>("bank_transfer");
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [amount, setAmount] = useState<string>(invoice ? String(invoice.remaining_amount || invoice.total_amount) : "");
  const [transferDate, setTransferDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === bankAccountId) ?? accounts.find((a) => a.is_primary) ?? accounts[0],
    [accounts, bankAccountId],
  );

  const reference = invoice?.invoice_number ?? "—";

  const reset = () => {
    setMethod("bank_transfer"); setBankAccountId(""); setNotes(""); setFile(null);
    setAmount(invoice ? String(invoice.remaining_amount || invoice.total_amount) : "");
    setTransferDate(new Date().toISOString().slice(0, 10));
  };

  const copy = (txt?: string | null) => {
    if (!txt) return;
    navigator.clipboard.writeText(txt).then(() => toast.success("Copiado"));
  };

  const handleSubmit = async () => {
    if (!workspaceId) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Indique o montante transferido");
    if (!activeAccount) return toast.error("Selecione uma conta bancária");

    try {
      setUploading(true);
      let proofPath: string | null = null;
      if (file) {
        proofPath = await uploadPaymentProof(workspaceId, invoice?.id ?? null, file);
      }
      await submit.mutateAsync({
        invoice_id: invoice?.id ?? null,
        amount: amt,
        currency: invoice?.metadata?.currency ?? "EUR",
        payment_method: method,
        bank_account_id: activeAccount.id,
        transfer_date: transferDate,
        proof_path: proofPath,
        notes: notes || null,
      });
      toast.success(proofPath ? "Comprovante enviado — em análise" : "Registado · aguardando transferência");
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao submeter");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl surface-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" />
            Pagar por transferência
          </DialogTitle>
          <DialogDescription>
            Faça a transferência para a conta indicada e envie o comprovante. Ativação após validação manual.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bank account card */}
          {loadingAccounts ? (
            <div className="h-28 rounded-lg border border-border/40 bg-muted/20 animate-pulse" />
          ) : activeAccount ? (
            <Card className="p-4 surface-card border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold">{activeAccount.account_name}</h4>
                  <Badge variant="outline" className="text-[10px]">
                    {activeAccount.account_type === "personal" ? "Wise pessoal" : "Conta empresa"}
                  </Badge>
                </div>
                {accounts.length > 1 && (
                  <Select value={activeAccount.id} onValueChange={setBankAccountId}>
                    <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id} className="text-xs">
                          {a.account_name} · {a.bank_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <Row label="Banco" value={activeAccount.bank_name} />
                <Row label="País" value={activeAccount.country} />
                <Row label="IBAN" value={activeAccount.iban} onCopy={copy} />
                <Row label="BIC / SWIFT" value={activeAccount.bic} onCopy={copy} />
                <Row label="Moeda" value={activeAccount.currency} />
                <Row label="Referência" value={reference} onCopy={copy} highlight />
              </div>
            </Card>
          ) : (
            <Card className="p-4 text-center text-xs text-muted-foreground">
              Sem contas configuradas. Contacte o administrador.
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] text-muted-foreground">Método</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(METHOD_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      <span className="flex items-center gap-2"><v.icon className="h-3.5 w-3.5" />{v.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Data da transferência</Label>
              <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Montante ({invoice?.metadata?.currency ?? "EUR"})</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Comprovante (PDF / imagem)</Label>
              <label className="flex items-center gap-2 h-9 px-3 rounded-md border border-dashed border-border/60 bg-background/30 hover:bg-background/50 cursor-pointer text-xs">
                <FileUp className="h-3.5 w-3.5 text-primary" />
                <span className="truncate">{file ? file.name : "Carregar comprovante"}</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  hidden
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>

          <div>
            <Label className="text-[11px] text-muted-foreground">Notas (opcional)</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: referência interna, banco emissor, etc."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={uploading || submit.isPending}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {file ? "Enviar comprovante" : "Registar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, onCopy, highlight }: { label: string; value?: string | null; onCopy?: (v?: string | null) => void; highlight?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 min-w-0">
        <span className={`font-mono truncate ${highlight ? "text-primary font-semibold" : ""}`}>{value}</span>
        {onCopy && (
          <button onClick={() => onCopy(value)} className="text-muted-foreground hover:text-foreground" aria-label="Copiar">
            <Copy className="h-3 w-3" />
          </button>
        )}
      </span>
    </div>
  );
}
