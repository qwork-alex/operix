import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, KeyRound } from "lucide-react";

export default function JoinPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"loading" | "ready" | "accepting" | "done" | "error">("loading");
  const [invite, setInvite] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const applyingRef = useRef(false);

  const token = searchParams.get("token");
  const code = searchParams.get("code");

  // Fetch invite by token or code
  useEffect(() => {
    const fetchInvite = async () => {
      // Also check stored token if none in URL
      const effectiveToken = token || localStorage.getItem("invite_token") || sessionStorage.getItem("invite_token");

      if (!effectiveToken && !code) {
        setStatus("ready");
        return;
      }

      let query = supabase.from("invites").select("*, workspaces(name)");
      if (effectiveToken) query = query.eq("token", effectiveToken);
      else if (code) query = query.eq("short_code", code.toUpperCase());

      const { data, error } = await query.maybeSingle();
      if (error || !data) {
        setErrorMsg("Convite não encontrado ou inválido.");
        setStatus("error");
        // Clear invalid stored tokens
        localStorage.removeItem("invite_token");
        sessionStorage.removeItem("invite_token");
        return;
      }
      if (data.accepted_at) {
        setErrorMsg("Este convite já foi utilizado.");
        setStatus("error");
        localStorage.removeItem("invite_token");
        sessionStorage.removeItem("invite_token");
        return;
      }
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setErrorMsg("Este convite expirou.");
        setStatus("error");
        localStorage.removeItem("invite_token");
        sessionStorage.removeItem("invite_token");
        return;
      }

      // Persist token for signup metadata
      localStorage.setItem("invite_token", data.token);
      sessionStorage.setItem("invite_token", data.token);

      setInvite(data);
      setStatus("ready");
    };
    fetchInvite();
  }, [token, code]);

  // Apply invite via RPC
  const applyInviteViaRPC = useCallback(async (inviteToken: string) => {
    // Prevent duplicate calls
    if (applyingRef.current) return;
    applyingRef.current = true;

    setStatus("accepting");

    try {
      const { data, error } = await supabase.rpc("apply_invite_after_auth", {
        p_invite_token: inviteToken,
      });

      if (error) throw error;

      const result = data as any;
      if (!result?.success) {
        throw new Error(result?.error || "Erro ao processar convite");
      }

      // Set workspace as active
      localStorage.setItem("selected_workspace_id", result.workspace_id);
      // Clear stored tokens
      localStorage.removeItem("invite_token");
      sessionStorage.removeItem("invite_token");

      setStatus("done");
      setTimeout(() => navigate("/"), 2000);
    } catch (err: any) {
      console.error("[JoinPage] Error applying invite:", err);
      setErrorMsg(err.message || "Erro ao aceitar convite.");
      setStatus("error");
      applyingRef.current = false;
    }
  }, [navigate]);

  // When user is authenticated and invite is loaded, apply via RPC
  useEffect(() => {
    if (authLoading || !user || !invite || status !== "ready") return;
    applyInviteViaRPC(invite.token);
  }, [status, invite, user, authLoading, applyInviteViaRPC]);

  const handleCodeSubmit = async () => {
    if (!codeInput.trim()) return;
    const formatted = codeInput.trim().toUpperCase();
    const { data, error } = await supabase
      .from("invites")
      .select("*, workspaces(name)")
      .eq("short_code", formatted)
      .maybeSingle();

    if (error || !data) {
      setErrorMsg("Código inválido.");
      setStatus("error");
      return;
    }
    if (data.accepted_at) {
      setErrorMsg("Este convite já foi utilizado.");
      setStatus("error");
      return;
    }

    localStorage.setItem("invite_token", data.token);
    sessionStorage.setItem("invite_token", data.token);

    setInvite(data);
    setErrorMsg("");
    setStatus("ready");
  };

  // If not authenticated and invite is loaded, redirect to auth
  if (!authLoading && !user && invite) {
    const returnUrl = `/join?token=${invite.token}`;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md p-8 text-center space-y-4">
          <h2 className="text-lg font-semibold">Convite para {(invite.workspaces as any)?.name || "Workspace"}</h2>
          <p className="text-sm text-muted-foreground">Faça login ou crie uma conta para aceitar o convite.</p>
          <Button onClick={() => navigate(`/auth?redirect=${encodeURIComponent(returnUrl)}`)}>
            Entrar / Criar conta
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-8 text-center space-y-4">
        {status === "loading" && (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Verificando convite...</p>
          </>
        )}

        {status === "ready" && !invite && !token && !code && (
          <>
            <KeyRound className="h-8 w-8 mx-auto text-primary" />
            <h2 className="text-lg font-semibold">Entrar com código de convite</h2>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: AB-CD12"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                className="text-center font-mono uppercase"
              />
              <Button onClick={handleCodeSubmit}>Entrar</Button>
            </div>
          </>
        )}

        {status === "accepting" && (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Aceitando convite...</p>
          </>
        )}

        {status === "done" && (
          <>
            <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500" />
            <h2 className="text-lg font-semibold">Convite aceito!</h2>
            <p className="text-sm text-muted-foreground">Redirecionando para o workspace...</p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="h-8 w-8 mx-auto text-destructive" />
            <h2 className="text-lg font-semibold">Erro</h2>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => { setStatus("ready"); setInvite(null); setErrorMsg(""); applyingRef.current = false; }}>
                Tentar código
              </Button>
              <Button onClick={() => navigate("/")}>Ir para início</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
