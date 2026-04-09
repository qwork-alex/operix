import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Building2, ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface WsOption {
  workspaceId: string;
  workspaceName: string;
  role: string;
  isOwner: boolean;
}

export function WorkspaceSelector({ currentWorkspaceId }: { currentWorkspaceId: string | null }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: workspaces = [] } = useQuery({
    queryKey: ["all-user-workspaces", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: appUser } = await supabase
        .from("app_users")
        .select("id")
        .eq("auth_user_id", user?.id ?? "")
        .maybeSingle();
      if (!appUser) return [];

      const { data: memberships } = await supabase
        .from("memberships")
        .select("workspace_id, role, workspaces(id, name, owner_user_id)")
        .eq("user_id", appUser.id)
        .eq("status", "active");

      return (memberships || []).map((m: any) => ({
        workspaceId: m.workspace_id,
        workspaceName: m.workspaces?.name || "Workspace",
        role: m.role,
        isOwner: m.workspaces?.owner_user_id === appUser.id,
      })) as WsOption[];
    },
  });

  if (workspaces.length <= 1) return null;

  const current = workspaces.find((w) => w.workspaceId === currentWorkspaceId);

  const roleLabel: Record<string, string> = {
    admin: "Admin",
    tecnico: "Técnico",
    cliente: "Cliente",
    socio: "Sócio",
  };

  const switchWorkspace = (wsId: string) => {
    // Store selected workspace and invalidate queries to reload
    localStorage.setItem("selected_workspace_id", wsId);
    queryClient.invalidateQueries({ queryKey: ["my-workspace"] });
    queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
    window.location.reload();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground max-w-[200px]">
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{current?.workspaceName || "Workspace"}</span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 bg-card border-border">
        {workspaces.map((ws) => (
          <DropdownMenuItem
            key={ws.workspaceId}
            className="flex items-center justify-between cursor-pointer"
            onClick={() => switchWorkspace(ws.workspaceId)}
          >
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate">{ws.workspaceName}</span>
              <span className="text-[10px] text-muted-foreground">
                {ws.isOwner ? "Owner" : roleLabel[ws.role] || ws.role}
              </span>
            </div>
            {ws.workspaceId === currentWorkspaceId && (
              <Check className="h-4 w-4 text-primary shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
