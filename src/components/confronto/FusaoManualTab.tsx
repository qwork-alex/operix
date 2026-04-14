import { useState } from "react";
import { Link2, X, ArrowRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/hooks/useLanguage";
import { useMatchCandidates, useMergeMatch, useRejectMatch, type MatchCandidate } from "@/hooks/useConfrontoOSOP";

function CandidateCard({
  c,
  formatCurrency,
  onMerge,
  onReject,
  merging,
}: {
  c: MatchCandidate;
  formatCurrency: (v: number) => string;
  onMerge: () => void;
  onReject: () => void;
  merging: boolean;
}) {
  const soTotal = Number(c.so.total || 0);
  const poTotal = Number(c.po.total || 0);
  const diff = soTotal - poTotal;

  return (
    <div className="rounded-lg border border-border/50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
            Score: {c.score}%
          </Badge>
          {c.reasons.map((r, i) => (
            <Badge key={i} variant="secondary" className="text-[9px]">{r}</Badge>
          ))}
        </div>
        <span className={`text-sm font-bold tabular-nums ${
          Math.abs(diff) < 0.01 ? "text-emerald-400" : "text-destructive"
        }`}>
          {Math.abs(diff) < 0.01 ? "Valores iguais" : `Δ ${formatCurrency(Math.abs(diff))}`}
        </span>
      </div>

      {/* OS vs OP side by side */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
        {/* SO */}
        <div className="space-y-1.5 text-xs">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Ordem de Serviço</p>
          <p><span className="text-muted-foreground">Placa:</span> {c.so.license_plate || "—"}</p>
          <p><span className="text-muted-foreground">Cliente:</span> {c.so.client_name || "—"}</p>
          <p><span className="text-muted-foreground">Plataforma:</span> {c.so.platform || "—"}</p>
          <p><span className="text-muted-foreground">Técnico:</span> {c.so.technician_name || "—"}</p>
          {c.soServices.length > 0 && (
            <div className="mt-1">
              <p className="text-[10px] text-muted-foreground">Serviços:</p>
              {c.soServices.map((s, i) => (
                <p key={i} className="text-[11px]">{s.name}: {formatCurrency(s.price)}</p>
              ))}
            </div>
          )}
          <p className="font-semibold mt-1">Total: {formatCurrency(soTotal)}</p>
        </div>

        <div className="flex items-center pt-8">
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* PO */}
        <div className="space-y-1.5 text-xs">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">Ordem de Pagamento</p>
          <p><span className="text-muted-foreground">Placa:</span> {c.po.license_plate || "—"}</p>
          <p><span className="text-muted-foreground">Cliente:</span> {c.po.client_name || "—"}</p>
          <p><span className="text-muted-foreground">Plataforma:</span> {c.po.platform || "—"}</p>
          <p><span className="text-muted-foreground">Técnico:</span> {c.po.technician_name || "—"}</p>
          {c.poServices.length > 0 && (
            <div className="mt-1">
              <p className="text-[10px] text-muted-foreground">Serviços:</p>
              {c.poServices.map((s, i) => (
                <p key={i} className="text-[11px]">{s.name}: {formatCurrency(s.price)}</p>
              ))}
            </div>
          )}
          <p className="font-semibold mt-1">Total: {formatCurrency(poTotal)}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/30">
        <Button size="sm" onClick={onMerge} disabled={merging} className="text-xs">
          {merging ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
          Fundir
        </Button>
        <Button size="sm" variant="ghost" onClick={onReject} className="text-xs text-destructive">
          <X className="h-3 w-3 mr-1" />
          Não é correspondência
        </Button>
      </div>
    </div>
  );
}

export default function FusaoManualTab() {
  const { formatCurrency } = useLanguage();
  const { data: candidates = [], isLoading } = useMatchCandidates();
  const mergeMutation = useMergeMatch();
  const rejectMutation = useRejectMatch();

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          A analisar correspondências...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          Fusão manual ({candidates.length})
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Correspondências sugeridas entre OS e OP. Apenas pares com correlação real são exibidos.
        </p>
      </CardHeader>
      <CardContent>
        {candidates.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <Link2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            Nenhuma correspondência potencial encontrada.
          </div>
        ) : (
          <div className="space-y-3">
            {candidates.map((c) => (
              <CandidateCard
                key={`${c.so.id}-${c.po.id}`}
                c={c}
                formatCurrency={formatCurrency}
                onMerge={() => mergeMutation.mutate({ soId: c.so.id, poId: c.po.id })}
                onReject={() => rejectMutation.mutate({ soId: c.so.id, poId: c.po.id })}
                merging={mergeMutation.isPending}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
