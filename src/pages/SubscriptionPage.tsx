import { useMemo, useState } from "react";
import { CreditCard, Users, TrendingUp, Calendar, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingState } from "@/components/shared/LoadingState";
import { useSubscription, useIsPlatformOwner, type SubscriptionStatus } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Link } from "react-router-dom";
import { SubscriptionTimeline } from "@/components/billing/SubscriptionTimeline";
import { BillingIntelligencePanel } from "@/components/billing/BillingIntelligencePanel";
import { StripePortalButton } from "@/components/billing/StripePortalButton";

const STATUS_META: Record<SubscriptionStatus, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  trial:        { label: "Em avaliação", tone: "bg-amber-500/10 text-amber-500 border-amber-500/30",  icon: Clock },
  active:       { label: "Ativa",         tone: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30", icon: CheckCircle2 },
  grace_period: { label: "Período de tolerância", tone: "bg-amber-500/10 text-amber-500 border-amber-500/30", icon: AlertCircle },
  overdue:      { label: "Em atraso",     tone: "bg-orange-500/10 text-orange-500 border-orange-500/30", icon: AlertCircle },
  suspended:    { label: "Suspensa",      tone: "bg-red-500/10 text-red-500 border-red-500/30",        icon: AlertCircle },
  cancelled:    { label: "Cancelada",     tone: "bg-muted text-muted-foreground border-border",        icon: AlertCircle },
};

function priceFor(techCount: number, cycle: "monthly" | "yearly", plan: { base_price_monthly: number; base_tech_included: number; extra_block_size: number; extra_block_price: number; yearly_discount_months: number; }) {
  const extra = Math.max(0, techCount - plan.base_tech_included);
  const blocks = Math.ceil(extra / plan.extra_block_size);
  const monthly = plan.base_price_monthly + blocks * plan.extra_block_price;
  return cycle === "yearly" ? Math.round(monthly * (12 - plan.yearly_discount_months) * 100) / 100 : monthly;
}

export default function SubscriptionPage() {
  const { workspaceName, isAdmin } = useWorkspace();
  const { data: snapshot, isLoading } = useSubscription();
  const { data: isPlatformOwner } = useIsPlatformOwner();
  const [simTechs, setSimTechs] = useState<number | null>(null);
  const [simCycle, setSimCycle] = useState<"monthly" | "yearly">("monthly");

  const techCount = snapshot?.usage?.technician_count ?? 0;
  const sim = simTechs ?? techCount;

  const simulatedPrice = useMemo(() => {
    if (!snapshot?.plan) return 0;
    return priceFor(sim, simCycle, snapshot.plan);
  }, [sim, simCycle, snapshot?.plan]);

  if (isLoading) {
    return (
      <div className="module-shell">
        <PageHeader icon={CreditCard} title="Assinatura" subtitle="A carregar plano…" />
        <LoadingState variant="cards" />
      </div>
    );
  }

  if (!isAdmin && !isPlatformOwner) {
    return (
      <div className="module-shell">
        <PageHeader icon={CreditCard} title="Assinatura" />
        <Card className="p-8 text-center text-sm text-muted-foreground surface-card">
          Apenas administradores da workspace podem ver a assinatura.
        </Card>
      </div>
    );
  }

  if (!snapshot?.exists || !snapshot.plan || !snapshot.subscription) {
    return (
      <div className="module-shell">
        <PageHeader icon={CreditCard} title="Assinatura" />
        <Card className="p-8 text-center text-sm text-muted-foreground surface-card">
          Nenhuma assinatura encontrada para esta workspace.
        </Card>
      </div>
    );
  }

  const { subscription, plan, trial, pricing, usage } = snapshot;
  const meta = STATUS_META[subscription.status];
  const StatusIcon = meta.icon;
  const usagePct = Math.min(100, Math.round((techCount / usage!.next_tier_at) * 100));

  return (
    <div className="module-shell space-y-6">
      <PageHeader
        icon={CreditCard}
        title="Assinatura"
        subtitle={workspaceName ?? undefined}
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button asChild size="sm">
              <Link to={`/checkout?plan=${plan.code}&cycle=${subscription.billing_cycle}`}>Checkout</Link>
            </Button>
            <StripePortalButton />
            {isPlatformOwner ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/platform">Painel Plataforma</Link>
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Status banner */}
      <Card className={`p-4 border ${meta.tone} surface-card`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <StatusIcon className="h-5 w-5" />
            <div>
              <p className="text-sm font-semibold">{meta.label}</p>
              {trial?.is_trial && (
                <p className="text-xs opacity-80">
                  {trial.days_left} dia{trial.days_left === 1 ? "" : "s"} restantes — termina a{" "}
                  {new Date(trial.ends_at).toLocaleDateString("pt-PT")}
                </p>
              )}
            </div>
          </div>
          <Badge variant="outline" className="text-xs">{plan.name}</Badge>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 surface-card">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <CreditCard className="h-3.5 w-3.5" /> Preço atual
          </div>
          <p className="text-2xl font-semibold">
            {pricing!.current_monthly.toFixed(2)} €<span className="text-xs text-muted-foreground"> /mês</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Anual: {pricing!.current_yearly.toFixed(2)} € ({plan.yearly_discount_months} meses grátis)
          </p>
        </Card>

        <Card className="p-4 surface-card">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Users className="h-3.5 w-3.5" /> Técnicos
          </div>
          <p className="text-2xl font-semibold">{techCount}<span className="text-xs text-muted-foreground"> / {usage!.next_tier_at}</span></p>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
            <div className="h-full bg-primary transition-all" style={{ width: `${usagePct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Clientes e parceiros sempre gratuitos.</p>
        </Card>

        <Card className="p-4 surface-card">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <TrendingUp className="h-3.5 w-3.5" /> Próximo escalão
          </div>
          <p className="text-2xl font-semibold">{pricing!.next_tier_price.toFixed(2)} €</p>
          <p className="text-xs text-muted-foreground mt-1">
            Aos {usage!.next_tier_at} técnicos
          </p>
        </Card>
      </div>

      {/* Renewal */}
      <Card className="p-4 surface-card">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Calendar className="h-3.5 w-3.5" /> Renovação
        </div>
        <p className="text-sm">
          {subscription.current_period_end
            ? `Próxima renovação a ${new Date(subscription.current_period_end).toLocaleDateString("pt-PT")}`
            : trial?.is_trial
              ? `Avaliação termina a ${new Date(trial.ends_at).toLocaleDateString("pt-PT")}`
              : "Sem data de renovação definida"}
        </p>
      </Card>

      {/* Simulator */}
      <Card className="p-5 surface-card">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-semibold">Simulador de upgrade</h3>
            <p className="text-xs text-muted-foreground">Estime o custo com mais técnicos.</p>
          </div>
          <Tabs value={simCycle} onValueChange={(v) => setSimCycle(v as "monthly" | "yearly")}>
            <TabsList className="h-8">
              <TabsTrigger value="monthly" className="text-xs">Mensal</TabsTrigger>
              <TabsTrigger value="yearly" className="text-xs">Anual</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Técnicos</span>
            <span className="font-semibold text-foreground">{sim}</span>
          </div>
          <Slider
            min={1}
            max={200}
            step={1}
            value={[sim]}
            onValueChange={(v) => setSimTechs(v[0])}
          />
          <div className="flex items-baseline justify-between pt-3 border-t border-border/40">
            <span className="text-xs text-muted-foreground">Custo simulado</span>
            <span className="text-2xl font-semibold">
              {simulatedPrice.toFixed(2)} €
              <span className="text-xs text-muted-foreground"> /{simCycle === "monthly" ? "mês" : "ano"}</span>
            </span>
          </div>
        </div>
      </Card>

      <BillingIntelligencePanel />
      <SubscriptionTimeline />

      <Card className="p-4 surface-card text-xs text-muted-foreground">
        Gateway de pagamento ainda não está activo — esta página gere a arquitectura de subscrição e checkout interno.
      </Card>
    </div>
  );
}
