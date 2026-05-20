import { useState } from "react";
import { Loader2, Sparkles, AlertTriangle, Info, ShieldAlert, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Insight = {
  level: "info" | "warning" | "critical";
  category: string;
  title: string;
  detail: string;
};

type Result = {
  kpis: {
    totalIncome: number;
    totalExpense: number;
    margin: number;
    records: number;
    fuelEntries: number;
    missingReceipts: number;
    duplicates: number;
  };
  insights: Insight[];
  narrative: string;
  generatedAt: string;
};

const LEVEL_STYLES: Record<Insight["level"], { icon: any; color: string; bg: string }> = {
  info:     { icon: Info,         color: "text-sky-400",    bg: "bg-sky-500/10 border-sky-500/30" },
  warning:  { icon: AlertTriangle,color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/30" },
  critical: { icon: ShieldAlert,  color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30" },
};

interface Props {
  open: boolean;
  onClose: () => void;
  year: number;
}

export function FinancialAIAssistant({ open, onClose, year }: Props) {
  const { workspaceId } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    if (!workspaceId) return toast.error("Workspace indisponível");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("financial-ai-insights", {
        body: { workspaceId, year },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as Result);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Falha na análise");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            Assistente financeiro — {year}
          </DialogTitle>
        </DialogHeader>

        {!result && !loading && (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Analisa duplicados, anomalias, combustível, retiradas e margem operacional.<br />
              <span className="text-xs">Apenas sugestões — nenhum dado é alterado.</span>
            </p>
            <Button onClick={run}>
              <Sparkles size={14} className="mr-2" /> Analisar agora
            </Button>
          </div>
        )}

        {loading && (
          <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="animate-spin" size={18} />
            <span className="text-sm">A processar…</span>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <Kpi label="Receitas" value={`€${result.kpis.totalIncome.toFixed(2)}`} tone="positive" />
              <Kpi label="Despesas" value={`€${result.kpis.totalExpense.toFixed(2)}`} tone="negative" />
              <Kpi
                label="Margem"
                value={`€${result.kpis.margin.toFixed(2)}`}
                tone={result.kpis.margin >= 0 ? "positive" : "negative"}
              />
              <Kpi label="Lançamentos" value={String(result.kpis.records)} />
              <Kpi label="Combustível" value={String(result.kpis.fuelEntries)} />
              <Kpi label="Duplicados" value={String(result.kpis.duplicates)} tone={result.kpis.duplicates ? "negative" : "neutral"} />
            </div>

            {/* Narrative */}
            {result.narrative && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground whitespace-pre-line">
                {result.narrative}
              </div>
            )}

            {/* Insights */}
            <div className="space-y-2">
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                Alertas ({result.insights.length})
              </h3>
              {result.insights.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhuma anomalia detetada ✓
                </p>
              ) : (
                result.insights.map((ins, i) => {
                  const style = LEVEL_STYLES[ins.level];
                  const Icon = style.icon;
                  return (
                    <div
                      key={i}
                      className={cn("flex gap-2 rounded-md border p-2.5", style.bg)}
                    >
                      <Icon size={16} className={cn("shrink-0 mt-0.5", style.color)} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{ins.title}</p>
                        <p className="text-xs text-muted-foreground">{ins.detail}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-border/40">
              <span className="text-[10px] text-muted-foreground">
                Gerado {new Date(result.generatedAt).toLocaleString("pt-PT")}
              </span>
              <Button variant="ghost" size="sm" onClick={run}>
                <Sparkles size={12} className="mr-1.5" /> Reanalisar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Kpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const color =
    tone === "positive" ? "text-emerald-400" : tone === "negative" ? "text-red-400" : "text-foreground";
  return (
    <div className="rounded-md border border-border/40 bg-card/40 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-semibold", color)}>{value}</p>
    </div>
  );
}
