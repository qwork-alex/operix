/**
 * Phase 5 — RoleGuard
 *
 * Hide / replace UI based on the user's role in the active tenant.
 * Complements <PermissionGuard /> (which checks fine-grained module.action).
 */
import { ReactNode } from "react";
import { useTenant } from "@/contexts/TenantContext";
import type { DisplayRole } from "@/hooks/useRole";

export type RoleKey =
  | "platform_owner"
  | "workspace_owner"
  | "admin"
  | "manager"
  | "technician"
  | "financial"
  | "client"
  | "readonly";

/** Map the abstract role taxonomy → concrete DisplayRole used by useRole(). */
const ROLE_TO_DISPLAY: Record<RoleKey, DisplayRole | "owner"> = {
  platform_owner: "owner" as any,
  workspace_owner: "admin",
  admin: "admin",
  manager: "admin",
  technician: "tecnico",
  financial: "socio",
  client: "cliente",
  readonly: "cliente",
};

interface RoleGuardProps {
  allow: RoleKey | RoleKey[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function RoleGuard({ allow, children, fallback = null }: RoleGuardProps) {
  const { role, isPlatformOwner, isLoading } = useTenant();
  if (isLoading) return null;
  const allowed = Array.isArray(allow) ? allow : [allow];

  // Platform owner always passes.
  if (isPlatformOwner) return <>{children}</>;
  if (allowed.includes("platform_owner")) return <>{fallback}</>;

  if (!role) return <>{fallback}</>;
  const matches = allowed.some((k) => ROLE_TO_DISPLAY[k] === role);
  return matches ? <>{children}</> : <>{fallback}</>;
}
