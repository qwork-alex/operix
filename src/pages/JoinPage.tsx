import { useState, useEffect } from "react";
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

  const token = searchParams.get("token");
  const code = searchParams.get("code");

  // Fetch invite by token or code
  useEffect(() => {
    const fetchInvite = async () => {
      if (!token && !code) {
        setStatus("ready"); // show manual code entry
        return;
      }

      let query = supabase.from("invites").select("*, workspaces(name)");
      if (token) query = query.eq("token", token);
      else if (code) query = query.eq("short_code", code.toUpperCase());

      const { data, error } = await query.maybeSingle();
      if (error || !data) {
        setErrorMsg("Convite não encontrado ou inválido.");
        setStatus("error");
        return;
      }
      if (data.accepted_at) {
        setErrorMsg("Este convite já foi utilizado.");
        setStatus("error");
        return;
      }
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setErrorMsg("Este convite expirou.");
        setStatus("error");
        return;
      }
      setInvite(data);
      setStatus("ready");
    };
    fetchInvite();
  }, [token, code]);

  // When user is authenticated and invite is loaded, accept it
  useEffect(() => {
    if (status !== "ready" || !invite || !user || authLoading) return;
    acceptInvite();
  }, [status, invite, user, authLoading]);

  const acceptInvite = async () => {
    if (!invite || !user) return;
    setStatus("accepting");

    try {
      // Find or create app_user
      let { data: appUser } = await supabase
        .from("app_users")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!appUser) {
        const { data: newUser, error } = await supabase
          .from("app_users")
          .insert({ auth_user_id: user.id, email: user.email!, name: user.user_metadata?.full_name || "" })
          .select("id")
          .single();
        if (error) throw error;
        appUser = newUser;
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from("memberships")
        .select("id")
        .eq("user_id", appUser!.id)
        .eq("workspace_id", invite.workspace_id)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from("memberships").insert({
          user_id: appUser!.id,
          workspace_id: invite.workspace_id,
          role: invite.role,
          status: "active",
          source: "invite_link",
        });
        if (error) throw error;
      }

      // Mark invite as accepted
      await supabase.from("invites").update({
        accepted_at: new Date().toISOString(),
        accepted_by: appUser!.id,
      }).eq("id", invite.id);

      // Set this workspace as active
      localStorage.setItem("selected_workspace_id", invite.workspace_id);

      // Clear any stored invite token
      sessionStorage.removeItem("invite_token");

      // Log
      await supabase.from("backend_event_logs").insert({
        table_name: "invites",
        action: "INVITE_ACCEPTED",
        row_id: invite.id,
        payload: { workspace_id: invite.workspace_id, role: invite.role } as any,
      });

      setStatus("done");
      setTimeout(() => navigate("/"), 2000);
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao aceitar convite.");
      setStatus("error");
    }
  };

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
    setInvite(data);
    setErrorMsg("");
    setStatus("ready");
  };

  // If not authenticated and invite is loaded, redirect to auth with invite token stored
  if (!authLoading && !user && invite) {
    // Store the invite token in sessionStorage so auth page can redirect back
    sessionStorage.setItem("invite_token", invite.token);
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

        {status === "ready" && invite && !user && (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Aguardando autenticação...</p>
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
              <Button variant="outline" onClick={() => { setStatus("ready"); setInvite(null); setErrorMsg(""); }}>
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
