/**
 * Phase 5 — PermissionGate
 *
 * Lightweight permission wrapper for inline UI fragments.
 * Supports `any` and `all` semantics, plus a `fallback` slot.
 * Mirrors `usePermission` resolution (single source of truth).
 */
import { ReactNode } from "react";
import { usePermissions, useCan } from "@/hooks/usePermission";

interface PermissionGateProps {
  /** "module.action" or array of them. */
  permission: string | string[];
  /** When multiple keys are given, require all (default) or any. */
  mode?: "all" | "any";
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGate({
  permission,
  mode = "all",
  children,
  fallback = null,
}: PermissionGateProps) {
  const keys = Array.isArray(permission) ? permission : [permission];
  const { can } = useCan();
  const bulk = usePermissions(keys);
  if (bulk.isLoading) return null;
  const allowed =
    mode === "all"
      ? keys.every((k) => {
          const [m, a] = k.split(".");
          return can(m, a).allowed;
        })
      : keys.some((k) => {
          const [m, a] = k.split(".");
          return can(m, a).allowed;
        });
  return allowed ? <>{children}</> : <>{fallback}</>;
}
