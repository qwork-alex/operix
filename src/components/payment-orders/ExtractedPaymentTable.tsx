import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Save, X, Trash2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ExtractedPaymentOrder } from "@/hooks/usePaymentOrders";
import { useLanguage } from "@/hooks/useLanguage";

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

export function ExtractedPaymentTable({ orders, confidence, notes, onSave, onDiscard, isSaving }: Props) {
  const [rows, setRows] = useState<ExtractedPaymentOrder[]>(orders);
  const { t, formatCurrency } = useLanguage();

  const update = (idx: number, field: keyof ExtractedPaymentOrder, value: any) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, [field]: value };
      if (field === "services") {
        updated.total = (value as { name: string; price: number }[]).reduce((s, sv) => s + (sv.price || 0), 0);
      }
      return updated;
    }));
  };

  const removeRow = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx));

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border/50 bg-card p-6 text-center text-muted-foreground text-sm">
        {t("extract.noPayments")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-foreground">{t("extract.paymentTitle")}</h3>
          <Badge variant="outline" className={confidenceColors[confidence]}>
            {confidence} {t("extract.confidence")}
          </Badge>
          <span className="text-xs text-muted-foreground">{rows.length} {t("extract.entries")}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onDiscard}><X className="h-4 w-4 mr-1" />{t("action.discard")}</Button>
          <Button size="sm" onClick={() => onSave(rows)} disabled={isSaving}>
            <Save className="h-4 w-4 mr-1" />{isSaving ? t("extract.saving") : t("action.save")}
          </Button>
        </div>
      </div>

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
            {rows.map((row, i) => (
              <TableRow key={i} className="text-xs">
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell><EditCell value={row.client || ""} onChange={v => update(i, "client", v)} /></TableCell>
                <TableCell><EditCell value={row.platform || ""} onChange={v => update(i, "platform", v)} /></TableCell>
                <TableCell><EditCell value={row.list_name || ""} onChange={v => update(i, "list_name", v)} /></TableCell>
                <TableCell><EditCell value={row.technician || ""} onChange={v => update(i, "technician", v)} /></TableCell>
                <TableCell><EditCell value={row.car_name || ""} onChange={v => update(i, "car_name", v)} /></TableCell>
                <TableCell><EditCell value={row.license_plate || ""} onChange={v => update(i, "license_plate", v)} /></TableCell>
                <TableCell className="max-w-[200px]">
                  <div className="space-y-1">
                    {(row.services || []).map((s, si) => (
                      <div key={si} className="flex gap-1 items-center">
                        <Input
                          className="h-6 text-[11px] px-1 w-24"
                          value={s.name}
                          placeholder={t("extract.serviceName")}
                          onChange={e => {
                            const newServices = [...(row.services || [])];
                            newServices[si] = { ...newServices[si], name: e.target.value };
                            update(i, "services", newServices);
                          }}
                        />
                        <Input
                          className="h-6 text-[11px] px-1 w-16 text-right"
                          type="number"
                          step="0.01"
                          value={s.price || 0}
                          onChange={e => {
                            const newServices = [...(row.services || [])];
                            newServices[si] = { ...newServices[si], price: parseFloat(e.target.value) || 0 };
                            update(i, "services", newServices);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCurrency(row.total || 0)}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(i)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EditCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Input className="h-6 text-[11px] px-1 bg-transparent border-transparent hover:border-border focus:border-border" value={value} onChange={e => onChange(e.target.value)} />;
}
