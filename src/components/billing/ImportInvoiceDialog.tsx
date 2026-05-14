import { useState, useRef, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, Image as ImageIcon, Loader2, Sparkles, X, FileUp } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/authUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Step = "upload" | "review";

type Extracted = {
  invoice_number: string;
  customer_name: string;
  issue_date: string;
  due_date: string;
  total_amount: string;
  tax_amount: string;
  currency: string;
  notes: string;
};

const emptyExtracted = (): Extracted => ({
  invoice_number: "",
  customer_name: "",
  issue_date: new Date().toISOString().slice(0, 10),
  due_date: "",
  total_amount: "",
  tax_amount: "",
  currency: "EUR",
  notes: "",
});

// Heuristic placeholder OCR — real AI extraction will replace this.
// Tries to read filename hints (FAT-2026-001, dates, totals) without external API.
function heuristicExtract(file: File): Extracted {
  const base = emptyExtracted();
  const name = file.name.replace(/\.[^.]+$/, "");
  const numMatch = name.match(/(FAT|FT|INV|FA|FATURA)[-_ ]?\d{2,}[-_ ]?\d{2,}/i);
  if (numMatch) base.invoice_number = numMatch[0].toUpperCase();
  const dateMatch = name.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
  if (dateMatch) base.issue_date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  return base;
}

export default function ImportInvoiceDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<Extracted>(emptyExtracted());
  const [extracting, setExtracting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isImage = useMemo(
    () => !!file && file.type.startsWith("image/"),
    [file]
  );
  const isPdf = useMemo(
    () => !!file && file.type === "application/pdf",
    [file]
  );

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setExtracted(emptyExtracted());
    setStep("upload");
  };

  const handleFile = async (f: File) => {
    if (!f) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!allowed.includes(f.type)) {
      toast.error("Formato não suportado. Use PDF, JPG, PNG.");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      toast.error("Ficheiro demasiado grande (máx 20MB).");
      return;
    }
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    setExtracting(true);
    // Placeholder OCR — architecture ready for AI extraction
    await new Promise((r) => setTimeout(r, 600));
    setExtracted({ ...emptyExtracted(), ...heuristicExtract(f) });
    setExtracting(false);
    setStep("review");
  };

  const importMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Sem ficheiro");
      if (!extracted.invoice_number.trim()) throw new Error("Número da fatura é obrigatório");

      const uid = await getCurrentUserId();
      const safeName = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${uid}/imported/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("billing-receipts").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;

      const total = Number(extracted.total_amount.replace(",", ".")) || 0;
      const insertPayload: any = {
        invoice_number: extracted.invoice_number.trim(),
        type: "incoming",
        customer_name: extracted.customer_name || null,
        issue_date: extracted.issue_date,
        due_date: extracted.due_date || null,
        total_amount: total,
        notes: extracted.notes || null,
        status: "pending",
        source: "imported",
      };

      const { data: inv, error: invErr } = await (supabase as any)
        .from("billing_invoices").insert(insertPayload).select("id").single();
      if (invErr) throw invErr;

      const { error: attErr } = await supabase.from("billing_attachments").insert({
        invoice_id: inv.id,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: uid,
      });
      if (attErr) throw attErr;
    },
    onSuccess: () => {
      toast.success("Fatura importada");
      qc.invalidateQueries({ queryKey: ["billing_invoices"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao importar"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <FileUp className="h-4 w-4 text-primary" />
                Importar fatura externa
              </DialogTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Envie um documento (PDF/imagem) recebido de cliente ou fornecedor.
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] gap-1">
              <Sparkles className="h-3 w-3 text-amber-400" /> OCR-ready
            </Badge>
          </div>
        </DialogHeader>

        {step === "upload" && (
          <div className="p-6">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "border-2 border-dashed border-border/60 rounded-xl",
                "p-10 text-center cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition"
              )}
            >
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium">Arraste o ficheiro ou clique para selecionar</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Formatos aceites: PDF, JPG, PNG · até 20MB
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
            <div className="mt-4 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> PDF</span>
              <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" /> JPG / PNG</span>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 max-h-[70vh]">
            {/* PREVIEW */}
            <div className="bg-muted/30 border-r border-border/50 p-4 overflow-auto max-h-[70vh]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Pré-visualização
                </p>
                <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={reset}>
                  <X className="h-3 w-3 mr-1" /> Trocar ficheiro
                </Button>
              </div>
              {previewUrl && isImage && (
                <img src={previewUrl} alt={file?.name} className="w-full rounded-md border border-border/50 bg-white" />
              )}
              {previewUrl && isPdf && (
                <iframe
                  src={previewUrl}
                  title="preview"
                  className="w-full h-[60vh] rounded-md border border-border/50 bg-white"
                />
              )}
              <p className="mt-2 text-[10px] text-muted-foreground truncate">{file?.name}</p>
            </div>

            {/* EXTRACTED FORM */}
            <div className="p-5 overflow-y-auto max-h-[70vh]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Dados extraídos
                </p>
                {extracting ? (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> A extrair…
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/50 text-amber-500">
                    Confirmação manual
                  </Badge>
                )}
              </div>

              <div className="space-y-3 text-xs">
                <Field label="Número da fatura *">
                  <Input value={extracted.invoice_number}
                    onChange={(e) => setExtracted({ ...extracted, invoice_number: e.target.value })}
                    className="h-9" placeholder="Ex: FAT-2026-0001" />
                </Field>
                <Field label="Cliente / Emitente">
                  <Input value={extracted.customer_name}
                    onChange={(e) => setExtracted({ ...extracted, customer_name: e.target.value })}
                    className="h-9" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Data emissão">
                    <Input type="date" value={extracted.issue_date}
                      onChange={(e) => setExtracted({ ...extracted, issue_date: e.target.value })}
                      className="h-9" />
                  </Field>
                  <Field label="Vencimento">
                    <Input type="date" value={extracted.due_date}
                      onChange={(e) => setExtracted({ ...extracted, due_date: e.target.value })}
                      className="h-9" />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Total">
                    <Input value={extracted.total_amount}
                      onChange={(e) => setExtracted({ ...extracted, total_amount: e.target.value })}
                      className="h-9 tabular-nums" placeholder="0.00" />
                  </Field>
                  <Field label="Imposto">
                    <Input value={extracted.tax_amount}
                      onChange={(e) => setExtracted({ ...extracted, tax_amount: e.target.value })}
                      className="h-9 tabular-nums" placeholder="0.00" />
                  </Field>
                  <Field label="Moeda">
                    <Select value={extracted.currency}
                      onValueChange={(v) => setExtracted({ ...extracted, currency: v })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EUR">EUR €</SelectItem>
                        <SelectItem value="USD">USD $</SelectItem>
                        <SelectItem value="BRL">BRL R$</SelectItem>
                        <SelectItem value="GBP">GBP £</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Notas">
                  <Textarea rows={3} value={extracted.notes}
                    onChange={(e) => setExtracted({ ...extracted, notes: e.target.value })}
                    className="text-xs" />
                </Field>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="px-6 py-3 border-t border-border/50 bg-background">
          <div className="flex-1 text-[10px] text-muted-foreground">
            {step === "review" && "Origem: Importada externamente"}
          </div>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Cancelar
          </Button>
          {step === "review" && (
            <Button onClick={() => importMut.mutate()} disabled={importMut.isPending}>
              {importMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Importar fatura
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
