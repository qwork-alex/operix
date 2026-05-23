/**
 * WorkspaceSwitcher — Context Switcher global no TopBar.
 *
 * Arquitetura: 1 auth, 1 UUID, 1 perfil global. O usuário pode
 * pertencer a múltiplos workspaces com papéis diferentes em cada um.
 * Este componente apenas TROCA o contexto ativo — nunca cria nova
 * conta nem altera identidade.
 *
 * O contexto ativo é persistido em `localStorage["selected_workspace_id"]`,
 * que é lido por `useWorkspace()`. Ao trocar, invalidamos o cache e
 * recarregamos para que todos os módulos (OS, OP, financeiro,
 * faturamento, automações, dashboards) releiam dentro do novo contexto.
 */
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Building2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useLanguage } from "@/hooks/useLanguage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MembershipRow {
  workspace_id: string;
  role: string;
  workspaces: { id: string; name: string; owner_user_id: string | null } | null;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  socio: "Sócio",
  tecnico: "Técnico",
  cliente: "Cliente",
};

const ROLE_TONE: Record<string, string> = {
  admin: "text-amber-400",
  socio: "text-emerald-400",
  tecnico: "text-sky-400",
  cliente: "text-violet-400",
};

export function WorkspaceSwitcher() {
  const { user } = useAuth();
  const { workspaceId, workspaceName, myRole } = useWorkspace();
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const { data: memberships = [], isLoading } = useQuery({
    queryKey: ["context-memberships", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<MembershipRow[]> => {
      const { data: appUser } = await supabase
        .from("app_users")
        .select("id")
        .eq("auth_user_id", user!.id)
        .maybeSingle();
      if (!appUser) return [];
      const { data, error } = await supabase
        .from("memberships")
        .select("workspace_id, role, workspaces(id, name, owner_user_id)")
        .eq("user_id", appUser.id)
        .eq("status", "active");
      if (error) throw error;
      return (data || []) as any;
    },
  });

  const items = useMemo(() => {
    return memberships
      .filter((m) => !!m.workspaces)
      .map((m) => ({
        id: m.workspace_id,
        name: m.workspaces!.name || "—",
        role: m.role,
        isOwn: m.role === "admin",
      }))
      .sort((a, b) => {
        // Próprio workspace primeiro
        if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [memberships]);

  // Não mostrar o switcher se o usuário só tem 1 contexto
  if (isLoading) {
    return (
      <Button variant="ghost" size="sm" className="h-9 md:h-8 px-2 gap-1.5 text-muted-foreground" disabled>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </Button>
    );
  }
  if (items.length <= 1) {
    if (!workspaceName) return null;
    return (
      <div className="hidden md:flex items-center gap-1.5 px-2 h-8 rounded-md text-xs text-muted-foreground/80">
        <Building2 className="h-3.5 w-3.5" />
        <span className="max-w-[160px] truncate">{workspaceName}</span>
      </div>
    );
  }

  const handleSwitch = (id: string) => {
    if (id === workspaceId) return;
    localStorage.setItem("selected_workspace_id", id);
    // Limpa qualquer pick contextual por módulo (sessionStorage ctx_ws::*)
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("ctx_ws::"))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch {}
    // Invalida todo o cache para releitura contextualizada
    queryClient.clear();
    // Recarrega para garantir que providers e contextos (workspace, role,
    // permissões, billing, etc.) sejam reinicializados de forma consistente.
    window.location.reload();
  };

  const currentLabel = workspaceName || t("ws.picker.select", "Selecionar contexto");
  const currentRoleLabel = myRole ? ROLE_LABEL[myRole] || myRole : "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 md:h-8 px-2 sm:px-2.5 gap-1.5 text-xs text-foreground/90 hover:text-foreground hover:bg-accent/50 border border-border/40 rounded-md max-w-[60vw]"
        >
          <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate font-medium max-w-[140px] sm:max-w-[200px]">{currentLabel}</span>
          {currentRoleLabel && (
            <span className={cn("hidden sm:inline text-[10px] uppercase tracking-wider opacity-70", myRole ? ROLE_TONE[myRole] : "")}>
              · {currentRoleLabel}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="z-[1002] w-[min(92vw,320px)] glass-panel border-border/60 p-1"
      >
        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/70 px-3 pt-2 pb-1">
          Selecionar ambiente operacional
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-1" />
        <div className="max-h-[60vh] overflow-y-auto">
          {items.map((it) => {
            const active = it.id === workspaceId;
            return (
              <DropdownMenuItem
                key={it.id}
                onClick={() => handleSwitch(it.id)}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer text-xs",
                  active && "bg-primary/10",
                )}
              >
                <div className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                  active ? "border-primary/40 bg-primary/15 text-primary" : "border-border/50 bg-muted/30 text-muted-foreground",
                )}>
                  <Building2 className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-foreground">{it.name}</span>
                    {it.isOwn && (
                      <span className="text-[9px] uppercase tracking-wider text-amber-400/80 border border-amber-400/30 rounded px-1 py-px">
                        próprio
                      </span>
                    )}
                  </div>
                  <div className={cn("text-[10px] uppercase tracking-wider mt-0.5", ROLE_TONE[it.role] || "text-muted-foreground")}>
                    {ROLE_LABEL[it.role] || it.role}
                  </div>
                </div>
                {active && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </DropdownMenuItem>
            );
          })}
        </div>
        <DropdownMenuSeparator className="my-1" />
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground/70 leading-relaxed">
          Trocar de contexto altera permissões, OS, OP, financeiro e dashboards.
          Sua identidade é a mesma em todos os ambientes.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
