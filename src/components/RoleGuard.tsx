import { Navigate } from "react-router-dom";
import { useRole, type DisplayRole } from "@/hooks/useRole";
import { Loader2 } from "lucide-react";

interface RoleGuardProps {
  allowedRoles: DisplayRole[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { role, isLoading } = useRole();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!role) return <>{children}</>;

  if (!allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
