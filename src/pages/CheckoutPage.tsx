import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, CreditCard, FileCheck, Landmark, Receipt, ShieldCheck, Sparkles, Check, User, Briefcase } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/shared/PageHeader";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import {
  useBillingProfile,
  useSaveBillingProfile,
  useAddPaymentMethod,
  useDeclareManualTransfer,
} from "@/hooks/useBilling";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const STEP_LABELS: Record<Step, string> = {
  1: "Plano",
  2: "Ciclo",
  3: "IVA",
  4: "Identidade",
  5: "Pagamento",
  6: "Fatura",
  7: "Confirmação",
  8: "Ativação",
};

// Pricing model: 35€ base / 20 techs included, +10€ per extra block of 20.
const BASE_PRICE = 35;
const BASE_INCLUDED = 20;
const EXTRA_BLOCK_PRICE = 10;
const EXTRA_BLOCK_SIZE = 20;

function computePrice(techs: number, cycle: "monthly" | "yearly") {
  const extra = Math.max(0, techs - BASE_INCLUDED);
  const blocks = Math.ceil(extra / EXTRA_BLOCK_SIZE);
  const monthly = BASE_PRICE + blocks * EXTRA_BLOCK_PRICE;
  return cycle === "yearly" ? monthly * 10 : monthly; // 2 months free
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const { workspaceId, workspaceName, isAdmin } = useWorkspace();
  const { data: snap } = useSubscription();
  const { data: profile } = useBillingProfile();
  const saveProfile = useSaveBillingProfile();
  const addPM = useAddPaymentMethod();
  const declareManual = useDeclareManualTransfer();

  const [step, setStep] = useState<Step>(1);
  const [plan, setPlan] = useState<string>(params.get("plan") || snap?.plan?.code || "starter");
  const [cycle, setCycle] = useState<"monthly" | "yearly">(
    (params.get("cycle") as "monthly" | "yearly") || snap?.subscription?.billing_cycle || "monthly"
  );

  // Critical: VAT mode drives bank routing + invoice format
  const [vatMode, setVatMode] = useState<"personal" | "business">("business");

  const [form, setForm] = useState({
    legal_name: "",
    company_name: "",
    billing_email: "",
    billing_address: "",
    city: "",
    postal_code: "",
    country: "PT",
    vat_number: "",
    is_business: true,
    preferred_currency: "EUR",
  });

  const [payKind, setPayKind] = useState<"card" | "sepa" | "manual_transfer" | "stripe">("manual_transfer");
  const [pmDetails, setPmDetails] = useState({ holder_name: "", last4: "", iban_masked: "", brand: "Visa" });

  const [vatInfo, setVatInfo] = useState<{ rate: number; reverse: boolean; exemption: string | null } | null>(null);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<any>(null);

  // Guard against double-submission across the whole activation chain
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    if (profile) setForm((f) => ({ ...f, ...profile } as any));
  }, [profile]);

  // Load bank accounts and route by VAT mode
  useEffect(() => {
    supabase.from("platform_bank_accounts").select("*").eq("active", true).then(({ data }) => {
      setBankAccounts(data ?? []);
    });
  }, []);

  const routedBanks = useMemo(() => {
    const filtered = bankAccounts.filter((b) =>
      vatMode === "business" ? b.account_type !== "personal" : b.account_type === "personal"
    );
    return filtered.length > 0 ? filtered : bankAccounts;
  }, [bankAccounts, vatMode]);

  useEffect(() => {
    if (routedBanks.length > 0) {
      setSelectedBankId(routedBanks.find((b) => b.is_primary)?.id ?? routedBanks[0].id);
    } else {
      setSelectedBankId(null);
    }
  }, [routedBanks]);

  // Sync VAT mode → form.is_business
  useEffect(() => {
    setForm((f) => ({ ...f, is_business: vatMode === "business" }));
  }, [vatMode]);

  const techCount = snap?.usage?.technician_count ?? BASE_INCLUDED;
  const subtotal = useMemo(() => {
    const monthly = computePrice(techCount, "monthly");
    return cycle === "yearly" ? monthly * 10 : monthly;
  }, [techCount, cycle]);

  const vatAmount = vatInfo && vatMode === "business" ? Math.round(subtotal * vatInfo.rate * 100) / 100 : 0;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;

  async function calcVat() {
    const { data, error } = await supabase.rpc("calculate_vat", {
      _country: form.country,
      _is_business: vatMode === "business",
      _vat_number: form.vat_number || null,
    });
    if (error) {
      toast.error("Erro ao calcular IVA");
      return;
    }
    const v = (data ?? {}) as any;
    setVatInfo({
      rate: Number(v.rate ?? 0),
      reverse: !!v.reverse_charge,
      exemption: v.exemption ?? null,
    });
  }

  async function generateInvoice() {
    const { data, error } = await supabase.rpc("generate_platform_invoice", {
      _workspace_id: workspaceId!,
      _plan_code: plan,
      _cycle: cycle,
      _vat_mode: vatMode,
      _bank_account_id: selectedBankId,
      _amount: computePrice(techCount, "monthly"),
    });
    if (error) {
      toast.error(error.message || "Falha ao gerar fatura");
      return null;
    }
    setInvoice(data);
    return data;
  }

  async function activate() {
    if (activating || activated) return;
    setActivating(true);
    try {
      const { error } = await supabase.rpc("activate_workspace_subscription", {
        _workspace_id: workspaceId!,
        _plan_code: plan,
        _cycle: cycle,
      });
      if (error) throw error;
      setActivated(true);
      qc.invalidateQueries({ queryKey: ["workspace-subscription"] });
      qc.invalidateQueries({ queryKey: ["subscription-events"] });
      qc.invalidateQueries({ queryKey: ["workspace-access"] });
    } catch (e: any) {
      toast.error(e.message || "Falha ao ativar");
      throw e;
    } finally {
      setActivating(false);
    }
  }

  async function handleNext() {
    try {
      if (step === 3) {
        await calcVat();
        setStep(4);
        return;
      }
      if (step === 4) {
        if (!form.legal_name || !form.billing_email) {
          toast.error("Preenche nome legal e email de faturação");
          return;
        }
        if (vatMode === "business" && !form.vat_number) {
          toast.error("Número de IVA é obrigatório para faturação empresarial");
          return;
        }
        await saveProfile.mutateAsync(form);
        setStep(5);
        return;
      }
      if (step === 5) {
        if (payKind === "stripe") {
          toast.info("Stripe brevemente disponível");
          return;
        }
        if (payKind !== "manual_transfer") {
          await addPM.mutateAsync({
            kind: payKind,
            brand: payKind === "card" ? pmDetails.brand : null,
            last4: payKind === "card" ? pmDetails.last4 : null,
            iban_masked: payKind === "sepa" ? pmDetails.iban_masked : null,
            holder_name: pmDetails.holder_name,
            is_default: true,
          });
        }
        const inv = await generateInvoice();
        if (!inv) return;
        setStep(6);
        return;
      }
      if (step === 6) {
        if (payKind === "manual_transfer") {
          await declareManual.mutateAsync({
            amount: total,
            invoice_id: invoice?.invoice_id,
            bank_account_id: selectedBankId ?? undefined,
          });
        }
        setStep(7);
        return;
      }
      if (step === 7) {
        await activate();
        setStep(8);
        return;
      }
      if (step === 8) {
        navigate("/subscription");
        return;
      }
      setStep((s) => (Math.min(8, s + 1) as Step));
    } catch {
      // toasts already shown
    }
  }

  if (!isAdmin) {
    return (
      <div className="module-shell">
        <PageHeader icon={CreditCard} title="Checkout" />
        <Card className="p-8 text-center text-sm text-muted-foreground surface-card">
          Apenas administradores podem efetuar checkout.
        </Card>
      </div>
    );
  }

  const selectedBank = routedBanks.find((b) => b.id === selectedBankId);

  return (
    <div className="module-shell space-y-6">
      <PageHeader icon={CreditCard} title="Checkout" subtitle={workspaceName ?? undefined} />

      {/* Stepper */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STEP_LABELS) as unknown as Step[]).map((s) => {
          const n = Number(s) as Step;
          const active = n === step;
          const done = n < step;
          return (
            <div
              key={n}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition",
                active && "border-[hsl(var(--accent))]/40 bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]",
                done && "border-success/30 bg-success/10 text-success",
                !active && !done && "border-border text-muted-foreground"
              )}
            >
              <span className="font-semibold">{n}</span>
              <span>{STEP_LABELS[n]}</span>
              {done && <Check className="h-3 w-3" />}
            </div>
          );
        })}
      </div>

      <Card className="p-6 surface-card space-y-6">
        {step === 1 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-[hsl(var(--accent))]" /> Plano</h2>
            <RadioGroup value={plan} onValueChange={setPlan} className="grid gap-3 md:grid-cols-2">
              {[
                { code: "starter", name: "Starter", desc: "20 técnicos incluídos · 35€/mês" },
                { code: "pro", name: "Pro", desc: "40 técnicos · 45€/mês" },
                { code: "scale", name: "Scale", desc: "60+ técnicos · escalável" },
                { code: "enterprise", name: "Enterprise", desc: "Multi-workspace + SLA" },
              ].map((p) => (
                <label key={p.code} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-4 hover:border-[hsl(var(--accent))]/40", plan === p.code && "border-[hsl(var(--accent))]/60 bg-[hsl(var(--accent))]/5")}>
                  <RadioGroupItem value={p.code} />
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.desc}</div>
                  </div>
                </label>
              ))}
            </RadioGroup>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Base: {BASE_PRICE}€/mês inclui {BASE_INCLUDED} técnicos. Cada bloco adicional de {EXTRA_BLOCK_SIZE} técnicos = +{EXTRA_BLOCK_PRICE}€/mês.
              Técnicos em múltiplas workspaces: 1ª = 20€, cada adicional +10€.
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Receipt className="h-4 w-4 text-[hsl(var(--warning))]" /> Ciclo de faturação</h2>
            <RadioGroup value={cycle} onValueChange={(v) => setCycle(v as any)} className="grid gap-3 md:grid-cols-2">
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:border-[hsl(var(--accent))]/40", cycle === "monthly" && "border-[hsl(var(--accent))]/60 bg-[hsl(var(--accent))]/5")}>
                <RadioGroupItem value="monthly" />
                <div>
                  <div className="font-medium">Mensal</div>
                  <div className="text-xs text-muted-foreground">{computePrice(techCount, "monthly").toFixed(2)} €/mês · cobrado mensalmente</div>
                </div>
              </label>
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:border-[hsl(var(--accent))]/40", cycle === "yearly" && "border-[hsl(var(--accent))]/60 bg-[hsl(var(--accent))]/5")}>
                <RadioGroupItem value="yearly" />
                <div>
                  <div className="font-medium flex items-center gap-2">Anual <Badge variant="outline" className="text-[10px]">2 meses grátis</Badge></div>
                  <div className="text-xs text-muted-foreground">{computePrice(techCount, "yearly").toFixed(2)} €/ano</div>
                </div>
              </label>
            </RadioGroup>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[hsl(var(--accent))]" /> Modo de IVA</h2>
            <RadioGroup value={vatMode} onValueChange={(v) => setVatMode(v as any)} className="grid gap-3 md:grid-cols-2">
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:border-[hsl(var(--accent))]/40", vatMode === "personal" && "border-[hsl(var(--accent))]/60 bg-[hsl(var(--accent))]/5")}>
                <RadioGroupItem value="personal" />
                <div className="space-y-1">
                  <div className="font-medium flex items-center gap-2"><User className="h-3.5 w-3.5" /> Fatura pessoal (sem IVA)</div>
                  <div className="text-xs text-muted-foreground">Transferência via conta pessoal Wise. Sem campos de IVA.</div>
                </div>
              </label>
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:border-[hsl(var(--accent))]/40", vatMode === "business" && "border-[hsl(var(--accent))]/60 bg-[hsl(var(--accent))]/5")}>
                <RadioGroupItem value="business" />
                <div className="space-y-1">
                  <div className="font-medium flex items-center gap-2"><Briefcase className="h-3.5 w-3.5" /> Fatura empresarial (com IVA)</div>
                  <div className="text-xs text-muted-foreground">Conta bancária da empresa. Nº IVA obrigatório.</div>
                </div>
              </label>
            </RadioGroup>
          </section>
        )}

        {step === 4 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-[hsl(var(--accent))]" /> Identidade de faturação</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome legal *" value={form.legal_name} onChange={(v) => setForm({ ...form, legal_name: v })} />
              {vatMode === "business" && (
                <Field label="Nome comercial" value={form.company_name} onChange={(v) => setForm({ ...form, company_name: v })} />
              )}
              <Field label="Email de faturação *" value={form.billing_email} onChange={(v) => setForm({ ...form, billing_email: v })} />
              <Field label="País (ISO)" value={form.country} onChange={(v) => setForm({ ...form, country: v.toUpperCase().slice(0, 2) })} />
              <Field label="Morada" value={form.billing_address} onChange={(v) => setForm({ ...form, billing_address: v })} />
              <Field label="Cidade" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
              <Field label="Código postal" value={form.postal_code} onChange={(v) => setForm({ ...form, postal_code: v })} />
              {vatMode === "business" && (
                <Field label="Número de IVA *" value={form.vat_number} onChange={(v) => setForm({ ...form, vat_number: v.toUpperCase() })} />
              )}
            </div>
            {vatInfo && vatMode === "business" && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                Taxa IVA: <strong>{(vatInfo.rate * 100).toFixed(0)}%</strong>
                {vatInfo.reverse && <span className="ml-2 text-[hsl(var(--warning))]">· Reverse charge</span>}
                {vatInfo.exemption && <span className="ml-2 text-muted-foreground">· {vatInfo.exemption}</span>}
              </div>
            )}
          </section>
        )}

        {step === 5 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4 text-[hsl(var(--accent))]" /> Pagamento</h2>
            <RadioGroup value={payKind} onValueChange={(v) => setPayKind(v as any)} className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <MethodCard active={payKind === "card"} icon={CreditCard} label="Cartão (mock)" value="card" />
              <MethodCard active={payKind === "sepa"} icon={Landmark} label="SEPA Débito" value="sepa" />
              <MethodCard active={payKind === "manual_transfer"} icon={Receipt} label="Transferência" value="manual_transfer" />
              <MethodCard active={payKind === "stripe"} icon={Sparkles} label="Stripe (em breve)" value="stripe" disabled />
            </RadioGroup>

            {payKind === "card" && (
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Titular" value={pmDetails.holder_name} onChange={(v) => setPmDetails({ ...pmDetails, holder_name: v })} />
                <Field label="Bandeira" value={pmDetails.brand} onChange={(v) => setPmDetails({ ...pmDetails, brand: v })} />
                <Field label="Últimos 4" value={pmDetails.last4} onChange={(v) => setPmDetails({ ...pmDetails, last4: v.replace(/\D/g, "").slice(0, 4) })} />
              </div>
            )}
            {payKind === "sepa" && (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Titular" value={pmDetails.holder_name} onChange={(v) => setPmDetails({ ...pmDetails, holder_name: v })} />
                <Field label="IBAN (mascarado)" value={pmDetails.iban_masked} onChange={(v) => setPmDetails({ ...pmDetails, iban_masked: v })} />
              </div>
            )}
            {payKind === "manual_transfer" && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm space-y-3">
                <div className="font-medium flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-[hsl(var(--warning))]" />
                  Conta de destino · {vatMode === "personal" ? "Wise pessoal" : "Empresa"}
                </div>
                {routedBanks.length === 0 && <div className="text-muted-foreground">Sem contas configuradas.</div>}
                <RadioGroup value={selectedBankId ?? ""} onValueChange={setSelectedBankId} className="space-y-2">
                  {routedBanks.map((b) => (
                    <label key={b.id} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3", selectedBankId === b.id && "border-[hsl(var(--warning))]/50 bg-[hsl(var(--warning))]/5")}>
                      <RadioGroupItem value={b.id} className="mt-1" />
                      <div className="flex-1 text-xs space-y-0.5">
                        <div className="font-medium text-sm">{b.bank_name} <span className="text-muted-foreground font-normal">· {b.account_name}</span></div>
                        {b.iban && <div>IBAN: <span className="font-mono">{b.iban}</span></div>}
                        {b.bic && <div>BIC: <span className="font-mono">{b.bic}</span></div>}
                        <div className="text-muted-foreground">{b.country} · {b.currency} · {b.account_type}</div>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              </div>
            )}
          </section>
        )}

        {step === 6 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><FileCheck className="h-4 w-4 text-[hsl(var(--accent))]" /> Pré-visualização da fatura</h2>
            <div className="rounded-xl border border-border bg-card/60 p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">Fatura</div>
                  <div className="text-lg font-semibold font-mono">{invoice?.invoice_number ?? "—"}</div>
                </div>
                <Badge variant="outline" className={vatMode === "business" ? "border-[hsl(var(--accent))]/40 text-[hsl(var(--accent))]" : "border-[hsl(var(--warning))]/40 text-[hsl(var(--warning))]"}>
                  {vatMode === "business" ? "Empresarial (IVA)" : "Pessoal (sem IVA)"}
                </Badge>
              </div>
              <Separator />
              <div className="grid gap-2 text-sm">
                <Row label="Cliente" value={form.legal_name} />
                <Row label="Email" value={form.billing_email} />
                {vatMode === "business" && <Row label="IVA" value={form.vat_number || "—"} />}
                <Row label="País" value={form.country} />
              </div>
              <Separator />
              <div className="grid gap-2 text-sm">
                <Row label={`Plano ${plan} · ${cycle === "yearly" ? "Anual" : "Mensal"}`} value={`${subtotal.toFixed(2)} €`} />
                <Row label="Técnicos atuais" value={`${techCount}`} />
                <Row label={`IVA (${((vatInfo?.rate ?? 0) * 100).toFixed(0)}%)`} value={`${vatAmount.toFixed(2)} €`} />
                <Row label="Total" value={`${total.toFixed(2)} €`} bold />
                <Row label="Vencimento" value={`em 14 dias`} />
              </div>
              {selectedBank && payKind === "manual_transfer" && (
                <>
                  <Separator />
                  <div className="text-xs space-y-0.5">
                    <div className="font-medium text-sm mb-1">Instruções de pagamento</div>
                    <div>{selectedBank.bank_name} · {selectedBank.account_name}</div>
                    {selectedBank.iban && <div>IBAN <span className="font-mono">{selectedBank.iban}</span></div>}
                    {selectedBank.bic && <div>BIC <span className="font-mono">{selectedBank.bic}</span></div>}
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {step === 7 && (
          <section className="space-y-3 text-center py-6">
            <div className="mx-auto h-14 w-14 rounded-full bg-success/15 text-success grid place-items-center">
              <Check className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-semibold">Pagamento registado</h2>
            <p className="text-sm text-muted-foreground">
              {payKind === "manual_transfer"
                ? "Transferência declarada — aguarda revisão manual."
                : "Pagamento simulado registado (gateway real em breve)."}
            </p>
            <p className="text-xs text-muted-foreground">Continua para ativar a assinatura.</p>
          </section>
        )}

        {step === 8 && (
          <section className="space-y-3 text-center py-6">
            <div className="mx-auto h-14 w-14 rounded-full bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))] grid place-items-center">
              <Sparkles className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-semibold">Assinatura ativada</h2>
            <p className="text-sm text-muted-foreground">Workspace pronta. Consulta a timeline em Assinatura.</p>
          </section>
        )}

        <div className="flex justify-between pt-2">
          <Button
            variant="ghost"
            onClick={() => (step === 1 ? navigate(-1) : setStep((s) => Math.max(1, s - 1) as Step))}
            disabled={activating || step === 8}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <Button
            onClick={handleNext}
            disabled={saveProfile.isPending || addPM.isPending || activating || (step === 7 && activated)}
          >
            {step === 8 ? "Concluir" : step === 7 ? (activating ? "A ativar…" : "Ativar assinatura") : "Continuar"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function MethodCard({ active, icon: Icon, label, value, disabled }: { active: boolean; icon: any; label: string; value: string; disabled?: boolean }) {
  return (
    <label className={cn(
      "flex cursor-pointer items-center gap-3 rounded-lg border p-4 hover:border-[hsl(var(--accent))]/40",
      active && "border-[hsl(var(--accent))]/60 bg-[hsl(var(--accent))]/5",
      disabled && "opacity-50 cursor-not-allowed"
    )}>
      <RadioGroupItem value={value} disabled={disabled} />
      <Icon className="h-4 w-4" />
      <span className="text-sm">{label}</span>
    </label>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn("flex justify-between", bold && "text-base font-semibold")}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
