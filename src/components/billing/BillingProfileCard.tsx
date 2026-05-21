import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Building2, Save, Loader2 } from "lucide-react";
import { useBillingProfile, useSaveBillingProfile, type BillingProfile } from "@/hooks/useBilling";
import { Skeleton } from "@/components/ui/skeleton";

const VAT_MODES = [
  { value: "with_vat",       label: "Com IVA",                 hint: "Aplicar IVA do país no checkout." },
  { value: "no_vat",         label: "Sem IVA",                 hint: "Particular / isento (sem aplicação de IVA)." },
  { value: "reverse_charge", label: "Autoliquidação (UE B2B)", hint: "Reverse-charge intracomunitário — exige NIF válido." },
] as const;

const COUNTRIES = [
  ["PT", "Portugal"], ["ES", "Espanha"], ["FR", "França"], ["IT", "Itália"],
  ["DE", "Alemanha"], ["NL", "Países Baixos"], ["BE", "Bélgica"], ["LU", "Luxemburgo"],
  ["IE", "Irlanda"], ["AT", "Áustria"], ["GB", "Reino Unido"], ["CH", "Suíça"], ["US", "EUA"],
];

export function BillingProfileCard() {
  const { data: profile, isLoading } = useBillingProfile();
  const save = useSaveBillingProfile();

  const [form, setForm] = useState<Partial<BillingProfile & { vat_mode: string }>>({});

  useEffect(() => {
    if (profile) setForm(profile as any);
  }, [profile]);

  function update<K extends keyof typeof form>(k: K, v: any) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function submit() {
    save.mutate(form as any);
  }

  if (isLoading) {
    return (
      <Card className="p-5 surface-card space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </Card>
    );
  }

  const vatMode = (form as any).vat_mode ?? "with_vat";
  const requiresVat = vatMode === "reverse_charge";

  return (
    <Card className="p-5 surface-card space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">Perfil de faturação</h3>
            <p className="text-xs text-muted-foreground">Dados fiscais usados nas faturas emitidas</p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {form.is_business ? "Empresa" : "Particular"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nome legal *" value={form.legal_name} onChange={(v) => update("legal_name", v)} />
        <Field label="Nome comercial" value={form.company_name ?? ""} onChange={(v) => update("company_name", v)} />
        <Field label="Email de faturação *" value={form.billing_email} onChange={(v) => update("billing_email", v)} />
        <Field label={`NIF / VAT${requiresVat ? " *" : ""}`} value={form.vat_number ?? ""} onChange={(v) => update("vat_number", v)} />
        <Field label="Morada" value={form.billing_address ?? ""} onChange={(v) => update("billing_address", v)} />
        <Field label="Cidade" value={form.city ?? ""} onChange={(v) => update("city", v)} />
        <Field label="Código postal" value={form.postal_code ?? ""} onChange={(v) => update("postal_code", v)} />

        <div className="space-y-1.5">
          <Label className="text-xs">País</Label>
          <Select value={form.country ?? "PT"} onValueChange={(v) => update("country", v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COUNTRIES.map(([code, name]) => (
                <SelectItem key={code} value={code}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2 pt-3 border-t border-border/40">
        <Label className="text-xs">Modo de IVA</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {VAT_MODES.map((m) => {
            const active = vatMode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => update("vat_mode" as any, m.value)}
                className={`text-left p-3 rounded-lg border transition-all ${
                  active
                    ? "border-primary/60 bg-primary/10 shadow-[0_0_20px_rgba(var(--primary-rgb,99_102_241)/0.15)]"
                    : "border-border/40 bg-card/40 hover:border-border/80"
                }`}
              >
                <p className="text-sm font-semibold">{m.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{m.hint}</p>
              </button>
            );
          })}
        </div>
        {requiresVat && !form.vat_number && (
          <p className="text-[11px] text-amber-400">⚠ Reverse-charge requer NIF intracomunitário válido.</p>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={save.isPending || !form.legal_name || !form.billing_email}>
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-2" />}
          Guardar perfil
        </Button>
      </div>
    </Card>
  );
}

function Field({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="h-9" />
    </div>
  );
}
