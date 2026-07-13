import { apiRequest } from "@/lib/api";

/**
 * Cliente REST do módulo Financeiro (Fase 2 — substitui Supabase).
 * Todas as chamadas têm timeout embutido via apiRequest — nunca loading infinito.
 */

/* ── financial_records ── */

export interface FinancialRecordApi {
  id: string;
  workspace_id: string | null;
  type: string;
  source: string;
  origin: string | null;
  category: string | null;
  label: string | null;
  amount: number;
  status: string;
  notes: string | null;
  reference_id: string | null;
  service_order_id: string | null;
  payment_order_id: string | null;
  assigned_user_id: string | null;
  vehicle_id: string | null;
  year_reference: number | null;
  created_at: string;
  updated_at: string;
}

export function listFinancialRecords(filters: {
  workspace_id?: string;
  type?: string | string[];
  source?: string | string[];
  category?: string;
  status?: string;
  assigned_user_id?: string;
  year_reference?: number;
  notes_like?: string;
  created_from?: string;
  created_to?: string;
} = {}): Promise<FinancialRecordApi[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const qs = params.toString();
  return apiRequest<FinancialRecordApi[]>(`/financial-records${qs ? `?${qs}` : ""}`);
}

export function createFinancialRecord(payload: Record<string, unknown>): Promise<FinancialRecordApi> {
  return apiRequest<FinancialRecordApi>("/financial-records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateFinancialRecord(id: string, patch: Record<string, unknown>): Promise<FinancialRecordApi> {
  return apiRequest<FinancialRecordApi>(`/financial-records/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function deleteFinancialRecord(id: string): Promise<void> {
  return apiRequest<void>(`/financial-records/${id}`, { method: "DELETE" });
}

export function deleteFinancialRecordsBy(filters: {
  type?: string | string[];
  source?: string | string[];
  assigned_user_id?: string;
  notes_like?: string;
  ids?: string[];
}): Promise<{ deleted: number }> {
  return apiRequest<{ deleted: number }>("/financial-records/delete-by", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filters),
  });
}

/* ── reconciliations / confronto ── */

export function listReconciliations(): Promise<any[]> {
  return apiRequest<any[]>("/finance/reconciliations", { timeoutMs: 15000 });
}

export function runReconciliation(): Promise<any> {
  return apiRequest<any>("/finance/reconciliations/run", { method: "POST", timeoutMs: 60000 });
}

export function createReconciliation(payload: Record<string, unknown>): Promise<any> {
  return apiRequest<any>("/finance/reconciliations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function patchReconciliation(
  id: string,
  patch: { status?: string; matched_by?: string; notes?: string; merge_notes?: Record<string, unknown> },
): Promise<any> {
  return apiRequest<any>(`/finance/reconciliations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function manualMergeReconciliation(serviceOrderId: string, paymentOrderId: string): Promise<any> {
  return apiRequest<any>("/finance/reconciliations/manual-merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service_order_id: serviceOrderId, payment_order_id: paymentOrderId }),
  });
}

export function getFinanceSummary(): Promise<any> {
  return apiRequest<any>("/finance/summary", { timeoutMs: 15000 });
}

export function getConfrontoCandidates(): Promise<any[]> {
  return apiRequest<any[]>("/finance/confrontation/candidates", { timeoutMs: 20000 });
}

export function confrontoMerge(soId: string, poId: string): Promise<{ isExact: boolean; diff: number }> {
  return apiRequest<{ isExact: boolean; diff: number }>("/finance/confrontation/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ so_id: soId, po_id: poId }),
  });
}

export function confrontoReject(soId: string, poId: string): Promise<void> {
  return apiRequest<void>("/finance/confrontation/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ so_id: soId, po_id: poId }),
  });
}

export function getConfrontoPending(): Promise<any[]> {
  return apiRequest<any[]>("/finance/confrontation/pending", { timeoutMs: 15000 });
}

export function confrontoValidate(id: string, difference: number): Promise<void> {
  return apiRequest<void>("/finance/confrontation/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, difference }),
  });
}

export function getConfrontoHistory(): Promise<any[]> {
  return apiRequest<any[]>("/finance/confrontation/history", { timeoutMs: 15000 });
}

/* ── profit rules / distribuição ── */

export interface ProfitRuleApi {
  id: string;
  rule_name: string;
  group_ids: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  profit_rule_items: {
    id: string;
    rule_id: string;
    participant_name: string;
    percentage: number;
    participant_type: string;
  }[];
}

export function listProfitRules(): Promise<ProfitRuleApi[]> {
  return apiRequest<ProfitRuleApi[]>("/finance/profit-rules");
}

export function saveProfitRule(payload: {
  id?: string;
  is_new?: boolean;
  rule_name: string;
  group_ids: string[];
  is_active: boolean;
  items: { participant_name: string; percentage: number; participant_type: string }[];
}): Promise<ProfitRuleApi> {
  return apiRequest<ProfitRuleApi>("/finance/profit-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: 30000,
  });
}

export function deleteProfitRule(id: string): Promise<void> {
  return apiRequest<void>(`/finance/profit-rules/${id}`, { method: "DELETE" });
}

export function deleteAllProfitRules(): Promise<{ deleted: number }> {
  return apiRequest<{ deleted: number }>("/finance/profit-rules", { method: "DELETE" });
}

/* ── agregação / participação ── */

export interface AggregationSource {
  service_orders: {
    id: string;
    total: number | null;
    status: string;
    group_id: string | null;
    week: string | null;
    year_reference: number | null;
    distribution_snapshot: unknown;
    car_name: string | null;
    license_plate: string | null;
  }[];
  profit_rules: { id: string; group_ids: string[]; is_active: boolean }[];
  profit_rule_items: { rule_id: string; participant_name: string; percentage: number }[];
}

export function getAggregationSource(): Promise<AggregationSource> {
  return apiRequest<AggregationSource>("/finance/aggregation-source", { timeoutMs: 15000 });
}

export function getParticipationSummary(year?: number): Promise<any[]> {
  const qs = year ? `?year=${year}` : "";
  return apiRequest<any[]>(`/finance/participation/summary${qs}`, { timeoutMs: 15000 });
}

export function getParticipationDetail(name: string, year?: number): Promise<any[]> {
  const params = new URLSearchParams({ name });
  if (year) params.set("year", String(year));
  return apiRequest<any[]>(`/finance/participation/detail?${params}`, { timeoutMs: 15000 });
}

export function listFinanceTechnicians(): Promise<{ id: string; name: string }[]> {
  return apiRequest<{ id: string; name: string }[]>("/finance/technicians");
}

/* ── auditoria / integridade ── */

export function getAuditTimeline(filters: {
  year?: number | null;
  eventType?: string | null;
  entityType?: string | null;
  hash?: string | null;
  limit?: number;
} = {}): Promise<any[]> {
  const params = new URLSearchParams();
  if (filters.year) params.set("year", String(filters.year));
  if (filters.eventType) params.set("event_type", filters.eventType);
  if (filters.entityType) params.set("entity_type", filters.entityType);
  if (filters.hash) params.set("hash", filters.hash);
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return apiRequest<any[]>(`/finance/audit/timeline${qs ? `?${qs}` : ""}`, { timeoutMs: 15000 });
}

export function getAuditIntegritySummary(): Promise<any> {
  return apiRequest<any>("/finance/audit/integrity-summary", { timeoutMs: 15000 });
}

export function getParticipationDiffs(): Promise<any[]> {
  return apiRequest<any[]>("/finance/audit/participation-diffs");
}

export function getIntegrityIssues(filters: {
  year?: number;
  severity?: string;
  issueType?: string;
  status?: string;
} = {}): Promise<any[]> {
  const params = new URLSearchParams();
  if (filters.year) params.set("year", String(filters.year));
  if (filters.severity && filters.severity !== "all") params.set("severity", filters.severity);
  if (filters.issueType && filters.issueType !== "all") params.set("issue_type", filters.issueType);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  const qs = params.toString();
  return apiRequest<any[]>(`/finance/integrity/issues${qs ? `?${qs}` : ""}`, { timeoutMs: 15000 });
}

export function getIntegritySnapshots(year?: number): Promise<any[]> {
  const qs = year ? `?year=${year}` : "";
  return apiRequest<any[]>(`/finance/integrity/snapshots${qs}`, { timeoutMs: 15000 });
}

export function runIntegrityCheck(year?: number): Promise<any> {
  return apiRequest<any>("/finance/integrity/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ year }),
    timeoutMs: 60000,
  });
}

/* ── AI insights ── */

export function getFinancialAIInsights(workspaceId: string, year: number): Promise<any> {
  return apiRequest<any>("/finance/ai-insights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, year }),
    timeoutMs: 90000,
  });
}

/* ── extract receipt ── */

export function extractReceipt(fileBase64: string, mimeType: string, fileName: string): Promise<any> {
  return apiRequest<any>("/extract/receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileBase64, mimeType, fileName }),
    timeoutMs: 90000,
  });
}
