import { useState } from "react";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, Trash2, AlertTriangle, Pencil, CheckCircle2, XCircle } from "lucide-react";
import type { ExtractedOrder } from "@/hooks/useServiceOrders";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { ExtractionStages, type Stage } from "./ExtractionStages";

interface ExtractedDataTableProps {
  orders: ExtractedOrder[];
  confidence: "high" | "medium" | "low";
  notes?: string;
  onSave: (orders: ExtractedOrder[]) => void;
  onDiscard: () => void;
  isSaving: boolean;
}

const confidenceColors = {
  high: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  low: "bg-red-500/10 text-red-400 border-red-500/30",
};

export function ExtractedDataTable({ orders: initial, confidence, notes, onSave, onDiscard, isSaving }: ExtractedDataTableProps) {
  const [rows, setRows] = useState<ExtractedOrder[]>(initial);
  const [stage, setStage] = useState<Stage>("review");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validated, setValidated] = useState(false);
  const { t, formatCurrency } = useLanguage();

  const update = (idx: number, field: keyof ExtractedOrder, value: string | number | null) => {
    setValidated(false);
    setValidationErrors([]);
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const updated = { ...r, [field]: value };
        const p1 = Number(updated.service_1_price) || 0;
        const p2 = Number(updated.service_2_price) || 0;
        const p3 = Number(updated.service_3_price) || 0;
        const p4 = Number(updated.service_4_price) || 0;
        updated.total = p1 + p2 + p3 + p4;
        return updated;
      })
    );
    if (stage !== "review") setStage("review");
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setValidated(false);
    setValidationErrors([]);
    if (stage !== "review") setStage("review");
  };

  const runValidation = () => {
    const errors: string[] = [];
    rows.forEach((row, i) => {
      const n = String(i + 1);
      if (!row.client?.trim()) errors.push(t("validate.missingClient").replace("{n}", n));
      const hasService = row.service_1_name?.trim() || row.service_2_name?.trim() || row.service_3_name?.trim() || row.service_4_name?.trim();
      if (!hasService) errors.push(t("validate.missingService").replace("{n}", n));
      const computed = (Number(row.service_1_price) || 0) + (Number(row.service_2_price) || 0) + (Number(row.service_3_price) || 0) + (Number(row.service_4_price) || 0);
      if (row.total != null && Math.abs(computed - row.total) > 0.01) {
        errors.push(t("validate.totalMismatch").replace("{n}", n).replace("{expected}", String(computed)).replace("{actual}", String(row.total)));
      }
      if ((row.total ?? 0) === 0 && hasService) errors.push(t("validate.zeroTotal").replace("{n}", n));
    });
    setValidationErrors(errors);
    if (errors.length === 0) {
      setValidated(true);
      setStage("save");
    } else {
      setValidated(false);
      setStage("validate");
    }
  };

  const handleSave = () => {
    setStage("save");
    onSave(rows);
  };

  const hasCorrections = rows.some((r) => r.handwritten_corrections?.length);

  return (
    <div className="space-y-3">
      {/* Stage indicator */}
      <ExtractionStages current={stage} />

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">{t("extract.title")}</h3>
          <Badge variant="outline" className={cn("text-xs", confidenceColors[confidence])}>
            {confidence} {t("extract.confidence")}
          </Badge>
          {hasCorrections && (
            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/30">
              <Pencil className="h-3 w-3 mr-1" />
              {t("extract.corrections")}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onDiscard} disabled={isSaving}>
            <Trash2 className="h-4 w-4 mr-1" /> {t("action.discard")}
          </Button>
          {!validated && (
            <Button size="sm" variant="outline" onClick={runValidation} disabled={rows.length === 0}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> {t("validate.run")}
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={isSaving || rows.length === 0 || !validated}>
            <Save className="h-4 w-4 mr-1" /> {t("extract.saveN").replace("{n}", String(rows.length))}
          </Button>
        </div>
      </div>

      {/* Validation feedback */}
      {validationErrors.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <XCircle className="h-4 w-4" />
            {t("validate.failed")}
          </div>
          <ul className="list-disc list-inside text-xs text-destructive/80 space-y-0.5">
            {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
      {validated && validationErrors.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          {t("validate.passed")}
        </div>
      )}

      {notes && (
        <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{notes}</span>
        </div>
      )}

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/30">
              <TableHead className="w-8">#</TableHead>
              <TableHead>{t("label.client")}</TableHead>
              <TableHead>{t("label.platform")}</TableHead>
              <TableHead>{t("label.technician")}</TableHead>
              <TableHead>{t("label.week")}</TableHead>
              <TableHead>{t("label.car")}</TableHead>
              <TableHead>{t("label.plate")}</TableHead>
              <TableHead>Service 1</TableHead>
              <TableHead className="w-20">{t("extract.price")}</TableHead>
              <TableHead>Service 2</TableHead>
              <TableHead className="w-20">{t("extract.price")}</TableHead>
              <TableHead>Service 3</TableHead>
              <TableHead className="w-20">{t("extract.price")}</TableHead>
              <TableHead>Service 4</TableHead>
              <TableHead className="w-20">{t("extract.price")}</TableHead>
              <TableHead className="w-24">{t("label.total")}</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow key={idx} className="group">
                <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                <EditableCell value={row.client} onChange={(v) => update(idx, "client", v)} />
                <EditableCell value={row.platform} onChange={(v) => update(idx, "platform", v)} />
                <EditableCell value={row.technician} onChange={(v) => update(idx, "technician", v)} />
                <EditableCell value={row.week} onChange={(v) => update(idx, "week", v)} />
                <EditableCell value={row.car_name} onChange={(v) => update(idx, "car_name", v)} />
                <EditableCell value={row.license_plate} onChange={(v) => update(idx, "license_plate", v)} />
                <EditableCell value={row.service_1_name} onChange={(v) => update(idx, "service_1_name", v)} />
                <EditableNumCell value={row.service_1_price} onChange={(v) => update(idx, "service_1_price", v)} />
                <EditableCell value={row.service_2_name} onChange={(v) => update(idx, "service_2_name", v)} />
                <EditableNumCell value={row.service_2_price} onChange={(v) => update(idx, "service_2_price", v)} />
                <EditableCell value={row.service_3_name} onChange={(v) => update(idx, "service_3_name", v)} />
                <EditableNumCell value={row.service_3_price} onChange={(v) => update(idx, "service_3_price", v)} />
                <EditableCell value={row.service_4_name} onChange={(v) => update(idx, "service_4_name", v)} />
                <EditableNumCell value={row.service_4_price} onChange={(v) => update(idx, "service_4_price", v)} />
                <TableCell className="font-semibold text-primary tabular-nums">
                  {row.total != null ? formatCurrency(row.total) : "—"}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => removeRow(idx)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={17} className="text-center text-muted-foreground py-8">
                  {t("extract.noOrders")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EditableCell({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  return (
    <TableCell className="p-1">
      <Input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs bg-transparent border-transparent hover:border-border focus:border-primary"
      />
    </TableCell>
  );
}

function EditableNumCell({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <TableCell className="p-1">
      <Input
        type="number"
        step="0.01"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : null)}
        className="h-8 text-xs bg-transparent border-transparent hover:border-border focus:border-primary tabular-nums w-20"
      />
    </TableCell>
  );
}
