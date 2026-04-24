import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RotateCcw, Eye, Globe2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { PermissionsMatrix, type PermissionRow } from "./PermissionsMatrix";
import { useInvalidatePermissions } from "@/hooks/usePermission";

interface UserPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  userName?: string;
  userRole?: string; // db role: admin/partner/technician/client
}

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
        .select("id, module, action, label")
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

  const inherited = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const id of rolePerms) map[id] = true;
    return map;
  }, [rolePerms]);

  const values = useMemo(() => {
    const map: Record<string, boolean | null> = {};
    for (const o of overrides) map[o.permission_id] = o.allow;
    return map;
  }, [overrides]);

  const toggleMutation = useMutation({
    mutationFn: async ({
      permissionId,
      next,
    }: {
      permissionId: string;
      next: boolean | null;
    }) => {
      if (!userId) return;
      if (next === null) {
        const { error } = await supabase
          .from("user_permissions")
          .delete()
          .eq("user_id", userId)
          .eq("permission_id", permissionId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_permissions")
          .upsert(
            { user_id: userId, permission_id: permissionId, allow: next },
            { onConflict: "user_id,permission_id" },
          );
        if (error) throw error;
      }
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
      const { error } = await supabase
        .from("user_permissions")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-permissions", userId] });
      invalidatePerms();
      toast.success("Overrides removidos. O utilizador volta aos defaults da função.");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const isAdminUser = userRole === "admin";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm">Permissões — {userName || "Utilizador"}</div>
              <div className="text-[11px] text-muted-foreground font-normal mt-0.5">
                Função: <span className="font-mono">{userRole || "—"}</span>
                {" · "}
                Os overrides têm prioridade sobre os defaults da função.
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
                Limpar overrides
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {isAdminUser ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Administradores têm sempre acesso total — não é possível restringir.
          </div>
        ) : (
          <PermissionsMatrix
            permissions={permissions}
            values={values}
            inherited={inherited}
            isLoading={loadingPerms || loadingOv}
            showInheritColumn
            onToggle={(permissionId, next) =>
              toggleMutation.mutate({ permissionId, next })
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
