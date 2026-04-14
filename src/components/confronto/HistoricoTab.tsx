import { History, CheckCircle, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/hooks/useLanguage";
import { useConfrontoHistory } from "@/hooks/useConfrontoOSOP";

export default function HistoricoTab() {
  const { formatCurrency } = useLanguage();
  const { data: history = [], isLoading } = useConfrontoHistory();

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          A carregar histórico...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Histórico ({history.length})
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Itens resolvidos. Eliminados automaticamente após 15 dias.
        </p>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nenhum registo no histórico.
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border/30 p-3 flex items-center justify-between text-xs hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      item.action === "validated"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.action === "validated" ? (
                      <><CheckCircle className="h-2.5 w-2.5 mr-0.5" /> Validado</>
                    ) : (
                      <><Trash2 className="h-2.5 w-2.5 mr-0.5" /> Limpo</>
                    )}
                  </Badge>
                  <span className="text-muted-foreground">{item.so_plate} ↔ {item.po_plate}</span>
                  <span className="text-muted-foreground">|</span>
                  <span>{item.so_client}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="tabular-nums">OS: {formatCurrency(item.totalSO)}</p>
                    <p className="tabular-nums">OP: {formatCurrency(item.totalPO)}</p>
                  </div>
                  {Math.abs(item.difference) > 0.01 && (
                    <span className={`font-bold tabular-nums ${item.difference > 0 ? "text-destructive" : "text-emerald-400"}`}>
                      {item.difference > 0 ? "-" : "+"}{formatCurrency(Math.abs(item.difference))}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(item.resolved_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
