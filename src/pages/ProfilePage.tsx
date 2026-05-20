import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { User, Save, Loader2 } from "lucide-react";
import { AvatarCard } from "@/components/settings/AvatarCard";
import { useUserProfile } from "@/hooks/useUserProfile";

export default function ProfilePage() {
  const { profile, isLoading, save } = useUserProfile();
  const [form, setForm] = useState({ full_name: "", phone: "", address: "" });

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || "",
        phone: profile.phone || "",
        address: profile.address || "",
      });
    }
  }, [profile]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <User className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Perfil</h1>
          <p className="text-xs text-muted-foreground">Informações pessoais e foto de perfil</p>
        </div>
      </div>

      <AvatarCard />

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-sm">Dados pessoais</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="text-xs text-muted-foreground">A carregar…</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nome completo</Label>
                  <Input className="h-9" value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input className="h-9 bg-muted/30" value={profile?.email || ""} disabled />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Telefone</Label>
                  <Input className="h-9" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Endereço pessoal</Label>
                <Input className="h-9" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Rua, número, código postal, cidade…" />
              </div>
              <Button size="sm" onClick={() => save.mutate(form)} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Salvar perfil
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
