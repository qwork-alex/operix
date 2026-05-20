import { useState, useRef } from "react";
import { Loader2, Upload, FileText, X, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useWorkspaceTechnicians } from "@/hooks/useFinancialPeriods";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateAccountingDownstream } from "@/lib/financialSync";
import { toast } from "sonner";

const CATEGORY_OPTIONS = [
  { value: "fuel", label: "Combustível" },
  { value: "rent", label: "Aluguel" },
  { value: "material", label: "Material/Compras" },
  { value: "tax", label: "Governo/Impostos" },
  { value: "salary", label: "Salário/Retirada" },
  { value: "travel", label: "Viagem" },
  { value: "other", label: "Outro" },
];

interface Extracted {
  merchant?: string;
  document_number?: string;
  issue_date?: string;
  amount?: number;
  currency?: string;
  category?: string;
  description?: string;
  confidence?: "high" | "medium" | "low";
}

interface ImportReceiptDialogProps {
  open: boolean;
  onClose: () => void;
  defaultCategory?: string;
  year?: number;
  month?: number | null;
  techId?: string | null;
}

export function ImportReceiptDialog({
  open,
  onClose,
  defaultCategory = "other",
  year,
  month,
  techId,
}: ImportReceiptDialogProps) {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  const { data: techList = [] } = useWorkspaceTechnicians();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    issue_date: "",
    category: defaultCategory,
    techId: techId || "none",
  });
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFile(null);
    setExtracted(null);
    setForm({ description: "", amount: "", issue_date: "", category: defaultCategory, techId: techId || "none" });
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const fileToBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] || "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const handleFile = async (f: File) => {
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Ficheiro maior que 10 MB");
      return;
    }
    setFile(f);
    setExtracting(true);
    try {
      const fileBase64 = await fileToBase64(f);
      const { data, error } = await supabase.functions.invoke("extract-receipt", {
        body: { fileBase64, mimeType: f.type || "application/octet-stream", fileName: f.name },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const ex = data as Extracted;
      setExtracted(ex);
      setForm((prev) => ({
        ...prev,
        description: ex.description || ex.merchant || "",
        amount: ex.amount ? String(ex.amount) : "",
        issue_date: ex.issue_date || "",
        category: ex.category || defaultCategory,
      }));
      toast.success("Dados extraídos. Reveja antes de salvar.");
    } catch (e: any) {
      console.error("Extract error:", e);
      toast.error(e?.message || "Falha ao extrair documento");
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!file) return toast.error("Carregue um documento primeiro");
    if (!form.amount || !form.description) return toast.error("Preencha descrição e valor");
    if (!workspaceId) return toast.error("Workspace não disponível");

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada");

      // 1) Upload to storage
      const ext = file.name.split(".").pop() || "bin";
      const storagePath = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("accounting-receipts")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      // 2) Document row (entity_type='accounting_receipt')
      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .insert({
          workspace_id: workspaceId,
          name: file.name,
          display_name: form.description,
          type: "file",
          module: "accounting",
          entity_type: "accounting_receipt",
          storage_path: `accounting-receipts/${storagePath}`,
          mime_type: file.type,
          size_bytes: file.size,
          uploaded_by: user.id,
        })
        .select("id")
        .single();
      if (docErr) throw docErr;

      // 3) Financial record (auto, origin='imported_document', reference_id=doc.id)
      const yr = year ?? (form.issue_date ? Number(form.issue_date.slice(0, 4)) : new Date().getFullYear());
      const createdAt = form.issue_date
        ? new Date(form.issue_date + "T12:00:00Z").toISOString()
        : month
          ? new Date(Date.UTC(yr, month - 1, 15)).toISOString()
          : new Date().toISOString();

      const payload: Record<string, unknown> = {
        type: "expense",
        source: "imported_document",
        origin: "imported_document",
        category: form.category || "other",
        amount: parseFloat(form.amount),
        label: form.description,
        notes: [extracted?.merchant, extracted?.document_number]
          .filter(Boolean)
          .join(" • "),
        status: "confirmed",
        workspace_id: workspaceId,
        year_reference: yr,
        created_at: createdAt,
        reference_id: doc.id,
      };
      if (form.techId && form.techId !== "none") payload.assigned_user_id = form.techId;

      const { error: frErr } = await (supabase as any).from("financial_records").insert(payload);
      if (frErr) throw frErr;

      toast.success("Documento importado e lançamento criado");
      invalidateAccountingDownstream(qc);
      handleClose();
    } catch (e: any) {
      console.error("Import save error:", e);
      const msg = String(e?.message || "");
      if (msg.includes("financial_records_origin_ref_unique")) {
        toast.error("Este documento já foi importado anteriormente");
      } else {
        toast.error(msg || "Falha ao guardar");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary" /> Importar documento
          </DialogTitle>
        </DialogHeader>

        {!file ? (
          <div
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mx-auto mb-3 text-muted-foreground" size={32} />
            <p className="text-sm text-foreground">Carregue um talão, fatura ou recibo</p>
            <p className="text-xs text-muted-foreground mt-1">Imagens (JPG, PNG, HEIC) ou PDF — até 10 MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2 rounded-md bg-muted/40 border border-border/40">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={16} className="text-muted-foreground shrink-0" />
                <span className="text-xs text-foreground truncate">{file.name}</span>
              </div>
              <button onClick={reset} className="text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            </div>

            {extracting ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="animate-spin" size={18} />
                <span className="text-sm">A analisar documento…</span>
              </div>
            ) : (
              <>
                {extracted?.confidence && (
                  <p className="text-xs text-muted-foreground">
                    Confiança da extração: <span className="capitalize text-foreground">{extracted.confidence}</span>
                    {extracted.currency && ` • ${extracted.currency}`}
                  </p>
                )}

                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Descrição</Label>
                    <Input
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Ex.: Combustível Repsol"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Valor</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={form.amount}
                        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Data</Label>
                      <Input
                        type="date"
                        value={form.issue_date}
                        onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Categoria</Label>
                      <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CATEGORY_OPTIONS.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Técnico (opcional)</Label>
                      <Select value={form.techId} onValueChange={(v) => setForm((f) => ({ ...f, techId: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {techList.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || extracting || !file || !extracted}>
            {saving && <Loader2 size={14} className="animate-spin mr-2" />}
            Guardar lançamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
