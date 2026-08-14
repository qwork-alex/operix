export const WORKFLOW_STATUSES = [
  "em_elaboracao",
  "aguardando_assinatura",
  "aguardando_aprovacao",
  "correcao_necessaria",
  "faturamento_autorizado",
  "aguardando_pagamento",
  "pago_encerrado",
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  em_elaboracao: "Em elaboração",
  aguardando_assinatura: "Aguardando assinatura",
  aguardando_aprovacao: "Aguardando aprovação",
  correcao_necessaria: "Correção necessária",
  faturamento_autorizado: "Faturamento autorizado / Nota fiscal emitida",
  aguardando_pagamento: "Aguardando pagamento",
  pago_encerrado: "Pago / Encerrado",
};

/**
 * Mirrors backend/src/lib/productionWorkflowStatus.ts — used ONLY to hint the
 * UI (disable invalid drop targets, hide the "confirmar" action). The backend
 * PATCH endpoint is the actual source of truth and re-validates every move.
 */
export const WORKFLOW_TRANSITIONS: Record<WorkflowStatus, { to: WorkflowStatus; manual: boolean }[]> = {
  em_elaboracao: [{ to: "aguardando_assinatura", manual: true }],
  aguardando_assinatura: [
    { to: "aguardando_aprovacao", manual: true },
    { to: "em_elaboracao", manual: true },
  ],
  aguardando_aprovacao: [
    { to: "correcao_necessaria", manual: true },
    { to: "faturamento_autorizado", manual: true },
  ],
  correcao_necessaria: [{ to: "em_elaboracao", manual: true }],
  faturamento_autorizado: [{ to: "aguardando_pagamento", manual: false }],
  aguardando_pagamento: [{ to: "pago_encerrado", manual: false }],
  pago_encerrado: [],
};

export function isTransitionAllowed(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return WORKFLOW_TRANSITIONS[from].some((t) => t.to === to);
}

export function isManualDragTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return WORKFLOW_TRANSITIONS[from].some((t) => t.to === to && t.manual);
}

/** Destinations reachable from `from`, split by whether they're draggable or confirm-only. */
export function allowedDestinations(from: WorkflowStatus) {
  return WORKFLOW_TRANSITIONS[from];
}
