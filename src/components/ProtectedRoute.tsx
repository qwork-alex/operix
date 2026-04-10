import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

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

  // If user has a pending invite token, redirect to /join to apply it
  const storedInviteToken = localStorage.getItem("invite_token") || sessionStorage.getItem("invite_token");
  if (storedInviteToken && location.pathname !== "/join") {
    return <Navigate to={`/join?token=${storedInviteToken}`} replace />;
  }

  return <>{children}</>;
}
