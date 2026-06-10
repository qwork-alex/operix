import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useWorkspace } from "./useWorkspace";
import type { SubscriptionSnapshot } from "./useSubscription";
import type { WorkspaceAccessState } from "./useWorkspaceAccess";
import type { WorkspaceStripeLink } from "./useWorkspaceStripeSync";

export interface WorkspaceBillingContextPayload {
  snapshot: SubscriptionSnapshot;
  access: WorkspaceAccessState;
  stripe: WorkspaceStripeLink;
}

export function useWorkspaceBillingContext() {
  const { workspaceId } = useWorkspace();

  return useQuery({
    queryKey: ["workspace-billing-context", workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<WorkspaceBillingContextPayload | null> => {
      if (!workspaceId) {
        return null;
      }

      return apiRequest<WorkspaceBillingContextPayload>(`/workspaces/${workspaceId}/billing-context`);
    },
  });
}
