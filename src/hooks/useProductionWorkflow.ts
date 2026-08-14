import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { WorkflowStatus } from "@/lib/productionWorkflowStatus";

export type ProductionListCardData = {
  listName: string;
  status: WorkflowStatus;
  clientId: string | null;
  clientName: string | null;
  operationalUnit: string | null;
  technicianId: string | null;
  technicianName: string | null;
  year: number;
  week: number;
  itemCount: number;
  totalValue: number;
};

export type ProductionListItem = {
  id: string;
  clientName: string | null;
  platform: string | null;
  technicianName: string | null;
  week: number;
  carName: string | null;
  licensePlate: string | null;
  services: { name: string; price: number }[];
  total: number | null;
};

export type ProductionWorkflowFilters = {
  year?: number;
  clientId?: string;
  operationalUnit?: string;
  technicianId?: string;
};

function buildQueryString(filters: ProductionWorkflowFilters, workspaceId: string | null): string {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspace_id", workspaceId);
  if (filters.year) params.set("year", String(filters.year));
  if (filters.clientId) params.set("clientId", filters.clientId);
  if (filters.operationalUnit) params.set("operationalUnit", filters.operationalUnit);
  if (filters.technicianId) params.set("technicianId", filters.technicianId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

const PRODUCTION_WORKFLOW_LISTS_KEY = "production-workflow-lists";

export function useProductionLists(filters: ProductionWorkflowFilters) {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: [PRODUCTION_WORKFLOW_LISTS_KEY, workspaceId, filters],
    enabled: !!workspaceId,
    queryFn: async () => {
      const data = await apiRequest<{ lists: ProductionListCardData[] }>(
        `/production-workflow/lists${buildQueryString(filters, workspaceId)}`,
      );
      return data.lists;
    },
    // Poll for changes made by other users — no push/WebSocket infra exists (research.md R6).
    refetchInterval: 15_000,
    placeholderData: (previousData) => previousData,
  });
}

export function useProductionListItems(listName: string | null) {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: ["production-workflow-list-items", workspaceId, listName],
    enabled: !!listName,
    queryFn: async () => {
      const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : "";
      const data = await apiRequest<{ listName: string; items: ProductionListItem[] }>(
        `/production-workflow/lists/${encodeURIComponent(listName as string)}/items${qs}`,
      );
      return data.items;
    },
  });
}

export function useMoveProductionList() {
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  return useMutation({
    mutationFn: async ({ listName, toStatus }: { listName: string; toStatus: WorkflowStatus }) => {
      return apiRequest<{ listName: string; status: WorkflowStatus }>(
        `/production-workflow/lists/${encodeURIComponent(listName)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toStatus, workspace_id: workspaceId }),
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PRODUCTION_WORKFLOW_LISTS_KEY] });
    },
  });
}
