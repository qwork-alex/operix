import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";

interface Props {
  /** Required permission level. */
  require: "create" | "edit" | "export" | "operational";
  /** Children to render when allowed. */
  children: ReactNode;
  /** Render this instead of the default denial card. */
  fallback?: ReactNode;
  /** If true, render nothing instead of a denial message when blocked. */
  hideWhenBlocked?: boolean;
}

/**
 * Gates UI based on workspace subscription access state.
 *
 * `operational` is blocked when access_mode is `billing_only` or `locked`.
 * Other actions defer to the per-action flags from `get_workspace_access_state`.
 */
export function AccessGuard({ require, children, fallback, hideWhenBlocked }: Props) {
  const a = useWorkspaceAccess();
  if (a.isLoading) return <>{children}</>;

  let allowed = true;
  if (require === "operational") {
    allowed = a.access_mode === "full" || a.access_mode === "readonly";
  } else if (require === "create") {
    allowed = a.can_create;
  } else if (require === "edit") {
    allowed = a.can_edit;
  } else if (require === "export") {
    allowed = a.can_export;
  }

  if (allowed) return <>{children}</>;
  if (hideWhenBlocked) return null;
  if (fallback) return <>{fallback}</>;

  const Icon = a.legal_hold || a.access_mode === "locked" ? Lock : ShieldAlert;
  return (
    <Card className="p-8 text-center surface-card border-amber-500/30 bg-amber-500/5">
      <Icon className="h-8 w-8 mx-auto mb-3 text-amber-500" />
      <h3 className="text-sm font-semibold mb-1">Acção bloqueada pela subscrição</h3>
      <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
        {a.legal_hold
          ? "Esta workspace está sob bloqueio legal. Os dados estão preservados mas as operações estão desactivadas."
          : a.access_mode === "billing_only"
          ? "Apenas a área de faturação está acessível. Regularize a subscrição para retomar as operações."
          : "A sua subscrição está em modo só leitura. Regularize o pagamento para criar ou editar registos."}
      </p>
      {a.can_access_billing ? (
        <Button asChild size="sm">
          <Link to="/subscription">Ir para Assinatura</Link>
        </Button>
      ) : null}
    </Card>
  );
}
