import { Navigate } from "react-router-dom";
import { useWorkspace, MembershipRole } from "@/hooks/useWorkspace";
import { Loader2 } from "lucide-react";

interface RoleGuardProps {
  allowedRoles: MembershipRole[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { myRole, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // If no role yet (workspace not loaded), allow access (will be filtered by queries)
  if (!myRole) return <>{children}</>;

  if (!allowedRoles.includes(myRole)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
