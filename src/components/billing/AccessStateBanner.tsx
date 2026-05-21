import { AlertTriangle, Lock, ShieldAlert, Clock, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";

const REASON_LABEL: Record<string, string> = {
  trial_active: "Período de avaliação activo.",
  trial_expired: "Avaliação terminou — escolha um plano para continuar.",
  grace_period: "Pagamento em tolerância — regularize para evitar suspensão.",
  past_due: "Subscrição em atraso — leitura permitida, criação bloqueada.",
  overdue: "Subscrição em atraso prolongado — operações bloqueadas.",
  suspended_soft: "Workspace suspensa (modo suave) — exportações ainda permitidas.",
  suspended_hard: "Workspace suspensa — apenas área de faturação acessível.",
  cancelled: "Subscrição cancelada — apenas área de faturação acessível.",
  legal_hold: "Bloqueio legal activo — dados preservados, operações desactivadas.",
};

export function AccessStateBanner() {
  const a = useWorkspaceAccess();
  if (a.isLoading || a.access_mode === "full") return null;

  const Icon = a.legal_hold ? Lock : a.access_mode === "billing_only" ? ShieldAlert : a.access_mode === "readonly" ? AlertTriangle : Info;
  const tone =
    a.access_mode === "locked" || a.access_mode === "billing_only"
      ? "border-red-500/30 bg-red-500/10 text-red-500"
      : a.access_mode === "readonly"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
      : "border-border bg-muted/30 text-muted-foreground";

  const reason = a.reasons[0];
  const label = reason ? REASON_LABEL[reason] ?? reason : "Acesso restrito.";

  return (
    <Card className={`p-3 px-4 border ${tone} flex items-center justify-between gap-3`}>
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="h-4 w-4 shrink-0" />
        <div className="text-xs sm:text-sm min-w-0">
          <p className="font-medium truncate">{label}</p>
          {a.status === "trial" && typeof a.trial_days_left === "number" && a.trial_days_left > 0 ? (
            <p className="text-[11px] opacity-80 flex items-center gap-1 mt-0.5">
              <Clock className="h-3 w-3" /> {a.trial_days_left} dia{a.trial_days_left === 1 ? "" : "s"} restante{a.trial_days_left === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      </div>
      {a.can_access_billing ? (
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link to="/subscription">Gerir assinatura</Link>
        </Button>
      ) : null}
    </Card>
  );
}
