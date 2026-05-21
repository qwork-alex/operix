import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, CreditCard, FileCheck, Landmark, Receipt, ShieldCheck, Sparkles, Check } from "lucide-react";
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
  useStartCheckout,
  useDeclareManualTransfer,
} from "@/hooks/useBilling";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const STEP_LABELS: Record<Step, string> = {
  1: "Plano",
  2: "Faturação",
  3: "IVA",
  4: "Pagamento",
  5: "Revisão",
  6: "Confirmação",
  7: "Ativação",
};

export default function CheckoutPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { workspaceId, workspaceName, isAdmin } = useWorkspace();
  const { data: snap } = useSubscription();
  const { data: profile } = useBillingProfile();
  const saveProfile = useSaveBillingProfile();
  const addPM = useAddPaymentMethod();
  const startCheckout = useStartCheckout();
  const declareManual = useDeclareManualTransfer();

  const [step, setStep] = useState<Step>(1);
  const [plan, setPlan] = useState<string>(params.get("plan") || snap?.plan?.code || "starter");
  const [cycle, setCycle] = useState<"monthly" | "yearly">(
    (params.get("cycle") as "monthly" | "yearly") || snap?.subscription?.billing_cycle || "monthly"
  );

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

  const [payKind, setPayKind] = useState<"card" | "sepa" | "manual_transfer">("card");
  const [pmDetails, setPmDetails] = useState({ holder_name: "", last4: "", iban_masked: "", brand: "Visa" });

  const [vatInfo, setVatInfo] = useState<{ rate: number; reverse: boolean; exemption: string | null } | null>(null);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);

  useEffect(() => {
    if (profile) setForm((f) => ({ ...f, ...profile } as any));
  }, [profile]);

  useEffect(() => {
    supabase.from("platform_bank_accounts").select("*").eq("is_active", true).then(({ data }) => {
      setBankAccounts(data ?? []);
    });
  }, []);

  // Pricing simulation (uses existing snapshot pricing or basic fallback)
  const price = useMemo(() => {
    if (snap?.pricing) {
      return cycle === "yearly" ? snap.pricing.current_yearly : snap.pricing.current_monthly;
    }
    return 29;
  }, [snap, cycle]);

  const vatAmount = vatInfo ? Math.round((price * vatInfo.rate) * 100) / 100 : 0;
  const total = Math.round((price + vatAmount) * 100) / 100;

  async function calcVat() {
    const { data, error } = await supabase.rpc("calculate_vat", {
      _country: form.country,
      _is_business: form.is_business,
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

  async function handleNext() {
    if (step === 2) {
      if (!form.legal_name || !form.billing_email) {
        toast.error("Preenche nome legal e email de faturação");
        return;
      }
      await saveProfile.mutateAsync(form);
      await calcVat();
      setStep(3);
      return;
    }
    if (step === 4) {
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
      setStep(5);
      return;
    }
    if (step === 5) {
      // Confirm: start checkout
      await startCheckout.mutateAsync({ plan_code: plan, cycle });
      if (payKind === "manual_transfer") {
        await declareManual.mutateAsync({ amount: total });
      }
      setStep(6);
      return;
    }
    if (step === 6) {
      await supabase.rpc("log_subscription_event", {
        _workspace_id: workspaceId!,
        _event_type: "subscription_activated_pending",
        _severity: "success",
        _message: "Assinatura criada — aguardando confirmação de pagamento",
        _metadata: { plan, cycle, payment_method: payKind } as any,
      });
      setStep(7);
      return;
    }
    if (step === 7) {
      navigate("/subscription");
      return;
    }
    setStep((s) => (Math.min(7, (s + 1)) as Step));
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
                active && "border-primary/40 bg-primary/10 text-primary",
                done && "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
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
            <h2 className="text-lg font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4" /> Escolhe o plano</h2>
            <RadioGroup value={plan} onValueChange={setPlan} className="grid gap-3 md:grid-cols-2">
              {["starter", "pro", "scale", "enterprise"].map((p) => (
                <label key={p} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-4 hover:border-primary/40", plan === p && "border-primary/60 bg-primary/5")}>
                  <RadioGroupItem value={p} />
                  <div>
                    <div className="font-medium capitalize">{p}</div>
                    <div className="text-xs text-muted-foreground">Plano {p}</div>
                  </div>
                </label>
              ))}
            </RadioGroup>
            <div>
              <Label>Ciclo</Label>
              <RadioGroup value={cycle} onValueChange={(v) => setCycle(v as any)} className="mt-2 flex gap-3">
                <label className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2", cycle === "monthly" && "border-primary/60 bg-primary/5")}>
                  <RadioGroupItem value="monthly" /> Mensal
                </label>
                <label className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2", cycle === "yearly" && "border-primary/60 bg-primary/5")}>
                  <RadioGroupItem value="yearly" /> Anual <Badge variant="outline" className="ml-1">2 meses grátis</Badge>
                </label>
              </RadioGroup>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" /> Perfil de faturação</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome legal *" value={form.legal_name} onChange={(v) => setForm({ ...form, legal_name: v })} />
              <Field label="Nome comercial" value={form.company_name} onChange={(v) => setForm({ ...form, company_name: v })} />
              <Field label="Email de faturação *" value={form.billing_email} onChange={(v) => setForm({ ...form, billing_email: v })} />
              <Field label="País (ISO)" value={form.country} onChange={(v) => setForm({ ...form, country: v.toUpperCase().slice(0, 2) })} />
              <Field label="Morada" value={form.billing_address} onChange={(v) => setForm({ ...form, billing_address: v })} />
              <Field label="Cidade" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
              <Field label="Código postal" value={form.postal_code} onChange={(v) => setForm({ ...form, postal_code: v })} />
              <Field label="Moeda preferida" value={form.preferred_currency} onChange={(v) => setForm({ ...form, preferred_currency: v.toUpperCase().slice(0, 3) })} />
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Validação de IVA</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Número de IVA" value={form.vat_number} onChange={(v) => setForm({ ...form, vat_number: v.toUpperCase() })} />
              <div>
                <Label>Tipo</Label>
                <RadioGroup value={form.is_business ? "b" : "c"} onValueChange={(v) => setForm({ ...form, is_business: v === "b" })} className="mt-2 flex gap-3">
                  <label className="flex items-center gap-2"><RadioGroupItem value="b" /> Empresa</label>
                  <label className="flex items-center gap-2"><RadioGroupItem value="c" /> Particular</label>
                </RadioGroup>
              </div>
            </div>
            <Button variant="outline" onClick={calcVat}>Recalcular IVA</Button>
            {vatInfo && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <div>Taxa IVA aplicável: <strong>{(vatInfo.rate * 100).toFixed(0)}%</strong></div>
                {vatInfo.reverse && <div className="text-amber-500">Reverse charge (B2B intra-UE)</div>}
                {vatInfo.exemption && <div className="text-muted-foreground">Isenção: {vatInfo.exemption}</div>}
              </div>
            )}
          </section>
        )}

        {step === 4 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4" /> Método de pagamento</h2>
            <RadioGroup value={payKind} onValueChange={(v) => setPayKind(v as any)} className="grid gap-3 md:grid-cols-3">
              <MethodCard active={payKind === "card"} icon={CreditCard} label="Cartão" value="card" />
              <MethodCard active={payKind === "sepa"} icon={Landmark} label="SEPA" value="sepa" />
              <MethodCard active={payKind === "manual_transfer"} icon={Receipt} label="Transferência manual" value="manual_transfer" />
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
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm space-y-2">
                <div className="font-medium">Instruções de transferência</div>
                {bankAccounts.length === 0 && <div className="text-muted-foreground">Sem contas bancárias configuradas.</div>}
                {bankAccounts.map((b) => (
                  <div key={b.id} className="text-xs">
                    <div><strong>{b.bank_name}</strong> — {b.account_holder}</div>
                    <div>IBAN: {b.iban}</div>
                    {b.bic && <div>BIC: {b.bic}</div>}
                  </div>
                ))}
                <Separator />
                <div className="text-amber-500 text-xs">O pagamento ficará em <strong>pending_manual_review</strong> até confirmação.</div>
              </div>
            )}
          </section>
        )}

        {step === 5 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><FileCheck className="h-4 w-4" /> Revisão</h2>
            <div className="grid gap-3 text-sm">
              <Row label="Plano" value={`${plan} • ${cycle === "yearly" ? "Anual" : "Mensal"}`} />
              <Row label="Faturado para" value={form.legal_name} />
              <Row label="Email" value={form.billing_email} />
              <Row label="País / IVA" value={`${form.country}${form.vat_number ? " • " + form.vat_number : ""}`} />
              <Row label="Método" value={payKind === "card" ? "Cartão" : payKind === "sepa" ? "SEPA" : "Transferência manual"} />
              <Separator />
              <Row label="Subtotal" value={`${price.toFixed(2)} ${form.preferred_currency}`} />
              <Row label={`IVA (${((vatInfo?.rate ?? 0) * 100).toFixed(0)}%)`} value={`${vatAmount.toFixed(2)} ${form.preferred_currency}`} />
              <Row label="Total" value={`${total.toFixed(2)} ${form.preferred_currency}`} bold />
            </div>
          </section>
        )}

        {step === 6 && (
          <section className="space-y-3 text-center py-6">
            <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500/15 text-emerald-500 grid place-items-center">
              <Check className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-semibold">Pagamento registado</h2>
            <p className="text-sm text-muted-foreground">
              {payKind === "manual_transfer"
                ? "Aguardando confirmação manual da transferência."
                : "Mock provider — em fase Stripe será cobrado automaticamente."}
            </p>
          </section>
        )}

        {step === 7 && (
          <section className="space-y-3 text-center py-6">
            <div className="mx-auto h-14 w-14 rounded-full bg-primary/15 text-primary grid place-items-center">
              <Sparkles className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-semibold">Assinatura ativada</h2>
            <p className="text-sm text-muted-foreground">A workspace está pronta. Consulta a timeline em Assinatura.</p>
          </section>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => (step === 1 ? navigate(-1) : setStep((s) => Math.max(1, s - 1) as Step))}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <Button onClick={handleNext} disabled={saveProfile.isPending || startCheckout.isPending}>
            {step === 7 ? "Concluir" : "Continuar"} <ArrowRight className="ml-2 h-4 w-4" />
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

function MethodCard({ active, icon: Icon, label, value }: { active: boolean; icon: any; label: string; value: string }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-4 hover:border-primary/40", active && "border-primary/60 bg-primary/5")}>
      <RadioGroupItem value={value} />
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
