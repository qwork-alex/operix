import { usePermission } from "@/hooks/usePermission";

interface CanProps {
  /** Permission key in "module.action" format, e.g. "service_orders.create" */
  permission: string;
  children: React.ReactNode;
  /** When false (default), missing permission renders nothing.
   *  When true, renders children but they should already be disabled via `disabledIfDenied`. */
  fallback?: React.ReactNode;
}

/**
 * Tiny permission gate for buttons / sections.
 * Hides children when the user doesn't have the given permission.
 * Admins always pass.
 */
export function Can({ permission, children, fallback = null }: CanProps) {
  const { allowed, isLoading } = usePermission(permission);
  if (isLoading) return null;
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
