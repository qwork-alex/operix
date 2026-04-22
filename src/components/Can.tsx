import { useCan } from "@/hooks/usePermission";

interface CanProps {
  /** Permission key in "module.action" format, e.g. "service_orders.create" */
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Tiny permission gate for buttons / sections.
 * Uses the single `can()` resolver — no role logic.
 */
export function Can({ permission, children, fallback = null }: CanProps) {
  const { can, isLoading } = useCan();
  const [module, action] = permission.split(".");
  if (isLoading) return null;
  if (!can(module, action).allowed) return <>{fallback}</>;
  return <>{children}</>;
}
