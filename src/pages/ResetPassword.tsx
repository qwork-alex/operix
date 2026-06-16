import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, ShieldCheck, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/BrandLogo";
import { brandConfig } from "@/brand.config";
import { PasswordStrength, isPasswordStrong } from "@/components/auth/PasswordStrength";
import { apiRequest } from "@/lib/api";

const RESET_AUTH_TIMEOUT_MS = 12000;

function withResetTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timeout`)), RESET_AUTH_TIMEOUT_MS);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const token = params.get("token") || "";
  const ready = Boolean(token);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error("Link inválido ou ausente.");
      return;
    }
    if (!isPasswordStrong(password)) {
      toast.error("A senha não cumpre os requisitos mínimos.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setSubmitting(true);
    try {
      await withResetTimeout(
        apiRequest("/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        }),
        "resetPassword",
      );
      toast.success("Senha alterada com sucesso");
      navigate("/auth", { replace: true });
    } catch (err) {
      toast.error((err as Error).message || "Falha ao alterar senha.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <BrandLogo size={56} />
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{brandConfig.appName}</h1>
          <p className="text-sm text-muted-foreground">Redefinir senha</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-panel rounded-xl p-6 space-y-4">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground flex gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <div>Defina uma nova senha forte para a sua conta.</div>
          </div>

          {!ready && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              Link de redefinição inválido ou expirado.
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="np" className="text-foreground flex items-center gap-2">
              <KeyRound className="h-3.5 w-3.5" /> Nova senha
            </Label>
            <div className="relative">
              <Input
                id="np" type={show ? "text" : "password"} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres" required minLength={8}
                className="bg-muted/50 border-border pr-10"
                disabled={!ready}
              />
              <button
                type="button" tabIndex={-1}
                onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <PasswordStrength password={password} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cp" className="text-foreground">Confirmar nova senha</Label>
            <Input
              id="cp" type={show ? "text" : "password"} value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repita a nova senha" required minLength={8}
              className="bg-muted/50 border-border"
              disabled={!ready}
            />
            {confirm.length > 0 && confirm !== password && (
              <p className="text-[11px] text-destructive">As senhas não coincidem.</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={submitting || !ready}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Alterar senha
          </Button>
        </form>
      </div>
    </div>
  );
}
