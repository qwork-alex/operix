import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Loader2, Eye, EyeOff, Save, KeyRound, Monitor } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/api";
import { toast } from "sonner";

export function SecurityCard() {
  const { user, changePassword: updatePassword } = useAuth();
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const handleChangePassword = async () => {
    if (pwd.length < 8) { toast.error("Mínimo 8 caracteres"); return; }
    if (pwd !== confirm) { toast.error("As senhas não coincidem"); return; }
    setSaving(true);
    try {
      const { error } = await updatePassword(pwd);
      if (error) throw error;
      toast.success("Senha alterada com sucesso");
      setPwd(""); setConfirm("");
    } catch (e: any) {
      toast.error(e.message || "Erro ao alterar senha");
    } finally { setSaving(false); }
  };

  const sendRecovery = async () => {
    if (!user?.email) return;
    setSendingReset(true);
    try {
      await apiRequest("/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      toast.success("Se este email existir, enviamos um link de redefinição.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar recuperação");
    } finally { setSendingReset(false); }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Segurança e acesso
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Change password */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground inline-flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5" /> Alterar senha
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nova senha</Label>
              <div className="relative">
                <Input className="h-9 pr-9" type={show ? "text" : "password"} value={pwd} onChange={(e) => setPwd(e.target.value)} />
                <button type="button" onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Confirmar</Label>
              <Input className="h-9" type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
          </div>
          <Button size="sm" onClick={handleChangePassword} disabled={saving || !pwd || !confirm}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Atualizar senha
          </Button>
        </div>

        {/* Recovery */}
        <div className="border-t border-border/40 pt-4 space-y-2">
          <p className="text-xs font-medium text-foreground">Recuperar senha</p>
          <p className="text-[11px] text-muted-foreground">
            Envia um link de recuperação para <span className="text-foreground">{user?.email}</span>.
          </p>
          <Button size="sm" variant="outline" onClick={sendRecovery} disabled={sendingReset}>
            {sendingReset ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <KeyRound className="h-4 w-4 mr-1" />}
            Enviar email de recuperação
          </Button>
        </div>

        {/* Sessions placeholder */}
        <div className="border-t border-border/40 pt-4 space-y-1.5">
          <p className="text-xs font-medium text-foreground inline-flex items-center gap-1.5">
            <Monitor className="h-3.5 w-3.5" /> Sessões ativas
          </p>
          <p className="text-[11px] text-muted-foreground">
            Em breve · gestão de dispositivos e revogação de sessões.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
