import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Building2, LogIn, ShieldCheck, Mail, Users, Wrench } from "lucide-react";
import { brandConfig } from "@/brand.config";
import { BrandLogo } from "@/components/BrandLogo";
import { supabase } from "@/integrations/supabase/client";
import { PasswordStrength, isPasswordStrong } from "@/components/auth/PasswordStrength";
import { ForgotPasswordDialog, DuplicateEmailDialog } from "@/components/auth/AuthDialogs";
import { ASVerifiedSeal } from "@/components/branding/ASVerifiedSeal";

type Mode = "signin" | "create-workspace" | "create-technician";

const AUTH_FORM_TIMEOUT_MS = 12000;

function withAuthTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timeout`)), AUTH_FORM_TIMEOUT_MS);
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

export default function Auth() {
  const { session, loading, signIn } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [duplicateEmail, setDuplicateEmail] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (session) return <Navigate to="/" replace />;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) toast.error(error.message);
    setSubmitting(false);
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim() || !fullName.trim() || !email.trim()) {
      toast.error("Preencha todos os campos.");
      return;
    }
    if (!isPasswordStrong(password)) {
      toast.error("A senha precisa de no mínimo 8 caracteres, 1 maiúscula e 1 número.");
      return;
    }

    // Hard guard: a workspace signup MUST NOT carry any invite token.
    try { localStorage.removeItem("invite_token"); sessionStorage.removeItem("invite_token"); } catch {}

    setSubmitting(true);
    try {
      const { data, error } = await withAuthTimeout<Awaited<ReturnType<typeof supabase.auth.signUp>>>(
        supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/onboarding/workspace`,
            data: {
              full_name: fullName.trim(),
              create_workspace: true,
              intended_workspace_name: workspaceName.trim(),
            },
          },
        }),
        "signUp workspace",
      );

      if (error) {
        const msg = error.message || "";
        if (msg.toLowerCase().includes("registered") || msg.toLowerCase().includes("already")) {
          setDuplicateEmail(email.trim().toLowerCase());
        } else {
          toast.error(msg);
        }
        return;
      }

      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setDuplicateEmail(email.trim().toLowerCase());
        return;
      }

      supabase.from("backend_event_logs").insert({
        table_name: "auth",
        action: "WORKSPACE_OWNER_SIGNUP",
        payload: { email, full_name: fullName, workspace_name: workspaceName } as any,
      }).then(() => {}, () => {});

      if (data.session) {
        toast.success("Workspace criada. Vamos configurar a empresa.");
        navigate("/onboarding/workspace", { replace: true });
      } else {
        toast.success("Verifique o seu email para confirmar a conta e continuar a configuração.");
        setMode("signin");
      }
    } catch (err) {
      toast.error((err as Error).message || "Falha ao criar workspace.");
    } finally {
      setSubmitting(false);
    }
  };

  // Independent technician account — global identity, can later be invited
  // to one or many workspaces. Does NOT create a workspace.
  const handleCreateTechnician = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      toast.error("Preencha todos os campos.");
      return;
    }
    if (!isPasswordStrong(password)) {
      toast.error("A senha precisa de no mínimo 8 caracteres, 1 maiúscula e 1 número.");
      return;
    }
    // Technician signup must NOT carry any invite token or workspace flag.
    try { localStorage.removeItem("invite_token"); sessionStorage.removeItem("invite_token"); } catch {}
    setSubmitting(true);
    try {
      const { data, error } = await withAuthTimeout<Awaited<ReturnType<typeof supabase.auth.signUp>>>(
        supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              full_name: fullName.trim(),
              intended_role: "tecnico",
            },
          },
        }),
        "signUp technician",
      );
      if (error) {
        const msg = error.message || "";
        if (msg.toLowerCase().includes("registered") || msg.toLowerCase().includes("already")) {
          setDuplicateEmail(email.trim().toLowerCase());
        } else {
          toast.error(msg);
        }
        return;
      }
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setDuplicateEmail(email.trim().toLowerCase());
        return;
      }
      supabase.from("backend_event_logs").insert({
        table_name: "auth", action: "TECHNICIAN_SIGNUP",
        payload: { email, full_name: fullName } as any,
      }).then(() => {}, () => {});
      if (data.session) {
        toast.success("Conta de técnico criada. Bem-vindo!");
        navigate("/", { replace: true });
      } else {
        toast.success("Verifique seu email para confirmar a conta.");
        setMode("signin");
      }
    } catch (err) {
      toast.error((err as Error).message || "Falha ao criar conta de técnico.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background px-4 py-10 overflow-hidden">

      {/* Ambient premium background — pure CSS, zero animation cost */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(1100px 600px at 18% 12%, hsl(var(--primary) / 0.18), transparent 60%), radial-gradient(900px 520px at 88% 92%, hsl(217 90% 55% / 0.14), transparent 65%), radial-gradient(700px 500px at 50% 110%, hsl(265 85% 60% / 0.10), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, hsl(var(--background) / 0.85) 100%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <BrandLogo size={56} />
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{brandConfig.appName}</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signin"
              ? t("auth.signInTitle")
              : mode === "create-technician"
                ? "Crie sua conta de técnico independente"
                : "Crie uma nova workspace operacional"}
          </p>
        </div>

        {/* Mode switch — 3 tabs: signin / technician (independent) / workspace owner */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-muted/40 border border-border">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              mode === "signin"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LogIn className="h-4 w-4" />
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode("create-technician")}
            className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              mode === "create-technician"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Wrench className="h-4 w-4" />
            Técnico
          </button>
          <button
            type="button"
            onClick={() => setMode("create-workspace")}
            className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              mode === "create-workspace"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="h-4 w-4" />
            Workspace
          </button>
        </div>

        {mode === "signin" ? (
          <form onSubmit={handleSignIn} className="glass-panel rounded-2xl p-6 space-y-4 border border-border/60 shadow-[0_20px_60px_-30px_hsl(var(--primary)/0.45),0_0_0_1px_hsl(var(--border)/0.4)] backdrop-blur-xl">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">{t("auth.email")}</Label>
              <Input
                id="email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" required
                className="bg-muted/50 border-border"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-foreground">{t("auth.password")}</Label>
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password" type={showPassword ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" required minLength={6}
                  className="bg-muted/50 border-border pr-10"
                />
                <button
                  type="button" tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("auth.signIn")}
            </Button>
          </form>
        ) : mode === "create-technician" ? (
          <form onSubmit={handleCreateTechnician} className="glass-panel rounded-2xl p-6 space-y-4 border border-border/60 shadow-[0_20px_60px_-30px_hsl(var(--primary)/0.45),0_0_0_1px_hsl(var(--border)/0.4)] backdrop-blur-xl">
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground flex gap-2">
              <Wrench className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <div>
                <span className="text-foreground font-medium">Conta de técnico independente.</span>{" "}
                Você poderá ser convidado para múltiplos workspaces usando seu ID após criar a conta.
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="t-fullname" className="text-foreground flex items-center gap-2">
                <Users className="h-3.5 w-3.5" /> Nome completo
              </Label>
              <Input
                id="t-fullname" value={fullName} required maxLength={100}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="João Silva"
                className="bg-muted/50 border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="t-email" className="text-foreground flex items-center gap-2">
                <Mail className="h-3.5 w-3.5" /> Email
              </Label>
              <Input
                id="t-email" type="email" value={email} required
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                className="bg-muted/50 border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="t-password" className="text-foreground">Senha</Label>
              <div className="relative">
                <Input
                  id="t-password" type={showPassword ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres" required minLength={8}
                  className="bg-muted/50 border-border pr-10"
                />
                <button
                  type="button" tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar conta de técnico
            </Button>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Após criar a conta, seu ID (formato <code className="text-foreground">T00001</code>) ficará disponível no perfil para compartilhar com workspaces.
            </p>
          </form>
        ) : (
          <form onSubmit={handleCreateWorkspace} className="glass-panel rounded-2xl p-6 space-y-4 border border-border/60 shadow-[0_20px_60px_-30px_hsl(var(--primary)/0.45),0_0_0_1px_hsl(var(--border)/0.4)] backdrop-blur-xl">
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground flex gap-2">
              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <div>
                <span className="text-foreground font-medium">Apenas para proprietários.</span>{" "}
                Técnicos, sócios e clientes recebem acesso por convite e não devem usar este formulário.
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ws-name" className="text-foreground flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5" /> Nome da workspace
              </Label>
              <Input
                id="ws-name" value={workspaceName} required maxLength={80}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="A minha empresa"
                className="bg-muted/50 border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ws-fullname" className="text-foreground flex items-center gap-2">
                <Users className="h-3.5 w-3.5" /> O seu nome
              </Label>
              <Input
                id="ws-fullname" value={fullName} required maxLength={100}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="João Silva"
                className="bg-muted/50 border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ws-email" className="text-foreground flex items-center gap-2">
                <Mail className="h-3.5 w-3.5" /> Email profissional
              </Label>
              <Input
                id="ws-email" type="email" value={email} required
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
                className="bg-muted/50 border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ws-password" className="text-foreground">Senha</Label>
              <div className="relative">
                <Input
                  id="ws-password" type={showPassword ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres" required minLength={8}
                  className="bg-muted/50 border-border pr-10"
                />
                <button
                  type="button" tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar workspace e continuar
            </Button>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Ao continuar você concorda com os{" "}
              <a href="/legal/terms" className="underline hover:text-foreground">Termos</a> e a{" "}
              <a href="/legal/privacy" className="underline hover:text-foreground">Política de Privacidade</a>.
              Após o registo, configurará empresa, plano e ativação operacional.
            </p>
          </form>
        )}
      </div>

      <ForgotPasswordDialog
        open={forgotOpen}
        onOpenChange={setForgotOpen}
        defaultEmail={email}
      />
      <DuplicateEmailDialog
        open={!!duplicateEmail}
        onOpenChange={(v) => { if (!v) setDuplicateEmail(null); }}
        email={duplicateEmail || ""}
        onSignIn={() => { setMode("signin"); setDuplicateEmail(null); }}
        onRecover={() => { setForgotOpen(true); setDuplicateEmail(null); }}
      />

      {/* AS Verified — official creator seal, globally rendered on all auth screens (signin / technician / workspace) */}
      <ASVerifiedSeal
        variant="dark"
        size={18}
        opacity={0.55}
        position="bottom-right"
      />
    </div>
  );
}
