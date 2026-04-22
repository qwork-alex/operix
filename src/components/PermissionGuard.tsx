import { Navigate } from "react-router-dom";
import { Loader2, ShieldOff } from "lucide-react";
import { useCan } from "@/hooks/usePermission";

interface PermissionGuardProps {
  permission: string;             // e.g. "financial.view"
  children: React.ReactNode;
  fallback?: "redirect" | "denied" | "hide";
  redirectTo?: string;
}

/**
 * Route/page guard — uses the SINGLE source-of-truth `can()` resolver.
 * No role checks. No fallback to legacy logic.
 */
export function PermissionGuard({
  permission,
  children,
  fallback = "denied",
  redirectTo = "/",
}: PermissionGuardProps) {
  const { can, isLoading } = useCan();
  const [module, action] = permission.split(".");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (can(module, action)) return <>{children}</>;

  if (fallback === "hide") return null;
  if (fallback === "redirect") return <Navigate to={redirectTo} replace />;

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-6">
      <div className="rounded-full bg-destructive/10 p-4 mb-4">
        <ShieldOff className="h-8 w-8 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-1">Acesso restrito</h2>
      <p className="text-sm text-muted-foreground max-w-md">
        Não tem permissão para visualizar este módulo. Contacte o administrador se precisar de acesso.
      </p>
      <p className="text-[11px] text-muted-foreground/60 mt-3 font-mono">required: {permission}</p>
    </div>
  );
}
