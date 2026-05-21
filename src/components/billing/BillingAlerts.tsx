import { AlertTriangle, Clock, CreditCard, TrendingUp, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SubscriptionSnapshot } from "@/hooks/useSubscription";
import { StripePortalButton } from "./StripePortalButton";

interface Props {
  snapshot: SubscriptionSnapshot;
}

type AlertSeverity = "info" | "warning" | "danger";

interface AlertItem {
  id: string;
  severity: AlertSeverity;
  icon: typeof AlertTriangle;
  title: string;
  description: string;
  cta?: React.ReactNode;
}

const TONES: Record<AlertSeverity, string> = {
  info: "border-sky-500/30 bg-sky-500/5 text-sky-200",
  warning: "border-amber-500/40 bg-amber-500/5 text-amber-200",
  danger: "border-red-500/40 bg-red-500/10 text-red-200 animate-pulse",
};

const ICON_TONES: Record<AlertSeverity, string> = {
  info: "text-sky-400 bg-sky-500/15",
  warning: "text-amber-400 bg-amber-500/15",
  danger: "text-red-400 bg-red-500/20",
};

export function BillingAlerts({ snapshot }: Props) {
  if (!snapshot.subscription || !snapshot.plan) return null;

  const { subscription, trial, usage } = snapshot;
  const alerts: AlertItem[] = [];

  // Trial a terminar
  if (trial?.is_trial && trial.days_left <= 5) {
    alerts.push({
      id: "trial-ending",
      severity: trial.days_left <= 2 ? "danger" : "warning",
      icon: Clock,
      title: trial.days_left <= 0 ? "Avaliação terminou" : `Avaliação termina em ${trial.days_left} dia${trial.days_left === 1 ? "" : "s"}`,
      description: `Ative agora para manter o acesso após ${new Date(trial.ends_at).toLocaleDateString("pt-PT")}.`,
      cta: (
        <Button asChild size="sm">
          <Link to={`/checkout?plan=${snapshot.plan.code}&cycle=${subscription.billing_cycle}`}>
            Ativar plano
          </Link>
        </Button>
      ),
    });
  }

  // Cobrança falhou / overdue / grace
  if (subscription.status === "overdue" || subscription.status === "grace_period") {
    alerts.push({
      id: "payment-failed",
      severity: "danger",
      icon: AlertTriangle,
      title: subscription.status === "grace_period" ? "Período de tolerância ativo" : "Pagamento em atraso",
      description: "Atualize o método de pagamento para evitar a suspensão.",
      cta: <StripePortalButton label="Atualizar pagamento" />,
    });
  }
  if (subscription.status === "suspended") {
    alerts.push({
      id: "suspended",
      severity: "danger",
      icon: X,
      title: "Subscrição suspensa",
      description: "Regularize o pagamento para reativar o acesso completo.",
      cta: <StripePortalButton label="Regularizar" />,
    });
  }

  // Cartão a expirar (via metadata Stripe se existir)
  const cardExpiry: string | undefined = (subscription as any)?.metadata?.card_expiry ?? undefined;
  if (cardExpiry) {
    const [m, y] = cardExpiry.split("/").map((s) => parseInt(s, 10));
    if (m && y) {
      const exp = new Date(2000 + y, m - 1, 1);
      const diffDays = Math.round((exp.getTime() - Date.now()) / 86400000);
      if (diffDays > 0 && diffDays <= 60) {
        alerts.push({
          id: "card-expiring",
          severity: "warning",
          icon: CreditCard,
          title: "Cartão a expirar",
          description: `O seu cartão expira em ${cardExpiry}. Atualize para evitar falhas.`,
          cta: <StripePortalButton label="Atualizar cartão" />,
        });
      }
    }
  }

  // Upgrade sugerido — técnicos próximo do escalão
  if (usage && usage.next_tier_at > 0) {
    const ratio = usage.technician_count / usage.next_tier_at;
    if (ratio >= 0.8 && subscription.status === "active") {
      alerts.push({
        id: "upgrade-suggested",
        severity: "info",
        icon: TrendingUp,
        title: "Próximo do próximo escalão",
        description: `${usage.technician_count} de ${usage.next_tier_at} técnicos. Considere planear o upgrade.`,
        cta: (
          <Button asChild variant="outline" size="sm">
            <Link to={`/checkout?plan=${snapshot.plan.code}&cycle=yearly`}>Ver planos</Link>
          </Button>
        ),
      });
    }
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((a) => {
        const Icon = a.icon;
        return (
          <Card key={a.id} className={`p-3 border ${TONES[a.severity]} surface-card`}>
            <div className="flex items-center gap-3 flex-wrap">
              <div className={`h-9 w-9 rounded-full grid place-items-center shrink-0 ${ICON_TONES[a.severity]}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-semibold">{a.title}</p>
                <p className="text-xs opacity-80">{a.description}</p>
              </div>
              {a.cta && <div className="ml-auto">{a.cta}</div>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
