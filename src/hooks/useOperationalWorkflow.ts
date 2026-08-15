import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useWorkspace } from "./useWorkspace";

export type OperationalWorkflowStatus =
  | "em_elaboracao"
  | "em_producao"
  | "weeklog_em_aberto"
  | "aguardando_assinatura"
  | "aguardando_aprovacao"
  | "correcao_necessaria"
  | "aprovado"
  | "aguardando_ordem_lista"
  | "aguardando_pagamento"
  | "pago"
  | "encerrado";

export interface WorkflowItem {
  id: string;
  origin: "production_weeklog" | "weeklog_only" | "payment_only";

  production_order_id: string | null;
  production_code: string | null;
  production_status: string | null;
  production_delivered_at: string | null;

  service_order_id: string | null;
  week: string | null;
  week_number: number | null;
  year_reference: number | null;

  payment_order_id: string | null;
  list_name: string | null;
  payment_status: string | null;

  client_name: string | null;
  technician_name: string | null;
  platform: string | null;
  operational_unit: string | null;

  brand: string | null;
  model: string | null;
  car_name: string | null;
  license_plate: string | null;
  vin: string | null;

  valor_total: number | null;
  valor_aprovado: number | null;
  valor_pago: number | null;
  valor_pendente: number | null;

  validation_situation: "oui" | "non" | null;
  validation_assinado: boolean;
  validation_retificativa: "none" | "partial" | "full" | null;

  status: OperationalWorkflowStatus;
  status_label: string;
  next_action: string;
  has_error: boolean;

  created_at: string;
}

export interface WorkflowSummary {
  count: number;
  valor_total: number;
  valor_aprovado: number;
  valor_pago: number;
  valor_pendente: number;
  by_status: Record<string, number>;
  aguardando_acao: number;
  com_erro: number;
}

export interface StatusMetaEntry {
  label: string;
  tone: string;
  dot: string;
  next_action: string;
}

export interface OperationalWorkflowFilters {
  year?: number;
  client?: string;
  operational_unit?: string;
  technician?: string;
  week?: string;
  status?: OperationalWorkflowStatus;
  pagamento?: "pago" | "pendente" | "none";
  origem?: "production_weeklog" | "weeklog_only" | "payment_only";
  search?: string;
  license_plate?: string;
}

export interface OperationalWorkflowResponse {
  items: WorkflowItem[];
  summary: WorkflowSummary;
  status_meta: Record<OperationalWorkflowStatus, StatusMetaEntry>;
  filters_applied: Record<string, unknown>;
}

function buildQueryString(workspaceId: string | null, f: OperationalWorkflowFilters): string {
  const p = new URLSearchParams();
  if (workspaceId) p.set("workspace_id", workspaceId);
  if (f.year) p.set("year", String(f.year));
  if (f.client?.trim()) p.set("client", f.client.trim());
  if (f.operational_unit?.trim()) p.set("local", f.operational_unit.trim());
  if (f.technician?.trim()) p.set("technician", f.technician.trim());
  if (f.week?.trim()) p.set("week", f.week.trim());
  if (f.status) p.set("status", f.status);
  if (f.pagamento) p.set("pagamento", f.pagamento);
  if (f.origem) p.set("origem", f.origem);
  if (f.search?.trim()) p.set("search", f.search.trim());
  if (f.license_plate?.trim()) p.set("license_plate", f.license_plate.trim());
  const q = p.toString();
  return q ? `?${q}` : "";
}

export function useOperationalWorkflow(filters: OperationalWorkflowFilters) {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: ["operational-workflow", workspaceId, filters],
    enabled: !!workspaceId,
    refetchInterval: 15_000,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<OperationalWorkflowResponse> => {
      const qs = buildQueryString(workspaceId ?? null, filters);
      return apiRequest<OperationalWorkflowResponse>(`/workflow${qs}`, {
        timeoutMs: 15_000,
      });
    },
  });
}
