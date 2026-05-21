import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Save, Loader2 } from "lucide-react";
import { AvatarCard } from "@/components/settings/AvatarCard";
import { CompanyDataCard } from "@/components/settings/CompanyDataCard";
import { useUserProfile } from "@/hooks/useUserProfile";
import { COUNTRIES } from "@/lib/countries";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingState } from "@/components/shared/LoadingState";
import { PrivacyAndSessionsCard } from "@/components/settings/PrivacyAndSessionsCard";

interface AddrParts { street_number: string; street_name: string; postal_code: string; city: string; country: string; }
const EMPTY_ADDR: AddrParts = { street_number: "", street_name: "", postal_code: "", city: "", country: "" };

function parseAddress(s: string | null | undefined): AddrParts {
  if (!s) return EMPTY_ADDR;
  // Stored as "{num} {street}, {postal} {city}, {country}"
  const parts = s.split(",").map((p) => p.trim());
  const [line1 = "", line2 = "", country = ""] = parts;
  const m1 = line1.match(/^(\S+)\s+(.+)$/);
  const m2 = line2.match(/^(\S+)\s+(.+)$/);
  return {
    street_number: m1?.[1] ?? "",
    street_name: m1?.[2] ?? line1 ?? "",
    postal_code: m2?.[1] ?? "",
    city: m2?.[2] ?? line2 ?? "",
    country,
  };
}
function joinAddress(a: AddrParts): string {
  return [
    [a.street_number, a.street_name].filter(Boolean).join(" "),
    [a.postal_code, a.city].filter(Boolean).join(" "),
    a.country,
  ].filter(Boolean).join(", ");
}

export default function ProfilePage() {
  const { profile, isLoading, save } = useUserProfile();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [addr, setAddr] = useState<AddrParts>(EMPTY_ADDR);

  useEffect(() => {
    if (profile) {
      setName(profile.full_name || "");
      setPhone(profile.phone || "");
      setAddr(parseAddress(profile.address));
    }
  }, [profile]);

  const setA = <K extends keyof AddrParts>(k: K, v: AddrParts[K]) => setAddr((p) => ({ ...p, [k]: v }));

  return (
    <div className="module-shell">
      <PageHeader icon={User} title="Perfil" subtitle="Dados da empresa e perfil pessoal" />

      {/* SECTION 1 — Company data */}
      <CompanyDataCard />

      {/* SECTION 2 — Personal profile */}
      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-sm">Perfil pessoal</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <AvatarCard />

          {isLoading ? (
            <LoadingState variant="form" rows={3} />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nome completo</Label>
                  <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input className="h-9 bg-muted/30" value={profile?.email || ""} disabled />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Telefone</Label>
                  <Input className="h-9" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>

              <div className="pt-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Endereço pessoal</p>
                <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nº</Label>
                    <Input className="h-9" value={addr.street_number} onChange={(e) => setA("street_number", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Rua</Label>
                    <Input className="h-9" value={addr.street_name} onChange={(e) => setA("street_name", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Código postal</Label>
                    <Input className="h-9" value={addr.postal_code} onChange={(e) => setA("postal_code", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cidade</Label>
                    <Input className="h-9" value={addr.city} onChange={(e) => setA("city", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">País</Label>
                    <Select value={addr.country} onValueChange={(v) => setA("country", v)}>
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

              <Button size="sm" onClick={() => save.mutate({ full_name: name, phone, address: joinAddress(addr) })} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Salvar perfil pessoal
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* SECTION 3 — Privacy, sessions & GDPR (Phase 5.5) */}
      <PrivacyAndSessionsCard />
    </div>
  );
}
