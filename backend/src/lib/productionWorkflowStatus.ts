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

export function isWorkflowStatus(value: string): value is WorkflowStatus {
  return (WORKFLOW_STATUSES as readonly string[]).includes(value);
}

/**
 * Transitions marked `manual: true` are draggable in the UI.
 * Transitions marked `manual: false` are placeholders for automations that
 * don't exist yet (FR-015) — reachable only via an explicit confirmation
 * action, never by drag-and-drop.
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

export function findTransition(from: WorkflowStatus, to: WorkflowStatus) {
  return WORKFLOW_TRANSITIONS[from].find((t) => t.to === to) ?? null;
}

export function isTransitionAllowed(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return findTransition(from, to) !== null;
}
