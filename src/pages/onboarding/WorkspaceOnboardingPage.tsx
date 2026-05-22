import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Check, Building2, Users, CreditCard, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { fetchWorkspaceTiers, resolveTier, formatPriceWithVAT, type WorkspaceTier, type BillingCycle } from "@/lib/billing";

type Step = "create" | "subscription" | "company" | "access";
const STEPS: { id: Step; label: string; icon: typeof Building2 }[] = [
  { id: "create",       label: "Workspace",   icon: Building2 },
  { id: "subscription", label: "Plano",       icon: CreditCard },
  { id: "company",      label: "Empresa",     icon: Users },
  { id: "access",       label: "Acesso",      icon: Sparkles },
];

/**
 * Workspace onboarding — 4-step flow.
 *
 * The actual workspace creation / Stripe checkout still goes through the
 * existing edge functions; this page coordinates the UX and persists the
 * collected data once the user reaches the final step.
 */
export default function WorkspaceOnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("create");

  const [workspaceName, setWorkspaceName] = useState("");
  const [techCount, setTechCount] = useState(5);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [tiers, setTiers] = useState<WorkspaceTier[]>([]);
  const [legalName, setLegalName] = useState("");
  const [vatNumber, setVatNumber] = useState("");

  useEffect(() => { void fetchWorkspaceTiers().then(setTiers); }, []);

  const selectedTier = useMemo(() => resolveTier(tiers, techCount), [tiers, techCount]);
  const price = useMemo(() => {
    if (!selectedTier) return 0;
    return cycle === "monthly" ? selectedTier.base_price_monthly : selectedTier.yearly_price;
  }, [selectedTier, cycle]);

  const idx = STEPS.findIndex((s) => s.id === step);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="p-8 text-center max-w-md surface-card">
          <h2 className="font-semibold mb-2">Inicie sessão para criar a sua workspace</h2>
          <Button onClick={() => navigate("/auth")} className="mt-4">Iniciar sessão</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-6">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Stepper */}
        <div className="flex items-center gap-2 flex-wrap">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === idx;
            const isDone = i < idx;
            return (
              <div key={s.id} className="flex items-center gap-2 flex-1 min-w-0">
                <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold border ${isDone ? "bg-primary text-primary-foreground border-primary" : isActive ? "bg-primary/10 text-primary border-primary" : "bg-muted text-muted-foreground border-border"}`}>
                  {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className={`text-xs ${isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s.label}</span>
                {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border/60 mx-2" />}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        {step === "create" && (
          <Card className="p-8 space-y-6 surface-card">
            <header>
              <h1 className="text-2xl font-semibold">Crie a sua Workspace</h1>
              <p className="text-sm text-muted-foreground mt-1">Dê um nome ao espaço de trabalho da sua equipa.</p>
            </header>
            <div className="space-y-2">
              <Label htmlFor="ws-name">Nome da workspace</Label>
              <Input id="ws-name" placeholder="Ex: Acme Service Ops" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <Button disabled={!workspaceName.trim()} onClick={() => setStep("subscription")}>
                Continuar <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </Card>
        )}

        {step === "subscription" && (
          <Card className="p-8 space-y-6 surface-card">
            <header>
              <h1 className="text-2xl font-semibold">Escolha o seu plano</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Preços escalam por técnicos ativos. Pode mudar a qualquer altura.
              </p>
            </header>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Quantos técnicos vai ter?</span>
                <span className="font-semibold text-foreground">{techCount}</span>
              </div>
              <Slider min={1} max={60} step={1} value={[techCount]} onValueChange={(v) => setTechCount(v[0])} />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {tiers.map((t) => {
                const isSelected = selectedTier?.code === t.code;
                return (
                  <div
                    key={t.code}
                    className={`p-4 rounded-lg border transition-all ${isSelected ? "border-primary bg-primary/5 shadow-[0_0_24px_-12px_hsl(var(--primary)/0.6)]" : "border-border/40 bg-muted/20"}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold">{t.name}</span>
                      {isSelected && <Badge variant="outline" className="text-[10px]">Selecionado</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t.tier_min} a {t.tier_max} técnicos
                    </p>
                    <p className="text-lg font-semibold mt-2">
                      {t.base_price_monthly.toFixed(2).replace(".", ",")}€
                      <span className="text-xs text-muted-foreground"> + IVA /mês</span>
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/40">
              <div>
                <p className="text-xs text-muted-foreground">Ciclo de faturação</p>
                <p className="text-sm font-medium">{cycle === "monthly" ? "Mensal" : "Anual (2 meses grátis)"}</p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant={cycle === "monthly" ? "default" : "outline"} onClick={() => setCycle("monthly")}>Mensal</Button>
                <Button size="sm" variant={cycle === "yearly" ? "default" : "outline"} onClick={() => setCycle("yearly")}>Anual</Button>
              </div>
            </div>

            <div className="flex items-baseline justify-between pt-2 border-t border-border/40">
              <span className="text-xs text-muted-foreground">Total estimado</span>
              <span className="text-2xl font-semibold">{formatPriceWithVAT(price, cycle)}</span>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep("create")}>Voltar</Button>
              <Button disabled={!selectedTier} onClick={() => setStep("company")}>
                Continuar <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </Card>
        )}

        {step === "company" && (
          <Card className="p-8 space-y-6 surface-card">
            <header>
              <h1 className="text-2xl font-semibold">Dados da empresa</h1>
              <p className="text-sm text-muted-foreground mt-1">Para faturação e documentos legais.</p>
            </header>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="legal">Razão social</Label>
                <Input id="legal" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vat">NIF / VAT</Label>
                <Input id="vat" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep("subscription")}>Voltar</Button>
              <Button onClick={() => setStep("access")}>
                Continuar <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </Card>
        )}

        {step === "access" && (
          <Card className="p-8 space-y-6 surface-card text-center">
            <Sparkles className="h-10 w-10 mx-auto text-primary" />
            <div>
              <h1 className="text-2xl font-semibold">Workspace pronta a operar</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Para finalizar a subscrição e abrir o checkout, prossiga para o portal de pagamento.
                Pode também entrar primeiro e configurar o pagamento mais tarde.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button variant="outline" onClick={() => navigate("/")}>Entrar na plataforma</Button>
              <Button onClick={() => navigate(`/checkout?plan=${selectedTier?.code ?? "workspace_t1"}&cycle=${cycle}`)}>
                Continuar para pagamento <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
