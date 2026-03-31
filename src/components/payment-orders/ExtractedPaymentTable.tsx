import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Save, X, Trash2, AlertTriangle, CheckCircle2, XCircle, Pencil } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ExtractedPaymentOrder, FieldConfidence } from "@/hooks/usePaymentOrders";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { ExtractionStages, type Stage } from "@/components/service-orders/ExtractionStages";

interface Props {
  orders: ExtractedPaymentOrder[];
  confidence: "high" | "medium" | "low";
  notes?: string;
  onSave: (orders: ExtractedPaymentOrder[]) => void;
  onDiscard: () => void;
  isSaving?: boolean;
}

const confidenceColors: Record<string, string> = {
  high: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  low: "bg-red-500/10 text-red-400 border-red-500/30",
};

const fieldConfBorder: Record<FieldConfidence, string> = {
  high: "border-transparent",
  medium: "border-amber-500/50 bg-amber-500/5",
  low: "border-red-500/50 bg-red-500/5",
};

export function ExtractedPaymentTable({ orders, confidence, notes, onSave, onDiscard, isSaving }: Props) {
  const [rows, setRows] = useState<ExtractedPaymentOrder[]>(orders);
  const [stage, setStage] = useState<Stage>("review");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validated, setValidated] = useState(false);
  const { t, formatCurrency } = useLanguage();

  const update = (idx: number, field: keyof ExtractedPaymentOrder, value: any) => {
    setValidated(false);
    setValidationErrors([]);
    if (stage !== "review") setStage("review");
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, [field]: value };
      if (field === "services") {
        updated.total = (value as { name: string; price: number }[]).reduce((s, sv) => s + (sv.price || 0), 0);
      }
      // Mark edited field as high confidence
      if (updated.field_confidence) {
        updated.field_confidence = { ...updated.field_confidence, [field]: "high" };
      }
      updated.total_mismatch = false;
      return updated;
    }));
  };

  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
    setValidated(false);
    setValidationErrors([]);
    if (stage !== "review") setStage("review");
  };

  const runValidation = () => {
    const errors: string[] = [];
    rows.forEach((row, i) => {
      const n = String(i + 1);
      if (!row.client?.trim()) errors.push(t("validate.missingClient").replace("{n}", n));
      const hasService = (row.services || []).some(s => s.name?.trim());
      if (!hasService) errors.push(t("validate.missingService").replace("{n}", n));
      const computed = (row.services || []).reduce((s, sv) => s + (sv.price || 0), 0);
      if (row.total != null && Math.abs(computed - (row.total || 0)) > 0.01) {
        errors.push(t("validate.totalMismatch").replace("{n}", n).replace("{expected}", String(computed)).replace("{actual}", String(row.total)));
      }
      if ((row.total ?? 0) === 0 && hasService) errors.push(t("validate.zeroTotal").replace("{n}", n));
      const lowFields = Object.entries(row.field_confidence || {}).filter(([, v]) => v === "low").map(([k]) => k);
      if (lowFields.length > 0) {
        errors.push(t("validate.lowConfidence").replace("{n}", n).replace("{fields}", lowFields.join(", ")));
      }
    });
    setValidationErrors(errors);
    const blocking = errors.filter(e => !e.includes(t("validate.lowConfidencePrefix")));
    if (blocking.length === 0) {
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

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border/50 bg-card p-6 text-center text-muted-foreground text-sm">
        {t("extract.noPayments")}
      </div>
    );
  }

  const hasCorrections = rows.some(r => r.handwritten_corrections?.length);
  const hasMismatches = rows.some(r => r.total_mismatch);
  const uncertainCount = rows.reduce((c, r) => c + Object.values(r.field_confidence || {}).filter(v => v === "low" || v === "medium").length, 0);

  return (
    <div className="space-y-3">
      <ExtractionStages current={stage} />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-medium text-foreground">{t("extract.paymentTitle")}</h3>
          <Badge variant="outline" className={confidenceColors[confidence]}>
            {confidence} {t("extract.confidence")}
          </Badge>
          <span className="text-xs text-muted-foreground">{rows.length} {t("extract.entries")}</span>
          {hasCorrections && (
            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/30">
              <Pencil className="h-3 w-3 mr-1" />
              {t("extract.corrections")}
            </Badge>
          )}
          {hasMismatches && (
            <Badge variant="outline" className="text-xs bg-red-500/10 text-red-400 border-red-500/30">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {t("extract.totalMismatch")}
            </Badge>
          )}
          {uncertainCount > 0 && (
            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/30">
              {uncertainCount} {t("extract.uncertainFields")}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onDiscard}><X className="h-4 w-4 mr-1" />{t("action.discard")}</Button>
          {!validated && (
            <Button size="sm" variant="outline" onClick={runValidation} disabled={rows.length === 0}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> {t("validate.run")}
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={isSaving || !validated}>
            <Save className="h-4 w-4 mr-1" />{isSaving ? t("extract.saving") : t("action.save")}
          </Button>
        </div>
      </div>

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
        <Alert variant="destructive" className="bg-amber-500/5 border-amber-500/20">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">{notes}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border border-border/50 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-[11px]">
              <TableHead className="w-8">#</TableHead>
              <TableHead>{t("label.client")}</TableHead>
              <TableHead>{t("label.platform")}</TableHead>
              <TableHead>{t("extract.listName")}</TableHead>
              <TableHead>{t("label.technician")}</TableHead>
              <TableHead>{t("label.car")}</TableHead>
              <TableHead>{t("label.plate")}</TableHead>
              <TableHead>{t("label.services")}</TableHead>
              <TableHead className="text-right">{t("label.total")}</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => {
              const fc = row.field_confidence || {};
              return (
                <TableRow key={i} className={cn("text-xs", row.total_mismatch && "bg-red-500/5")}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell><ConfEditCell value={row.client || ""} confidence={fc.client} onChange={v => update(i, "client", v)} /></TableCell>
                  <TableCell><ConfEditCell value={row.platform || ""} confidence={fc.platform} onChange={v => update(i, "platform", v)} /></TableCell>
                  <TableCell><ConfEditCell value={row.list_name || ""} confidence={fc.list_name} onChange={v => update(i, "list_name", v)} /></TableCell>
                  <TableCell><ConfEditCell value={row.technician || ""} confidence={fc.technician} onChange={v => update(i, "technician", v)} /></TableCell>
                  <TableCell><ConfEditCell value={row.car_name || ""} confidence={fc.car_name} onChange={v => update(i, "car_name", v)} /></TableCell>
                  <TableCell><ConfEditCell value={row.license_plate || ""} confidence={fc.license_plate} onChange={v => update(i, "license_plate", v)} /></TableCell>
                  <TableCell className="max-w-[200px]">
                    <div className="space-y-1">
                      {(row.services || []).map((s, si) => (
                        <div key={si} className="flex gap-1 items-center">
                          <Input
                            className={cn("h-6 text-[11px] px-1 w-24", s.confidence && s.confidence !== "high" ? fieldConfBorder[s.confidence] : "")}
                            value={s.name}
                            placeholder={t("extract.serviceName")}
                            onChange={e => {
                              const newServices = [...(row.services || [])];
                              newServices[si] = { ...newServices[si], name: e.target.value, confidence: "high" };
                              update(i, "services", newServices);
                            }}
                          />
                          <Input
                            className={cn("h-6 text-[11px] px-1 w-16 text-right", s.confidence && s.confidence !== "high" ? fieldConfBorder[s.confidence] : "")}
                            type="number"
                            step="0.01"
                            value={s.price || 0}
                            onChange={e => {
                              const newServices = [...(row.services || [])];
                              newServices[si] = { ...newServices[si], price: parseFloat(e.target.value) || 0, confidence: "high" };
                              update(i, "services", newServices);
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className={cn("text-right font-medium tabular-nums", row.total_mismatch ? "text-destructive" : "")}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={cn(row.total_mismatch && "cursor-help underline decoration-dashed")}>
                          {formatCurrency(row.total || 0)}
                        </span>
                      </TooltipTrigger>
                      {row.total_mismatch && (
                        <TooltipContent>{t("extract.totalMismatchTip")}</TooltipContent>
                      )}
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(i)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ConfEditCell({ value, confidence, onChange }: { value: string; confidence?: FieldConfidence; onChange: (v: string) => void }) {
  const conf = confidence || "high";
  const borderClass = fieldConfBorder[conf];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Input
          className={cn("h-6 text-[11px] px-1 bg-transparent hover:border-border focus:border-border", borderClass)}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </TooltipTrigger>
      {conf !== "high" && (
        <TooltipContent className="text-xs">
          {conf === "low" ? "⚠️ Low confidence — please verify" : "⚡ Medium confidence — review recommended"}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
