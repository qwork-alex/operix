import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowRight, Check, Building2, Users, CreditCard, Sparkles,
  Loader2, ShieldCheck, RefreshCcw, Rocket,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/api";
import { toast } from "sonner";
import { StripeEmbeddedCheckout } from "@/components/billing/StripeEmbeddedCheckout";
import {
  fetchWorkspaceTiers, resolveTier, formatPriceWithVAT, buildLookupKey,
  type WorkspaceTier, type BillingCycle,
} from "@/lib/billing";

// ──────────────────────────────────────────────────────────────────────────
// Stage definition — premium 6-step workspace onboarding.
// Landing Page → /onboarding/workspace (this) → Dashboard (/).
// ──────────────────────────────────────────────────────────────────────────
type Stage = "workspace" | "company" | "plan" | "payment" | "initializing" | "ready";

const STAGES: { id: Stage; label: string; icon: typeof Building2; hint: string }[] = [
  { id: "workspace",    label: "Workspace",     icon: Building2,   hint: "Identidade da organização" },
  { id: "company",      label: "Empresa",       icon: ShieldCheck, hint: "Dados legais e faturação" },
  { id: "plan",         label: "Plano",         icon: CreditCard,  hint: "Capacidade operacional" },
  { id: "payment",      label: "Pagamento",     icon: CreditCard,  hint: "Ativação segura via Stripe" },
  { id: "initializing", label: "Inicialização", icon: Rocket,      hint: "Provisionamento da plataforma" },
  { id: "ready",        label: "Acesso",        icon: Sparkles,    hint: "Dashboard pronta" },
];

interface Persisted {
  stage: Stage;
  workspaceName: string;
  legalName: string;
  vatNumber: string;
  billingEmail: string;
  country: string;
  techCount: number;
  cycle: BillingCycle;
  workspaceId?: string;
  planCode?: string;
}

const STORAGE_KEY = (uid: string) => `qw.onboarding.workspace.v1.${uid}`;

export default function WorkspaceOnboardingPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();

  const [stage, setStage] = useState<Stage>("workspace");
  const [workspaceName, setWorkspaceName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [country, setCountry] = useState("PT");
  const [techCount, setTechCount] = useState(5);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [tiers, setTiers] = useState<WorkspaceTier[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const hydrated = useRef(false);

  // ── Load tiers
  useEffect(() => { void fetchWorkspaceTiers().then(setTiers); }, []);

  // ── Default billing email from auth
  useEffect(() => {
    if (user?.email && !billingEmail) setBillingEmail(user.email);
  }, [user?.email, billingEmail]);

  useEffect(() => {
    try {
      const pendingWorkspaceName = localStorage.getItem("pending_workspace_name");
      if (pendingWorkspaceName && !workspaceName) {
        setWorkspaceName(pendingWorkspaceName);
      }
    } catch {
      /* ignore */
    }
  }, [workspaceName]);

  // ── Hydrate from localStorage (recovery)
  useEffect(() => {
    if (!user || hydrated.current) return;
    hydrated.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY(user.id));
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<Persisted>;
      if (saved.workspaceName) setWorkspaceName(saved.workspaceName);
      if (saved.legalName) setLegalName(saved.legalName);
      if (saved.vatNumber) setVatNumber(saved.vatNumber);
      if (saved.billingEmail) setBillingEmail(saved.billingEmail);
      if (saved.country) setCountry(saved.country);
      if (saved.techCount) setTechCount(saved.techCount);
      if (saved.cycle) setCycle(saved.cycle);
      if (saved.workspaceId) setWorkspaceId(saved.workspaceId);
      if (saved.stage && saved.stage !== "ready") {
        setStage(saved.stage);
        setRecovered(true);
      }
    } catch { /* ignore */ }
  }, [user]);

  // ── Persist on change
  useEffect(() => {
    if (!user || !hydrated.current) return;
    const payload: Persisted = {
      stage, workspaceName, legalName, vatNumber, billingEmail, country,
      techCount, cycle, workspaceId,
    };
    try { localStorage.setItem(STORAGE_KEY(user.id), JSON.stringify(payload)); } catch { /* ignore */ }
  }, [user, stage, workspaceName, legalName, vatNumber, billingEmail, country, techCount, cycle, workspaceId]);

  const selectedTier = useMemo(() => resolveTier(tiers, techCount), [tiers, techCount]);
  const price = useMemo(() => {
    if (!selectedTier) return 0;
    return cycle === "monthly" ? selectedTier.base_price_monthly : selectedTier.yearly_price;
  }, [selectedTier, cycle]);

  const stageIdx = STAGES.findIndex((s) => s.id === stage);
  const progressPct = Math.round(((stageIdx + 1) / STAGES.length) * 100);

  // ── Handle Stripe return → legacy flow kept for compatibility
  useEffect(() => {
    const sid = params.get("session_id");
    if (sid && stage === "payment") {
      setStage("initializing");
      const next = new URLSearchParams(params);
      next.delete("session_id");
      next.delete("stripe");
      setParams(next, { replace: true });
    }
  }, [params, stage, setParams]);

  useEffect(() => {
    if (stage !== "initializing") return;
    const timer = window.setTimeout(() => setStage("ready"), 1200);
    return () => window.clearTimeout(timer);
  }, [stage]);

  // ── Clear persisted state once truly done
  useEffect(() => {
    if (stage === "ready" && user) {
      try { localStorage.removeItem(STORAGE_KEY(user.id)); } catch { /* ignore */ }
      try { localStorage.removeItem("pending_workspace_name"); } catch { /* ignore */ }
    }
  }, [stage, user]);

  // ── Actions
  const goTo = (s: Stage) => setStage(s);

  async function createWorkspaceAndPersistCompany() {
    if (!user) return;
    setBusy(true);
    try {
      const data = await apiRequest<{
        workspace: {
          id: string;
          name: string;
        };
      }>("/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: workspaceName.trim(),
          legalName: legalName.trim(),
          billingEmail: billingEmail.trim(),
          vatNumber: vatNumber.trim() || null,
          country,
        }),
      });

      setWorkspaceId(data.workspace.id);
      try { localStorage.setItem("selected_workspace_id", data.workspace.id); } catch { /* ignore */ }
      toast.success("Workspace created successfully.");
      setStage("ready");
    } catch (e: any) {
      console.error("[onboarding] create workspace", e);
      toast.error(e?.message || "Could not create the workspace");
    } finally {
      setBusy(false);
    }
  }

  function resetOnboarding() {
    if (!user) return;
    try { localStorage.removeItem(STORAGE_KEY(user.id)); } catch { /* ignore */ }
    setStage("workspace");
    setWorkspaceId(undefined);
    setRecovered(false);
  }

  // ── Guards
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="p-8 text-center max-w-md surface-card">
          <h2 className="font-semibold mb-2">Inicie sessão para criar a sua workspace</h2>
          <p className="text-sm text-muted-foreground mb-4">
            O onboarding é exclusivo para administradores. Técnicos acedem por convite.
          </p>
          <Button onClick={() => navigate("/auth")} className="mt-2">Iniciar sessão</Button>
        </Card>
      </div>
    );
  }

  const lookupKey = selectedTier ? buildLookupKey(selectedTier.code, cycle) : "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <header className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Onboarding</p>
            <h1 className="text-3xl font-semibold mt-1 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Configure a sua organização
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              Sequência operacional para preparar a workspace, faturação e acesso da equipa.
              Pode pausar a qualquer momento — o progresso é guardado automaticamente.
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Progresso</div>
            <div className="text-2xl font-semibold tabular-nums">{progressPct}%</div>
          </div>
        </header>

        {/* Progress rail */}
        <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm p-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {STAGES.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === stageIdx;
              const isDone = i < stageIdx;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-all ${
                    isActive
                      ? "border-primary/60 bg-primary/5 shadow-[0_0_24px_-12px_hsl(var(--primary)/0.6)]"
                      : isDone
                        ? "border-primary/30 bg-primary/[0.03]"
                        : "border-border/40 bg-muted/10"
                  }`}
                >
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                    isDone ? "bg-primary text-primary-foreground"
                      : isActive ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-xs font-medium truncate ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                      {s.label}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{s.hint}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {recovered && stage !== "ready" && (
          <Alert className="border-primary/30 bg-primary/5">
            <RefreshCcw className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-3 w-full">
              <span className="text-sm">Retomámos o onboarding onde o tinha deixado.</span>
              <Button size="sm" variant="ghost" onClick={resetOnboarding}>Recomeçar</Button>
            </AlertDescription>
          </Alert>
        )}

        {/* ── Stage: Workspace ─────────────────────────────────────────── */}
        {stage === "workspace" && (
          <Card className="p-8 space-y-6 surface-card">
            <header>
              <h2 className="text-2xl font-semibold">Crie a sua Workspace</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Este nome aparece para a sua equipa e nos documentos internos.
              </p>
            </header>
            <div className="space-y-2 max-w-md">
              <Label htmlFor="ws-name">Nome da workspace</Label>
              <Input
                id="ws-name"
                placeholder="Ex: Acme Service Ops"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                maxLength={80}
              />
              <p className="text-[11px] text-muted-foreground">
                Mínimo 3 caracteres. Pode alterar mais tarde nas definições.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                disabled={workspaceName.trim().length < 3}
                onClick={() => goTo("company")}
              >
                Continuar <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </Card>
        )}

        {/* ── Stage: Company ───────────────────────────────────────────── */}
        {stage === "company" && (
          <Card className="p-8 space-y-6 surface-card">
            <header>
              <h2 className="text-2xl font-semibold">Informação da empresa</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Necessária para emissão de faturas e conformidade fiscal.
              </p>
            </header>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="legal">Razão social *</Label>
                <Input id="legal" value={legalName} onChange={(e) => setLegalName(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vat">NIF / VAT</Label>
                <Input id="vat" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} maxLength={32} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">País</Label>
                <Input id="country" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))} maxLength={2} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="bemail">Email de faturação *</Label>
                <Input id="bemail" type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => goTo("workspace")}>Voltar</Button>
              <Button
                disabled={legalName.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(billingEmail)}
                onClick={() => goTo("plan")}
              >
                Continuar <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </Card>
        )}

        {/* ── Stage: Plan ──────────────────────────────────────────────── */}
        {stage === "plan" && (
          <Card className="p-8 space-y-6 surface-card">
            <header>
              <h2 className="text-2xl font-semibold">Escolha o seu plano</h2>
              <p className="text-sm text-muted-foreground mt-1">
                A capacidade escala por técnicos ativos. Pode mudar a qualquer altura.
              </p>
            </header>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Quantos técnicos vai ter ativos?</span>
                <span className="font-semibold text-foreground tabular-nums">{techCount}</span>
              </div>
              <Slider min={1} max={60} step={1} value={[techCount]} onValueChange={(v) => setTechCount(v[0])} />
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {tiers.map((t) => {
                const isSelected = selectedTier?.code === t.code;
                return (
                  <button
                    key={t.code}
                    type="button"
                    onClick={() => {
                      const mid = Math.floor(((t.tier_min ?? 1) + (t.tier_max ?? (t.tier_min ?? 1))) / 2);
                      setTechCount(mid);
                    }}
                    className={`text-left p-4 rounded-lg border transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-[0_0_24px_-12px_hsl(var(--primary)/0.6)]"
                        : "border-border/40 bg-muted/10 hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold">{t.name}</span>
                      {isSelected && <Badge variant="outline" className="text-[10px]">Selecionado</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t.tier_min}–{t.tier_max} técnicos
                    </p>
                    <p className="text-lg font-semibold mt-2 tabular-nums">
                      {t.base_price_monthly.toFixed(2).replace(".", ",")}€
                      <span className="text-[11px] font-normal text-muted-foreground"> + IVA /mês</span>
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/40">
              <div>
                <p className="text-xs text-muted-foreground">Ciclo de faturação</p>
                <p className="text-sm font-medium">
                  {cycle === "monthly" ? "Mensal" : "Anual — paga 10 meses, recebe 12"}
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant={cycle === "monthly" ? "default" : "outline"} onClick={() => setCycle("monthly")}>Mensal</Button>
                <Button size="sm" variant={cycle === "yearly" ? "default" : "outline"} onClick={() => setCycle("yearly")}>Anual</Button>
              </div>
            </div>

            <div className="flex items-baseline justify-between pt-2 border-t border-border/40">
              <span className="text-xs text-muted-foreground">Total estimado</span>
              <span className="text-2xl font-semibold tabular-nums">{formatPriceWithVAT(price, cycle)}</span>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => goTo("company")}>Voltar</Button>
              <Button disabled={!selectedTier || busy} onClick={createWorkspaceAndPersistCompany}>
                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…</> : <>Create workspace <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
            </div>
          </Card>
        )}

        {/* ── Stage: Payment ───────────────────────────────────────────── */}
        {stage === "payment" && (
          <Card className="p-8 space-y-5 surface-card">
            <header className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl font-semibold">Pagamento seguro</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Processado pela Stripe. A workspace é ativada automaticamente assim que confirmamos a transação.
                </p>
              </div>
              <Badge variant="outline" className="gap-1.5"><ShieldCheck className="h-3 w-3" /> PCI-DSS</Badge>
            </header>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/40 text-sm">
              <div>
                <span className="text-muted-foreground">Plano: </span>
                <span className="font-medium">{selectedTier?.name}</span>
                <span className="text-muted-foreground"> · {cycle === "monthly" ? "Mensal" : "Anual"}</span>
              </div>
              <span className="font-semibold tabular-nums">{formatPriceWithVAT(price, cycle)}</span>
            </div>

            {workspaceId && lookupKey ? (
              <StripeEmbeddedCheckout
                lookupKey={lookupKey}
                workspaceId={workspaceId}
                customerEmail={billingEmail}
                legalName={legalName}
                returnUrl={`${window.location.origin}/onboarding/workspace?session_id={CHECKOUT_SESSION_ID}`}
              />
            ) : (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> A preparar checkout…
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => goTo("plan")}>Voltar</Button>
              <Button variant="outline" onClick={() => setStage("initializing")}>
                Já paguei — verificar
              </Button>
            </div>
          </Card>
        )}

        {/* ── Stage: Initialization ────────────────────────────────────── */}
        {stage === "initializing" && (
          <Card className="p-10 space-y-6 surface-card text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold">A inicializar a plataforma</h2>
              <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                A provisionar a subscrição, módulos operacionais e permissões.
                Este passo é normalmente concluído em menos de 30 segundos.
              </p>
            </div>
            <ul className="text-sm text-left max-w-sm mx-auto space-y-2">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Workspace criada</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Dados fiscais registados</li>
              <li className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-primary" /> A ativar subscrição</li>
              <li className="flex items-center gap-2 text-muted-foreground"><span className="h-4 w-4 inline-block" /> Permissões de proprietário</li>
            </ul>
          </Card>
        )}

        {/* ── Stage: Ready ─────────────────────────────────────────────── */}
        {stage === "ready" && (
          <Card className="p-10 space-y-6 surface-card text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Workspace pronta a operar</h2>
              <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                Foi atribuído como <strong>administrador da organização</strong>,
                <strong> proprietário de faturação</strong> e <strong>responsável operacional</strong>.
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 max-w-2xl mx-auto text-left">
              <div className="p-3 rounded-lg border border-border/40 bg-muted/10">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Building2 className="h-3.5 w-3.5" /> Admin</div>
                <p className="text-sm mt-1">Configure módulos e equipa</p>
              </div>
              <div className="p-3 rounded-lg border border-border/40 bg-muted/10">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><CreditCard className="h-3.5 w-3.5" /> Faturação</div>
                <p className="text-sm mt-1">Gestão de plano e faturas</p>
              </div>
              <div className="p-3 rounded-lg border border-border/40 bg-muted/10">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" /> Operações</div>
                <p className="text-sm mt-1">Convide técnicos e clientes</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button variant="outline" onClick={() => navigate("/subscription")}>Ver faturação</Button>
              <Button onClick={() => navigate("/")}>
                Entrar na plataforma <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </Card>
        )}

        <footer className="text-center text-[11px] text-muted-foreground pt-4">
          Os técnicos não usam este fluxo — são adicionados por convite a partir da workspace.
        </footer>
      </div>
    </div>
  );
}
