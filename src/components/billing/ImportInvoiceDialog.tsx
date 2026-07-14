import { useState, useRef, useMemo, useEffect, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, FileText, Image as ImageIcon, Loader2, Sparkles, X, FileUp,
  Camera, ScanLine, CheckCircle2, AlertCircle, Eye,
} from "lucide-react";
import { toast } from "sonner";

import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/storage";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  renderPdfFirstPageToCanvas,
  pdfFirstPageToImageBase64,
  pdfPagesToImageBase64,
  fileToBase64,
} from "@/lib/pdfUtils";
import { withPromiseTimeout } from "@/lib/asyncGuard";
import { PaymentListsSelector } from "@/components/billing/PaymentListsSelector";
import type { BillingPaymentList } from "@/hooks/usePaymentListsConsolidated";
import { useContextualWorkspace } from "@/hooks/useContextualWorkspace";
import { ContextualWorkspacePicker } from "@/components/workspace/ContextualWorkspacePicker";

type Step = "upload" | "review";
type Stage = "idle" | "uploading" | "rendering" | "ocr" | "extracting" | "validating" | "done" | "error";

type Extracted = {
  invoice_number: string;
  supplier_name: string;
  supplier_tax_id: string;
  customer_name: string;
  customer_tax_id: string;
  issue_date: string;
  due_date: string;
  total_amount: string;
  tax_amount: string;
  net_amount: string;
  currency: string;
  notes: string;
};

type ExtractedLineItem = {
  description: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
  tax_amount: string;
  total: string;
};

type FieldConfidence = Partial<Record<
  | "invoice_number"
  | "supplier_name"
  | "supplier_tax_id"
  | "customer_name"
  | "customer_tax_id"
  | "issue_date"
  | "due_date"
  | "total_amount"
  | "tax_amount"
  | "net_amount",
  "high" | "medium" | "low"
>>;

const emptyExtracted = (): Extracted => ({
  invoice_number: "",
  supplier_name: "",
  supplier_tax_id: "",
  customer_name: "",
  customer_tax_id: "",
  issue_date: new Date().toISOString().slice(0, 10),
  due_date: "",
  total_amount: "",
  tax_amount: "",
  net_amount: "",
  currency: "EUR",
  notes: "",
});

const STAGE_LABEL: Record<Stage, string> = {
  idle: "Aguardando",
  uploading: "Enviando",
  rendering: "Renderizando",
  ocr: "OCR",
  extracting: "Extração",
  validating: "Validação",
  done: "Concluído",
  error: "Erro",
};

export default function ImportInvoiceDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const ctxWs = useContextualWorkspace("billing");
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<Extracted>(emptyExtracted());
  const [lineItems, setLineItems] = useState<ExtractedLineItem[]>([]);
  const [fieldConf, setFieldConf] = useState<FieldConfidence>({});
  const [stage, setStage] = useState<Stage>("idle");
  const [stageMsg, setStageMsg] = useState<string>("");
  const [linkedListIds, setLinkedListIds] = useState<string[]>([]);
  const [linkedLists, setLinkedLists] = useState<BillingPaymentList[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);

  const isImage = useMemo(() => !!file && file.type.startsWith("image/"), [file]);
  const isPdf = useMemo(() => !!file && file.type === "application/pdf", [file]);

  const reset = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setFile(null);
    setImageUrl(null);
    setStoragePath(null);
    setExtracted(emptyExtracted());
    setLineItems([]);
    setFieldConf({});
    setStage("idle");
    setStageMsg("");
    setLinkedListIds([]);
    setLinkedLists([]);
    setStep("upload");
  };

  // Render PDF when entering review with a PDF file
  useEffect(() => {
    if (step !== "review" || !file || !isPdf || !pdfCanvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        await renderPdfFirstPageToCanvas(file, pdfCanvasRef.current!, { maxWidth: 900 });
      } catch (e) {
        if (!cancelled) void e;
      }
    })();
    return () => { cancelled = true; };
  }, [step, file, isPdf]);

  const runPipeline = async (f: File) => {
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
    setStep("review");

    try {
      setStage("uploading");
      setStageMsg("Guardando documento…");
      try {
        const safeName = f.name.replace(/[^\w.\-]+/g, "_").slice(0, 160);
        const path = `billing/invoices/${Date.now()}-${safeName}`;
        await withPromiseTimeout<any>(
          uploadFile("uploads", path, f, f.type || undefined),
          10000,
          "billing_invoice_upload",
        );
        setStoragePath(path);
      } catch (e) {
        void e;
      }

      // Stage 1: render preview
      setStage("rendering"); setStageMsg("Preparando pré-visualização…");
      let ocrBase64 = "";
      let ocrMimeType = "";
      let ocrPages: Array<{ base64: string; mimeType: string; pageNumber: number }> = [];
      if (f.type === "application/pdf") {
        const r = await pdfFirstPageToImageBase64(f, { maxWidth: 1600 });
        setImageUrl(`data:${r.mimeType};base64,${r.base64}`);
        ocrBase64 = r.base64;
        ocrMimeType = r.mimeType;
        ocrPages = await pdfPagesToImageBase64(f, { maxWidth: 1600, maxPages: 6 });
      } else {
        if (imageUrl) URL.revokeObjectURL(imageUrl);
        const url = URL.createObjectURL(f);
        setImageUrl(url);
        ocrBase64 = await fileToBase64(f);
        ocrMimeType = f.type;
      }

      const fileStem = f.name.replace(/\.[^.]+$/, "").slice(0, 120);
      setStage("ocr");
      setStageMsg("Executando OCR e extração…");
      const data = await withPromiseTimeout<any>(
        apiRequest<any>("/extract/invoice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileBase64: ocrBase64, mimeType: ocrMimeType, fileName: f.name, pages: ocrPages }),
        }),
        15000,
        "billing_invoice_extract",
      );

      const total = typeof data?.total_amount === "number" ? data.total_amount : null;
      const tax = typeof data?.tax_amount === "number" ? data.tax_amount : null;
      const net = typeof data?.net_amount === "number" ? data.net_amount : null;

      const next: Extracted = {
        ...emptyExtracted(),
        invoice_number: (data?.invoice_number || fileStem || "").toString(),
        supplier_name: (data?.supplier_name || "").toString(),
        supplier_tax_id: (data?.supplier_tax_id || "").toString(),
        customer_name: (data?.customer_name || "").toString(),
        customer_tax_id: (data?.customer_tax_id || "").toString(),
        issue_date: (data?.issue_date || emptyExtracted().issue_date).toString(),
        due_date: (data?.due_date || "").toString(),
        total_amount: total != null ? total.toFixed(2) : "",
        tax_amount: tax != null ? tax.toFixed(2) : "",
        net_amount: net != null ? net.toFixed(2) : "",
        currency: (data?.currency || "EUR").toString(),
        notes: (data?.notes || "").toString(),
      };
      setExtracted(next);
      setFieldConf((data?.field_confidence ?? {}) as FieldConfidence);
      setLineItems(
        Array.isArray(data?.line_items)
          ? data.line_items.map((item: any) => ({
              description: String(item?.description ?? ""),
              quantity: item?.quantity != null ? String(item.quantity) : "",
              unit_price: item?.unit_price != null ? String(item.unit_price) : "",
              tax_rate: item?.tax_rate != null ? String(item.tax_rate) : "",
              tax_amount: item?.tax_amount != null ? String(item.tax_amount) : "",
              total: item?.total != null ? String(item.total) : "",
            }))
          : [],
      );

      setStage("done");
      setStageMsg("OCR concluído. Revise os dados e confirme a importação.");
    } catch (e: any) {
      setStage("error");
      setStageMsg(e?.message ?? "Erro no processamento");
      toast.error(e?.message ?? "Falha na extração OCR");
    }
  };

  const importMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Sem ficheiro");
      if (!extracted.invoice_number.trim()) throw new Error("Número da fatura é obrigatório");

      setStage("uploading"); setStageMsg("Enviando para o backend…");

      const total = Number(extracted.total_amount.replace(",", ".")) || 0;
      const taxAmount = Number(extracted.tax_amount.replace(",", ".")) || 0;
      const netAmount =
        Number(extracted.net_amount.replace(",", ".")) ||
        Math.max(0, total - taxAmount);
      const attachmentDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") resolve(reader.result);
          else reject(new Error("Falha ao ler ficheiro"));
        };
        reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler ficheiro"));
        reader.readAsDataURL(file);
      });
      // Canonical billing entity = consolidated LIST (grouped by list_name in payment_orders).
      const linked_list_names = Array.from(new Set(linkedListIds));
      const linked_user_ids = Array.from(
        new Set(linkedLists.flatMap((l) => l.user_ids).filter(Boolean) as string[])
      );
      const linked_lists_meta = linkedLists.map((l) => ({
        list_name: l.list_name, technician_name: l.technician_name,
        assigned_user_id: l.assigned_user_id, client_name: l.client_name,
        year: l.year, week: l.week, total: l.total, po_count: l.po_count,
      }));
      const linked_payment_order_ids = Array.from(
        new Set(linkedLists.flatMap((l) => l.payment_order_ids))
      );
      await apiRequest("/billing/admin/ops/invoices/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: ctxWs.resolvedWorkspaceId ?? null,
          invoice_number: extracted.invoice_number.trim(),
          type: "incoming",
          customer_name: extracted.customer_name || extracted.supplier_name || null,
          customer_snapshot: extracted.customer_name || extracted.customer_tax_id ? {
            name: extracted.customer_name || null,
            tax_id: extracted.customer_tax_id || null,
            currency: extracted.currency || "EUR",
          } : null,
          issue_date: extracted.issue_date,
          due_date: extracted.due_date || null,
          total_amount: total,
          paid_amount: 0,
          notes: [
            extracted.supplier_name ? `Fornecedor: ${extracted.supplier_name}` : null,
            extracted.notes || null,
          ].filter(Boolean).join("\n") || null,
          status: "pending",
          source: "imported",
          metadata: {
            linked_list_names,
            linked_lists_meta,
            linked_user_ids,
            // expanded PO ids — required by status-propagation trigger
            linked_payment_order_ids,
            linked_payment_orders: linked_payment_order_ids,
            attachment_storage_path: storagePath,
            ocr: {
              engine: "extract-invoice",
              field_confidence: fieldConf,
              extracted: {
                ...extracted,
                net_amount: netAmount,
                tax_amount: taxAmount,
                line_items: lineItems.map((item) => ({
                  description: item.description,
                  quantity: Number(item.quantity || 0),
                  unit_price: Number(item.unit_price || 0),
                  tax_rate: Number(item.tax_rate || 0),
                  tax_amount: Number(item.tax_amount || 0),
                  total: Number(item.total || 0),
                })),
              },
            },
          },
          attachment: {
            file_name: file.name,
            mime_type: file.type || null,
            size_bytes: file.size,
            data_url: attachmentDataUrl,
          },
        }),
      });
    },
    onSuccess: () => {
      toast.success("Fatura importada");
      qc.invalidateQueries({ queryKey: ["ops-billing-invoices"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: any) => {
      setStage("error"); setStageMsg(e?.message ?? "Erro ao importar");
      toast.error(e.message ?? "Erro ao importar");
    },
  });

  const busy = stage === "rendering" || stage === "ocr" || stage === "extracting" || stage === "validating";

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
                PDF / imagem / câmera / scan — OCR PT · FR · EN.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ContextualWorkspacePicker ctx={ctxWs} />
              <Badge variant="outline" className="text-[10px] gap-1">
                <Sparkles className="h-3 w-3 text-amber-400" /> Gemini OCR
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {step === "upload" && (
          <div className="p-6">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) runPipeline(f);
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
                PDF · JPG · PNG · WEBP · até 20MB
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) runPipeline(f);
                }}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="border border-border/60 rounded-lg px-4 py-3 text-xs flex items-center justify-center gap-2 hover:border-primary/60 hover:bg-muted/30 transition"
              >
                <Camera className="h-4 w-4 text-primary" /> Tirar fotografia
              </button>
              <button
                type="button"
                onClick={() => scanRef.current?.click()}
                className="border border-border/60 rounded-lg px-4 py-3 text-xs flex items-center justify-center gap-2 hover:border-primary/60 hover:bg-muted/30 transition"
              >
                <ScanLine className="h-4 w-4 text-primary" /> Scan documento
              </button>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) runPipeline(f); }}
              />
              <input
                ref={scanRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) runPipeline(f); }}
              />
            </div>

            <div className="mt-4 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> PDF</span>
              <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" /> JPG · PNG · WEBP</span>
            </div>
          </div>
        )}

        {step === "review" && (
          <>
            <StageBar stage={stage} message={stageMsg} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 max-h-[68vh]">
              {/* PREVIEW */}
              <div className="bg-muted/30 border-r border-border/50 p-4 overflow-auto max-h-[68vh]">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                    <Eye className="h-3 w-3" /> Pré-visualização
                  </p>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={reset}>
                    <X className="h-3 w-3 mr-1" /> Trocar ficheiro
                  </Button>
                </div>
                {isImage && imageUrl && (
                  <img src={imageUrl} alt={file?.name} className="w-full rounded-md border border-border/50 bg-white" />
                )}
                {isPdf && (
                  <canvas
                    ref={pdfCanvasRef}
                    className="w-full rounded-md border border-border/50 bg-white"
                    style={{ display: "block", maxWidth: "100%", height: "auto" }}
                  />
                )}
                <p className="mt-2 text-[10px] text-muted-foreground truncate">{file?.name}</p>
              </div>

              {/* EXTRACTED FORM */}
              <div className="p-5 overflow-y-auto max-h-[68vh]">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Dados extraídos
                  </p>
                  {busy ? (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> {STAGE_LABEL[stage]}…
                    </Badge>
                  ) : stage === "done" ? (
                    <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/50 text-emerald-500">
                      <CheckCircle2 className="h-3 w-3" /> Pronto
                    </Badge>
                  ) : stage === "error" ? (
                    <Badge variant="outline" className="text-[10px] gap-1 border-rose-500/50 text-rose-500">
                      <AlertCircle className="h-3 w-3" /> Erro
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/50 text-amber-500">
                      Revisão
                    </Badge>
                  )}
                </div>

                <div className="space-y-3 text-xs">
                  <Field label="Número da fatura *" conf={fieldConf.invoice_number}>
                    <Input value={extracted.invoice_number}
                      onChange={(e) => setExtracted({ ...extracted, invoice_number: e.target.value })}
                      className="h-9" placeholder="Ex: FAT-2026-0001" />
                  </Field>
                  <Field label="Fornecedor / Emitente" conf={fieldConf.supplier_name}>
                    <Input value={extracted.supplier_name}
                      onChange={(e) => setExtracted({ ...extracted, supplier_name: e.target.value })}
                      className="h-9" placeholder="Empresa que emitiu" />
                  </Field>
                  <Field label="NIF / TVA fornecedor" conf={fieldConf.supplier_tax_id}>
                    <Input value={extracted.supplier_tax_id}
                      onChange={(e) => setExtracted({ ...extracted, supplier_tax_id: e.target.value })}
                      className="h-9" placeholder="NIF / VAT fornecedor" />
                  </Field>
                  <Field label="Cliente / Destinatário" conf={fieldConf.customer_name}>
                    <Input value={extracted.customer_name}
                      onChange={(e) => setExtracted({ ...extracted, customer_name: e.target.value })}
                      className="h-9" placeholder="Quem recebeu" />
                  </Field>
                  <Field label="NIF / TVA cliente" conf={fieldConf.customer_tax_id}>
                    <Input value={extracted.customer_tax_id}
                      onChange={(e) => setExtracted({ ...extracted, customer_tax_id: e.target.value })}
                      className="h-9" placeholder="NIF / VAT cliente" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Data emissão" conf={fieldConf.issue_date}>
                      <Input type="date" value={extracted.issue_date}
                        onChange={(e) => setExtracted({ ...extracted, issue_date: e.target.value })}
                        className="h-9" />
                    </Field>
                    <Field label="Vencimento" conf={fieldConf.due_date}>
                      <Input type="date" value={extracted.due_date}
                        onChange={(e) => setExtracted({ ...extracted, due_date: e.target.value })}
                        className="h-9" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <Field label="Base líquida" conf={fieldConf.net_amount}>
                      <Input value={extracted.net_amount}
                        onChange={(e) => setExtracted({ ...extracted, net_amount: e.target.value })}
                        className="h-9 tabular-nums" placeholder="0.00" />
                    </Field>
                    <Field label="Total" conf={fieldConf.total_amount}>
                      <Input value={extracted.total_amount}
                        onChange={(e) => setExtracted({ ...extracted, total_amount: e.target.value })}
                        className="h-9 tabular-nums" placeholder="0.00" />
                    </Field>
                    <Field label="IVA / TVA" conf={fieldConf.tax_amount}>
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

                  <div className="pt-3 mt-3 border-t border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Linhas extraídas
                      </p>
                      <span className="text-[10px] text-muted-foreground">{lineItems.length} itens</span>
                    </div>
                    {lineItems.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">
                        Nenhuma linha foi identificada automaticamente.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {lineItems.map((item, index) => (
                          <div key={`${index}-${item.description}`} className="grid grid-cols-12 gap-2 rounded-md border border-border/50 p-2">
                            <div className="col-span-12">
                              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Descrição</Label>
                              <Input
                                value={item.description}
                                onChange={(e) => setLineItems((prev) => prev.map((entry, i) => i === index ? { ...entry, description: e.target.value } : entry))}
                                className="h-8 mt-1"
                              />
                            </div>
                            <MiniField label="Qtd" value={item.quantity} onChange={(value) => setLineItems((prev) => prev.map((entry, i) => i === index ? { ...entry, quantity: value } : entry))} />
                            <MiniField label="Unitário" value={item.unit_price} onChange={(value) => setLineItems((prev) => prev.map((entry, i) => i === index ? { ...entry, unit_price: value } : entry))} />
                            <MiniField label="TVA %" value={item.tax_rate} onChange={(value) => setLineItems((prev) => prev.map((entry, i) => i === index ? { ...entry, tax_rate: value } : entry))} />
                            <MiniField label="TVA" value={item.tax_amount} onChange={(value) => setLineItems((prev) => prev.map((entry, i) => i === index ? { ...entry, tax_amount: value } : entry))} />
                            <MiniField label="Total" value={item.total} onChange={(value) => setLineItems((prev) => prev.map((entry, i) => i === index ? { ...entry, total: value } : entry))} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Vinculação direta a payment_orders (fonte única de verdade) */}
                  <div className="pt-3 mt-3 border-t border-border/50">
                    <PaymentListsSelector
                      value={linkedListIds}
                      onChange={(ids, lists) => { setLinkedListIds(ids); setLinkedLists(lists); }}
                    />
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      Entidade financeira: <span className="font-medium">Lista consolidada</span> (ex.: L012483).
                      Origem: payment-orders. O estado da fatura propaga automaticamente para as OPs internas das listas.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <DialogFooter className="px-6 py-3 border-t border-border/50 bg-background">
          <div className="flex-1 text-[10px] text-muted-foreground">
            {step === "review" && "Origem: importada externamente · OCR pode conter erros — reveja antes de confirmar."}
          </div>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            Cancelar
          </Button>
          {step === "review" && (
            <Button
              onClick={() => importMut.mutate()}
              disabled={importMut.isPending || busy}
            >
              {importMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Importar fatura
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StageBar({ stage, message }: { stage: Stage; message: string }) {
  const stages: Stage[] = ["rendering", "ocr", "extracting", "validating", "done"];
  const activeIdx = stage === "error"
    ? -1
    : stage === "uploading" ? 0 : stages.indexOf(stage);
  return (
    <div className="px-6 py-2.5 border-b border-border/50 bg-muted/20">
      <div className="flex items-center gap-3 text-[10px]">
        {stages.map((s, i) => {
          const done = activeIdx > i || stage === "done";
          const active = activeIdx === i && stage !== "done";
          return (
            <div key={s} className="flex items-center gap-2 flex-1">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  done ? "bg-emerald-500" : active ? "bg-amber-400 animate-pulse" : "bg-muted-foreground/30"
                )}
              />
              <span className={cn(
                "uppercase tracking-wider font-medium",
                done ? "text-emerald-500" : active ? "text-foreground" : "text-muted-foreground/70"
              )}>
                {STAGE_LABEL[s]}
              </span>
              {i < stages.length - 1 && <span className="flex-1 h-px bg-border/50" />}
            </div>
          );
        })}
      </div>
      {message && (
        <p className={cn(
          "mt-1 text-[10px]",
          stage === "error" ? "text-rose-500" : "text-muted-foreground"
        )}>
          {message}
        </p>
      )}
    </div>
  );
}

function confDot(c?: "high" | "medium" | "low") {
  if (!c) return null;
  const color = c === "high" ? "bg-emerald-500" : c === "medium" ? "bg-amber-400" : "bg-rose-500";
  return <span className={cn("h-1.5 w-1.5 rounded-full inline-block", color)} title={`OCR: ${c}`} />;
}

function Field({ label, children, conf }: { label: string; children: ReactNode; conf?: "high" | "medium" | "low" }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {label} {confDot(conf)}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function MiniField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="col-span-6 sm:col-span-2">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 mt-1" />
    </div>
  );
}
