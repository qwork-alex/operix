import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Loader2, Save } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getCurrentUserId, logSaveError, logSavePayload } from "@/lib/authUser";
import { toast } from "sonner";

import { COUNTRIES } from "@/lib/countries";

type Form = {
  company_name: string;
  siret: string;
  tva_number: string;
  company_email: string;
  company_phone: string;
  bank_name: string;
  iban: string;
  swift_bic: string;
  street_number: string;
  street_name: string;
  postal_code: string;
  city: string;
  country: string;
};

const EMPTY: Form = {
  company_name: "", siret: "", tva_number: "",
  company_email: "", company_phone: "",
  bank_name: "", iban: "", swift_bic: "",
  street_number: "", street_name: "", postal_code: "", city: "", country: "",
};

export function CompanyDataCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(EMPTY);

  const { data, isLoading } = useQuery({
    queryKey: ["company-settings-full", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (data) {
      setForm({
        company_name: (data as any).company_name || "",
        siret: (data as any).siret || "",
        tva_number: (data as any).tva_number || "",
        company_email: (data as any).company_email || "",
        company_phone: (data as any).company_phone || "",
        bank_name: (data as any).bank_name || "",
        iban: (data as any).iban || "",
        swift_bic: (data as any).swift_bic || "",
        street_number: (data as any).street_number || "",
        street_name: (data as any).street_name || "",
        postal_code: (data as any).postal_code || "",
        city: (data as any).city || "",
        country: (data as any).country || "",
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const currentUserId = await getCurrentUserId();
      // Keep legacy "address" in sync (joined string) for backward compat
      const joinedAddress = [
        [form.street_number, form.street_name].filter(Boolean).join(" "),
        [form.postal_code, form.city].filter(Boolean).join(" "),
        form.country,
      ].filter(Boolean).join(", ");
      const payload: any = { ...form, address: joinedAddress, updated_at: new Date().toISOString() };
      logSavePayload("CompanyData:upsert", currentUserId, payload);
      const { data: existing } = await supabase
        .from("company_settings")
        .select("id")
        .eq("user_id", currentUserId)
        .maybeSingle();
      if (existing) {
        const { error } = await (supabase as any).from("company_settings").update(payload).eq("user_id", currentUserId);
        if (error) { logSaveError("CompanyData:update", error); throw error; }
      } else {
        const { error } = await (supabase as any).from("company_settings").insert(payload);
        if (error) { logSaveError("CompanyData:insert", error); throw error; }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-settings-full"] });
      qc.invalidateQueries({ queryKey: ["company-settings"] });
      toast.success("Dados da empresa atualizados");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Dados da empresa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">A carregar…</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nome da empresa" v={form.company_name} on={(v) => set("company_name", v)} />
              <Field label="SIRET / Registo" v={form.siret} on={(v) => set("siret", v)} />
              <Field label="IVA / VAT" v={form.tva_number} on={(v) => set("tva_number", v)} />
              <Field label="Email da empresa" type="email" v={form.company_email} on={(v) => set("company_email", v)} />
              <Field label="Telefone da empresa" v={form.company_phone} on={(v) => set("company_phone", v)} />
            </div>

            <div className="pt-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Endereço</p>
              <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-3">
                <Field label="Nº" v={form.street_number} on={(v) => set("street_number", v)} />
                <Field label="Rua" v={form.street_name} on={(v) => set("street_name", v)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <Field label="Código postal" v={form.postal_code} on={(v) => set("postal_code", v)} />
                <Field label="Cidade" v={form.city} on={(v) => set("city", v)} />
                <div className="space-y-1">
                  <Label className="text-xs">País</Label>
                  <Select value={form.country} onValueChange={(v) => set("country", v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Dados bancários</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Banco" v={form.bank_name} on={(v) => set("bank_name", v)} />
                <Field label="IBAN" v={form.iban} on={(v) => set("iban", v)} />
                <Field label="SWIFT / BIC" v={form.swift_bic} on={(v) => set("swift_bic", v)} />
              </div>
            </div>

            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar dados da empresa
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, v, on, type }: { label: string; v: string; on: (s: string) => void; type?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input className="h-9" type={type} value={v} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
