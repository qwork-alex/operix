/**
 * WorkspaceSwitcher — Context Switcher global no TopBar.
 *
 * Arquitetura: 1 auth, 1 UUID, 1 perfil global. O usuário pode
 * pertencer a múltiplos workspaces com papéis diferentes em cada um.
 * Este componente apenas TROCA o contexto ativo — nunca cria nova
 * conta nem altera identidade.
 *
 * Comunicação visual (sem mudança de arquitetura):
 *  • MASTER GLOBAL  → ambiente do dono da plataforma (isPlatformOwner)
 *  • PRÓPRIO         → workspace onde o usuário é admin/dono
 *  • CONVIDADO       → workspace de outro tenant onde foi convidado
 */
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Building2, Loader2, Crown, ShieldCheck, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useLanguage } from "@/hooks/useLanguage";
import { useTenant } from "@/contexts/TenantContext";
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
  const { isPlatformOwner } = useTenant();
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

  const { ownItems, guestItems } = useMemo(() => {
    const all = memberships
      .filter((m) => !!m.workspaces)
      .map((m) => ({
        id: m.workspace_id,
        name: m.workspaces!.name || "—",
        role: m.role,
        isOwn: m.role === "admin",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      ownItems: all.filter((i) => i.isOwn),
      guestItems: all.filter((i) => !i.isOwn),
    };
  }, [memberships]);

  const totalItems = ownItems.length + guestItems.length;

  if (isLoading) {
    return (
      <Button variant="ghost" size="sm" className="h-9 md:h-8 px-2 gap-1.5 text-muted-foreground" disabled>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </Button>
    );
  }

  // Single context AND not platform owner → show passive context pill
  if (totalItems <= 1 && !isPlatformOwner) {
    if (!workspaceName) return null;
    const isOwnSingle = myRole === "admin";
    return (
      <div className={cn(
        "hidden md:flex items-center gap-1.5 px-2 h-8 rounded-md text-xs border",
        isOwnSingle
          ? "border-amber-400/30 bg-amber-400/5 text-amber-200/90"
          : "border-border/40 bg-muted/20 text-muted-foreground/90",
      )}>
        {isOwnSingle ? <ShieldCheck className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
        <span className="max-w-[160px] truncate font-medium">{workspaceName}</span>
        <span className={cn(
          "text-[9px] uppercase tracking-wider px-1 py-px rounded border",
          isOwnSingle
            ? "border-amber-400/40 text-amber-300/90"
            : "border-border/40 text-muted-foreground/70",
        )}>
          {isOwnSingle ? "Próprio" : "Convidado"}
        </span>
      </div>
    );
  }

  const handleSwitch = (id: string) => {
    if (id === workspaceId) return;
    localStorage.setItem("selected_workspace_id", id);
    localStorage.removeItem("owner_global_mode");
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("ctx_ws::"))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch {}
    queryClient.clear();
    window.location.reload();
  };

  // ── Trigger state ────────────────────────────────────────────────
  // Classify active environment for visible feedback.
  const activeIsOwn = !!workspaceId && ownItems.some((i) => i.id === workspaceId);
  const activeIsGuest = !!workspaceId && guestItems.some((i) => i.id === workspaceId);

  const triggerKind: "master" | "own" | "guest" | "none" =
    !workspaceId && isPlatformOwner ? "master"
      : activeIsOwn ? "own"
      : activeIsGuest ? "guest"
      : "none";

  const triggerTone =
    triggerKind === "master"
      ? "border-amber-300/50 bg-gradient-to-r from-violet-500/15 via-fuchsia-500/10 to-amber-400/15 text-amber-100 hover:from-violet-500/25 hover:to-amber-400/25"
      : triggerKind === "own"
      ? "border-amber-400/40 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15"
      : triggerKind === "guest"
      ? "border-sky-400/40 bg-sky-500/10 text-sky-100 hover:bg-sky-500/15"
      : "border-border/40 text-foreground/90 hover:bg-accent/50";

  const triggerKindLabel =
    triggerKind === "master" ? "Proprietário"
      : triggerKind === "own" ? "Próprio"
      : triggerKind === "guest" ? "Convidado"
      : "";

  const TriggerIcon =
    triggerKind === "master" ? Crown
      : triggerKind === "own" ? ShieldCheck
      : triggerKind === "guest" ? UserPlus
      : Building2;

  const currentLabel =
    triggerKind === "master"
      ? "QWork Nexus Proprietário"
      : (workspaceName || t("ws.picker.select", "Selecionar contexto"));
  const currentRoleLabel = myRole ? ROLE_LABEL[myRole] || myRole : "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-9 md:h-8 px-2 sm:px-2.5 gap-1.5 text-xs border rounded-md max-w-[60vw] transition-colors",
            triggerTone,
          )}
        >
          <TriggerIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-semibold max-w-[140px] sm:max-w-[200px]">{currentLabel}</span>
          {triggerKindLabel && (
            <span className="hidden sm:inline text-[9px] uppercase tracking-widest opacity-80 border border-current/30 rounded px-1 py-px">
              {triggerKindLabel}
            </span>
          )}
          {triggerKind !== "master" && currentRoleLabel && (
            <span className={cn("hidden md:inline text-[10px] uppercase tracking-wider opacity-70", myRole ? ROLE_TONE[myRole] : "")}>
              · {currentRoleLabel}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="z-[1002] w-[min(92vw,340px)] glass-panel border-border/60 p-1"
      >
        {/* ── Master Global (only for platform owner) ───────────── */}
        {isPlatformOwner && (
          <>
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-amber-300/80 px-3 pt-2 pb-1 flex items-center gap-1.5">
              <Crown className="h-3 w-3" /> Proprietário global
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                // Modo proprietário puro: marca flag explícita e limpa contexto
                // operacional. O useWorkspace só retorna null quando essa flag
                // está ativa — evita auto-pick e mantém runtime operacional
                // ligado em modo normal.
                localStorage.setItem("owner_global_mode", "1");
                localStorage.removeItem("selected_workspace_id");
                try {
                  Object.keys(sessionStorage)
                    .filter((k) => k.startsWith("ctx_ws::"))
                    .forEach((k) => sessionStorage.removeItem(k));
                } catch {}
                queryClient.clear();
                window.location.assign("/platform-owner");
              }}
              className={cn(
                "flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer text-xs",
                triggerKind === "master" && "bg-gradient-to-r from-violet-500/10 to-amber-400/10",
              )}
            >
              <div className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                triggerKind === "master"
                  ? "border-amber-300/60 bg-gradient-to-br from-violet-500/20 to-amber-400/20 text-amber-200"
                  : "border-border/50 bg-muted/30 text-muted-foreground",
              )}>
                <Crown className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium text-foreground">QWork Nexus Proprietário</span>
                  <span className="text-[9px] uppercase tracking-wider text-amber-300/90 border border-amber-300/50 rounded px-1 py-px">
                    Global
                  </span>
                </div>
                <div className="text-[10px] uppercase tracking-wider mt-0.5 text-amber-200/70">
                  Governança · billing · cross-tenant
                </div>
              </div>
              {triggerKind === "master" && <Check className="h-3.5 w-3.5 text-amber-300 shrink-0" />}
            </DropdownMenuItem>
            {(ownItems.length + guestItems.length) > 0 && <DropdownMenuSeparator className="my-1" />}
          </>
        )}

        {/* ── Próprios ──────────────────────────────────────────── */}
        {ownItems.length > 0 && (
          <>
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-amber-300/80 px-3 pt-2 pb-1 flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3" /> Workspaces próprios
            </DropdownMenuLabel>
            <div className="max-h-[28vh] overflow-y-auto">
              {ownItems.map((it) => {
                const active = it.id === workspaceId && triggerKind !== "master";
                return (
                  <DropdownMenuItem
                    key={it.id}
                    onClick={() => handleSwitch(it.id)}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer text-xs",
                      active && "bg-amber-400/10",
                    )}
                  >
                    <div className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                      active
                        ? "border-amber-400/50 bg-amber-400/15 text-amber-300"
                        : "border-border/50 bg-muted/30 text-muted-foreground",
                    )}>
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-foreground">{it.name}</span>
                        <span className="text-[9px] uppercase tracking-wider text-amber-300/90 border border-amber-400/40 rounded px-1 py-px">
                          Próprio
                        </span>
                      </div>
                      <div className={cn("text-[10px] uppercase tracking-wider mt-0.5", ROLE_TONE[it.role] || "text-muted-foreground")}>
                        {ROLE_LABEL[it.role] || it.role}
                      </div>
                    </div>
                    {active && <Check className="h-3.5 w-3.5 text-amber-300 shrink-0" />}
                  </DropdownMenuItem>
                );
              })}
            </div>
          </>
        )}

        {/* ── Convidado ─────────────────────────────────────────── */}
        {guestItems.length > 0 && (
          <>
            {ownItems.length > 0 && <DropdownMenuSeparator className="my-1" />}
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-sky-300/80 px-3 pt-2 pb-1 flex items-center gap-1.5">
              <UserPlus className="h-3 w-3" /> Workspaces convidados
            </DropdownMenuLabel>
            <div className="max-h-[28vh] overflow-y-auto">
              {guestItems.map((it) => {
                const active = it.id === workspaceId && triggerKind !== "master";
                return (
                  <DropdownMenuItem
                    key={it.id}
                    onClick={() => handleSwitch(it.id)}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer text-xs",
                      active && "bg-sky-500/10",
                    )}
                  >
                    <div className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                      active
                        ? "border-sky-400/50 bg-sky-500/15 text-sky-300"
                        : "border-border/50 bg-muted/30 text-muted-foreground",
                    )}>
                      <Building2 className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-foreground">{it.name}</span>
                        <span className="text-[9px] uppercase tracking-wider text-sky-300/90 border border-sky-400/40 rounded px-1 py-px">
                          Convidado
                        </span>
                      </div>
                      <div className={cn("text-[10px] uppercase tracking-wider mt-0.5", ROLE_TONE[it.role] || "text-muted-foreground")}>
                        {ROLE_LABEL[it.role] || it.role}
                      </div>
                    </div>
                    {active && <Check className="h-3.5 w-3.5 text-sky-300 shrink-0" />}
                  </DropdownMenuItem>
                );
              })}
            </div>
          </>
        )}

        <DropdownMenuSeparator className="my-1" />
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground/70 leading-relaxed">
          {isPlatformOwner
            ? "Master = visão global da plataforma. Workspaces = ambientes operacionais isolados. Sua identidade é a mesma em todos."
            : "Trocar de contexto altera permissões, OS, OP, financeiro e dashboards. Sua identidade é a mesma em todos os ambientes."}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
