import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RotateCcw, Eye } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useInvalidatePermissions } from "@/hooks/usePermission";

interface UserPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  userName?: string;
  userRole?: string;
}

type PermissionRow = { id: string; module: string; action: string };

/** Fixed module order + display labels (UI-only). */
const MODULE_ORDER: { module: string; label: string }[] = [
  { module: "dashboard", label: "Painel" },
  { module: "service_orders", label: "Ordens de serviço" },
  { module: "payment_orders", label: "Ordens de pagamento" },
  { module: "financial", label: "Financeiro" },
  { module: "fleet", label: "Frota" },
  { module: "documents", label: "Documentos" },
  { module: "users", label: "Usuários" },
];

const CORE_ACTIONS = ["view", "create", "edit", "delete"] as const;
const ACTION_LABEL: Record<string, string> = {
  view: "Ver",
  create: "Criar",
  edit: "Editar",
  delete: "Apagar",
};

export function UserPermissionsDialog({
  open,
  onOpenChange,
  userId,
  userName,
  userRole,
}: UserPermissionsDialogProps) {
  const queryClient = useQueryClient();
  const invalidatePerms = useInvalidatePermissions();

  const { data: permissions = [], isLoading: loadingPerms } = useQuery({
    queryKey: ["permissions-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permissions")
        .select("id, module, action")
        .order("module")
        .order("action");
      if (error) throw error;
      return (data || []) as PermissionRow[];
    },
    enabled: open,
  });

  const { data: rolePerms = [] } = useQuery({
    queryKey: ["role-permissions-for-user", userRole],
    queryFn: async () => {
      if (!userRole) return [];
      const { data, error } = await supabase
        .from("role_permissions")
        .select("permission_id")
        .eq("role", userRole as any);
      if (error) throw error;
      return (data || []).map((r: any) => r.permission_id as string);
    },
    enabled: open && !!userRole,
  });

  const { data: overrides = [], isLoading: loadingOv } = useQuery({
    queryKey: ["user-permissions", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("user_permissions")
        .select("permission_id, allow")
        .eq("user_id", userId);
      if (error) throw error;
      return (data || []) as { permission_id: string; allow: boolean }[];
    },
    enabled: open && !!userId,
  });

  const { data: settings } = useQuery({
    queryKey: ["user-settings", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("user_settings")
        .select("can_view_other_users")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? { can_view_other_users: false }) as { can_view_other_users: boolean };
    },
    enabled: open && !!userId,
  });

  const updateSettingMutation = useMutation({
    mutationFn: async (patch: { can_view_other_users: boolean }) => {
      if (!userId) return;
      const { error } = await supabase
        .from("user_settings")
        .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings", userId] });
      invalidatePerms();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  /** permission_id -> effective boolean (override wins, else role default) */
  const effective = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const id of rolePerms) map[id] = true;
    for (const o of overrides) map[o.permission_id] = o.allow;
    return map;
  }, [rolePerms, overrides]);

  /** module -> { action -> permission row } */
  const byModule = useMemo(() => {
    const m: Record<string, Record<string, PermissionRow>> = {};
    for (const p of permissions) {
      if (!m[p.module]) m[p.module] = {};
      m[p.module][p.action] = p;
    }
    return m;
  }, [permissions]);

  const toggleMutation = useMutation({
    mutationFn: async ({ permissionId, next }: { permissionId: string; next: boolean }) => {
      if (!userId) return;
      const { error } = await supabase
        .from("user_permissions")
        .upsert(
          { user_id: userId, permission_id: permissionId, allow: next },
          { onConflict: "user_id,permission_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-permissions", userId] });
      invalidatePerms();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const bulkToggleMutation = useMutation({
    mutationFn: async ({ ids, next }: { ids: string[]; next: boolean }) => {
      if (!userId || ids.length === 0) return;
      const rows = ids.map((permission_id) => ({ user_id: userId, permission_id, allow: next }));
      const { error } = await supabase
        .from("user_permissions")
        .upsert(rows, { onConflict: "user_id,permission_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-permissions", userId] });
      invalidatePerms();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const resetAllMutation = useMutation({
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase.from("user_permissions").delete().eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-permissions", userId] });
      invalidatePerms();
      toast.success("Permissões repostas aos padrões da função.");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const isAdminUser = userRole === "admin";
  const loading = loadingPerms || loadingOv;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm">Permissões — {userName || "Utilizador"}</div>
              <div className="text-[11px] text-muted-foreground font-normal mt-0.5">
                Função: <span className="font-mono">{userRole || "—"}</span> · Overrides têm prioridade sobre os padrões da função.
              </div>
            </div>
            {!isAdminUser && overrides.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => resetAllMutation.mutate()}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Repor padrões
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {isAdminUser ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Administradores têm sempre acesso total — não é possível restringir.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Visibility */}
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <Switch
                  checked={!!settings?.can_view_other_users}
                  onCheckedChange={(v) => updateSettingMutation.mutate({ can_view_other_users: v })}
                />
                <div className="flex-1">
                  <div className="text-sm flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5 text-primary" />
                    Ver outros utilizadores
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Permite listar outros utilizadores do workspace atual.
                  </div>
                </div>
              </label>
            </div>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {MODULE_ORDER.map(({ module, label }) => {
                  const actions = byModule[module];
                  if (!actions) return null;
                  const coreIds = CORE_ACTIONS
                    .map((a) => actions[a]?.id)
                    .filter(Boolean) as string[];
                  if (coreIds.length === 0) return null;
                  const allOn = coreIds.every((id) => effective[id]);

                  return (
                    <div
                      key={module}
                      className="rounded-lg border border-border/60 bg-background/40 p-3"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold text-foreground">{label}</div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <span className="text-[11px] text-muted-foreground">Permissão total</span>
                          <Switch
                            checked={allOn}
                            onCheckedChange={(v) =>
                              bulkToggleMutation.mutate({ ids: coreIds, next: Boolean(v) })
                            }
                          />
                        </label>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {CORE_ACTIONS.map((action) => {
                          const perm = actions[action];
                          if (!perm) return null;
                          const on = !!effective[perm.id];
                          return (
                            <label
                              key={perm.id}
                              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md border transition-colors cursor-pointer ${
                                on
                                  ? "border-primary/40 bg-primary/5"
                                  : "border-border/40 hover:bg-muted/30"
                              }`}
                            >
                              <span className="text-xs">{ACTION_LABEL[action]}</span>
                              <Switch
                                checked={on}
                                onCheckedChange={(v) =>
                                  toggleMutation.mutate({ permissionId: perm.id, next: Boolean(v) })
                                }
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
