import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  // When impersonating, resolve the role of the target user so the whole UI
  // (sidebar, guards, dashboards) reflects what they see.
  const lookupId = isImpersonating ? effectiveUserId : user?.id;

  const { data: dbRole = null, isLoading } = useQuery({
    queryKey: ["my-role", lookupId, isImpersonating],
    enabled: !!lookupId,
    retry: 0,
    staleTime: 60_000,
    queryFn: async () => {
      // Hard timeout — never let the boot deadlock if the DB is slow.
      const fetchRole = (async () => {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", lookupId!)
          .maybeSingle();
        if (error) {
          console.error("[useRole] Error fetching role:", error);
          return null;
        }
        return (data?.role as AppRole) ?? null;
      })();
      const timeout = new Promise<null>((resolve) =>
        setTimeout(() => {
          console.warn("[useRole] timeout — proceeding with null role");
          resolve(null);
        }, 4000),
      );
      return Promise.race([fetchRole, timeout]);
    },
  });

  const role = dbRole ? (ROLE_MAP[dbRole] as DisplayRole) : null;
  const isAdmin = dbRole === "admin";

  return (
    <RoleCtx.Provider value={{ dbRole, role, isAdmin, isLoading }}>
      {children}
    </RoleCtx.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleCtx);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}
