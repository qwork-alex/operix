import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, degraded, recoverSession } = useAuth();
  const location = useLocation();

  useEffect(() => {
    console.log("[MOUNT] ProtectedRoute");
    return () => console.log("[UNMOUNT] ProtectedRoute");
  }, []);

  // Auth degradado (GoTrue 504 storm): nunca prender a UI.
  if (degraded && !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6 px-6 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground text-2xl">
          Q
        </div>
        <div className="max-w-md space-y-2">
          <h1 className="text-lg font-semibold text-foreground">
            Tivemos um problema temporário ao restaurar sua sessão.
          </h1>
          <p className="text-sm text-muted-foreground">
            Faça login novamente para continuar. Seus dados estão seguros.
          </p>
        </div>
        <Button onClick={recoverSession}>Entrar novamente</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground text-2xl">
          Q
        </div>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading QWork Nexus…</p>
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;

  // Force password change on first login
  const mustChange = session.user?.user_metadata?.must_change_password === true;
  if (mustChange && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}
