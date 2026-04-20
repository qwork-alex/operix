import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield } from "lucide-react";
import { PermissionsMatrix, type PermissionRow } from "./PermissionsMatrix";
import { useInvalidatePermissions } from "@/hooks/usePermission";

type DbRole = "admin" | "partner" | "technician" | "client";

const ROLE_TABS: { key: DbRole; label: string }[] = [
  { key: "partner", label: "Sócio" },
  { key: "technician", label: "Técnico" },
  { key: "client", label: "Cliente" },
];

export function RolePermissionsManager() {
  const queryClient = useQueryClient();
  const invalidatePerms = useInvalidatePermissions();
  const [activeRole, setActiveRole] = useState<DbRole>("partner");

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
  });

  const { data: rolePerms = [], isLoading: loadingRolePerms } = useQuery({
    queryKey: ["role-permissions", activeRole],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("permission_id")
        .eq("role", activeRole);
      if (error) throw error;
      return (data || []).map((r: any) => r.permission_id as string);
    },
  });

  const values = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const id of rolePerms) map[id] = true;
    return map;
  }, [rolePerms]);

  const toggleMutation = useMutation({
    mutationFn: async ({ permissionId, next }: { permissionId: string; next: boolean }) => {
      if (next) {
        const { error } = await supabase
          .from("role_permissions")
          .insert({ role: activeRole as any, permission_id: permissionId });
        if (error && !error.message.includes("duplicate")) throw error;
      } else {
        const { error } = await supabase
          .from("role_permissions")
          .delete()
          .eq("role", activeRole)
          .eq("permission_id", permissionId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-permissions", activeRole] });
      invalidatePerms();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Shield className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Permissões por Função</h2>
          <p className="text-[11px] text-muted-foreground">
            Define o que cada função pode fazer por defeito. Admin tem sempre acesso total.
          </p>
        </div>
      </div>

      <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as DbRole)}>
        <TabsList>
          {ROLE_TABS.map((r) => (
            <TabsTrigger key={r.key} value={r.key} className="text-xs">{r.label}</TabsTrigger>
          ))}
        </TabsList>
        {ROLE_TABS.map((r) => (
          <TabsContent key={r.key} value={r.key} className="mt-4">
            <PermissionsMatrix
              permissions={permissions}
              values={values}
              isLoading={loadingPerms || loadingRolePerms}
              onToggle={(permissionId, next) =>
                toggleMutation.mutate({ permissionId, next: Boolean(next) })
              }
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
