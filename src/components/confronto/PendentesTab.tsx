import { useState } from "react";
import { AlertTriangle, CheckCircle, Clock, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/hooks/useLanguage";
import { useConfrontoPending, useValidatePending, type PendingItem } from "@/hooks/useConfrontoOSOP";

const AGING_STYLES: Record<string, string> = {
  normal: "",
  warning: "border-l-4 border-l-amber-500",
  critical: "border-l-4 border-l-destructive",
};

const AGING_BADGE: Record<string, { label: string; className: string }> = {
  normal: { label: "", className: "" },
  warning: { label: "3-7d", className: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  critical: { label: "7d+", className: "bg-destructive/10 text-destructive border-destructive/30" },
};

function PendingCard({
  item,
  formatCurrency,
  onValidate,
  validating,
}: {
  item: PendingItem;
  formatCurrency: (v: number) => string;
  onValidate: (id: string, diff: number) => void;
  validating: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Build per-service comparison
  const maxLen = Math.max(item.soServices.length, item.poServices.length);
  const serviceRows: { name: string; soPrice: number; poPrice: number; diff: number }[] = [];
  for (let i = 0; i < maxLen; i++) {
    const soSvc = item.soServices[i];
    const poSvc = item.poServices[i];
    serviceRows.push({
      name: soSvc?.name || poSvc?.name || `Serviço ${i + 1}`,
      soPrice: soSvc?.price || 0,
      poPrice: poSvc?.price || 0,
      diff: (soSvc?.price || 0) - (poSvc?.price || 0),
    });
  }

  return (
    <>
      <div className={`rounded-lg border border-border/50 p-4 space-y-3 ${AGING_STYLES[item.aging_level]}`}>
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
              Divergência: {formatCurrency(Math.abs(item.difference))}
            </Badge>
            {item.aging_level !== "normal" && (
              <Badge variant="outline" className={`text-[10px] ${AGING_BADGE[item.aging_level].className}`}>
                <Clock className="h-2.5 w-2.5 mr-0.5" />
                {AGING_BADGE[item.aging_level].label}
              </Badge>
            )}
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div>
            <p className="text-[10px] text-muted-foreground">Placa</p>
            <p className="font-medium">{item.so.license_plate || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Cliente</p>
            <p className="font-medium">{item.so.client_name || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Plataforma</p>
            <p className="font-medium">{item.so.platform || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Técnico</p>
            <p className="font-medium">{item.so.technician_name || "—"}</p>
          </div>
        </div>

        {/* Service breakdown */}
        {serviceRows.length > 0 && (
          <div className="rounded border border-border/30 overflow-hidden">
            <div className="grid grid-cols-4 gap-0 text-[10px] font-semibold text-muted-foreground bg-muted/30 px-3 py-1.5">
              <span>Serviço</span>
              <span className="text-right">OS</span>
              <span className="text-right">OP</span>
              <span className="text-right">Diferença</span>
            </div>
            {serviceRows.map((sr, i) => (
              <div key={i} className="grid grid-cols-4 gap-0 text-xs px-3 py-1.5 border-t border-border/20">
                <span className="truncate">{sr.name}</span>
                <span className="text-right tabular-nums">{formatCurrency(sr.soPrice)}</span>
                <span className="text-right tabular-nums">{formatCurrency(sr.poPrice)}</span>
                <span className={`text-right tabular-nums font-medium ${
                  sr.diff > 0 ? "text-destructive" : sr.diff < 0 ? "text-emerald-400" : "text-muted-foreground"
                }`}>
                  {sr.diff !== 0 ? (sr.diff > 0 ? "-" : "+") + formatCurrency(Math.abs(sr.diff)) : "—"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Totals */}
        <div className="grid grid-cols-3 gap-2 text-xs bg-muted/20 rounded p-2">
          <div>
            <p className="text-[10px] text-muted-foreground">Total OS</p>
            <p className="font-bold tabular-nums">{formatCurrency(item.totalSO)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Total OP</p>
            <p className="font-bold tabular-nums">{formatCurrency(item.totalPO)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Diferença</p>
            <p className={`font-bold tabular-nums ${item.difference > 0 ? "text-destructive" : "text-emerald-400"}`}>
              {item.difference > 0 ? "-" : "+"}{formatCurrency(Math.abs(item.difference))}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-border/30">
          <Button
            size="sm"
            className="text-xs"
            onClick={() => setConfirmOpen(true)}
            disabled={validating}
          >
            {validating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
            Validar tudo
          </Button>
          <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" disabled>
            Manter pendente
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar validação</AlertDialogTitle>
            <AlertDialogDescription>
              Você está marcando esta divergência como resolvida.
              Isso irá atualizar o financeiro e considerar os valores como pagos.
              <br /><br />
              <strong>Importante:</strong> O status da OS e da OP NÃO será alterado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              onValidate(item.id, item.difference);
              setConfirmOpen(false);
            }}>
              Confirmar validação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function PendentesTab() {
  const { formatCurrency } = useLanguage();
  const { data: pending = [], isLoading } = useConfrontoPending();
  const validateMutation = useValidatePending();

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          A carregar pendentes...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Pendentes ({pending.length})
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          OS e OP fundidos com divergência de valor. Valide para resolver.
        </p>
      </CardHeader>
      <CardContent>
        {pending.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
            Nenhuma divergência pendente.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((item) => (
              <PendingCard
                key={item.id}
                item={item}
                formatCurrency={formatCurrency}
                onValidate={(id, diff) => validateMutation.mutate({ id, difference: diff })}
                validating={validateMutation.isPending}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
