import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useImpersonation } from "@/hooks/useImpersonation";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Sticky banner shown while an admin is viewing the app as another user.
 * Renders nothing when not impersonating.
 */
export function ImpersonationBanner() {
  const { target, isImpersonating, stopImpersonation } = useImpersonation();
  const qc = useQueryClient();

  if (!isImpersonating || !target) return null;

  const handleExit = async () => {
    await stopImpersonation();
    // Force every query to refetch with the real user identity
    await qc.invalidateQueries();
  };

  return (
    <div
      role="alert"
      className="relative flex items-center justify-between gap-3 border-b border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-500/15 px-4 py-2 text-amber-100"
      style={{ boxShadow: "0 0 24px hsl(45 100% 50% / 0.15)" }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/25">
          <Eye className="h-3.5 w-3.5 text-amber-300" />
        </div>
        <div className="text-xs leading-tight min-w-0">
          <span className="font-semibold uppercase tracking-wider text-[10px] text-amber-300 mr-2">
            Modo visualização
          </span>
          <span className="text-amber-100">
            A ver como{" "}
            <strong className="font-semibold">
              {target.fullName || target.email}
            </strong>
            <span className="text-amber-200/70"> · {target.role}</span>
          </span>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleExit}
        className="h-7 shrink-0 border-amber-400/50 bg-amber-500/10 text-amber-100 hover:bg-amber-500/25 hover:text-white"
      >
        <X className="h-3 w-3 mr-1" />
        Sair da visualização
      </Button>
    </div>
  );
}
