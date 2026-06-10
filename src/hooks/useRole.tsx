import { createContext, useContext, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "./useAuth";
import { useImpersonation } from "./useImpersonation";

// app_role enum: admin, partner, technician, client
// We map to display keys used in the app
export type AppRole = "admin" | "partner" | "technician" | "client";

// Map from DB enum to sidebar/RoleGuard keys used in codebase
const ROLE_MAP: Record<AppRole, string> = {
  admin: "admin",
  partner: "socio",
  technician: "tecnico",
  client: "cliente",
};

// Reverse map for DB operations
export const DISPLAY_TO_DB: Record<string, AppRole> = {
  admin: "admin",
  socio: "partner",
  tecnico: "technician",
  cliente: "client",
};

export type DisplayRole = "admin" | "tecnico" | "cliente" | "socio";

interface RoleContext {
  dbRole: AppRole | null;
  role: DisplayRole | null;
  isAdmin: boolean;
  isLoading: boolean;
}

const RoleCtx = createContext<RoleContext | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { effectiveUserId, isImpersonating } = useImpersonation();
  useEffect(() => {
    console.log("[MOUNT] RoleProvider");
    return () => console.log("[UNMOUNT] RoleProvider");
  }, []);
  // When impersonating, resolve the role of the target user so the whole UI
  // (sidebar, guards, dashboards) reflects what they see.
  const lookupId = isImpersonating ? effectiveUserId : user?.id;

  const { data: dbRole = null, isLoading } = useQuery({
    queryKey: ["my-role", lookupId, isImpersonating],
    enabled: !!lookupId,
    retry: 0,
    staleTime: 60_000,
    queryFn: async () => {
      const suffix = lookupId ? `?userId=${encodeURIComponent(lookupId)}` : "";
      const data = await apiRequest<{ role: AppRole | null }>(`/account/role${suffix}`);
      return data.role ?? null;
    },
  });

  // Platform owner safety net — the master account ALWAYS resolves as admin,
  // even if the user_roles row is missing, the query is slow, or the timeout
  // fired. This prevents the owner from ever losing dashboard/admin access.
  const OWNER_EMAILS = ["qwork@qworkgroup.com"];
  const isOwnerEmail =
    !!user?.email && OWNER_EMAILS.includes(user.email.toLowerCase());

  const effectiveDbRole: AppRole | null = isOwnerEmail ? "admin" : dbRole;
  const role = effectiveDbRole ? (ROLE_MAP[effectiveDbRole] as DisplayRole) : null;
  const isAdmin = effectiveDbRole === "admin";

  return (
    <RoleCtx.Provider
      value={{ dbRole: effectiveDbRole, role, isAdmin, isLoading: isOwnerEmail ? false : isLoading }}
    >
      {children}
    </RoleCtx.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleCtx);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}
