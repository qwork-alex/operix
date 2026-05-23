import { Mail, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  useIncomingInvites, useAcceptInvite, useRejectInvite,
} from "@/hooks/useWorkspaceInvites";

export function IncomingInvitesButton() {
  const { data: invites = [], isLoading } = useIncomingInvites();
  const accept = useAcceptInvite();
  const reject = useRejectInvite();

  if (!isLoading && invites.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 md:h-8 md:w-8 text-muted-foreground hover:text-foreground"
          aria-label="Convites recebidos"
        >
          <Mail className="h-4 w-4" />
          {invites.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {invites.length > 9 ? "9+" : invites.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[1002] bg-card border-border w-[calc(100vw-1.5rem)] max-w-80 p-0">
        <div className="px-3 py-2">
          <span className="text-sm font-semibold text-foreground">Convites de workspace</span>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : invites.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Sem convites pendentes</div>
          ) : (
            invites.map((inv) => (
              <div key={inv.id} className="flex flex-col gap-2 px-3 py-3 border-b border-border/50 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {inv.workspace_name || "Workspace"}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Convite para entrar como{" "}
                      <Badge variant="outline" className="text-[9px] uppercase ml-0.5">{inv.role}</Badge>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-8 flex-1 text-xs"
                    onClick={() => accept.mutate(inv.id)}
                    disabled={accept.isPending || reject.isPending}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Aceitar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 text-xs"
                    onClick={() => reject.mutate(inv.id)}
                    disabled={accept.isPending || reject.isPending}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Recusar
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
