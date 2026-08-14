import { describe, it, expect } from "vitest";
import { WORKFLOW_STATUSES, isTransitionAllowed, type WorkflowStatus } from "@/lib/productionWorkflowStatus";

const VALID_PAIRS: [WorkflowStatus, WorkflowStatus][] = [
  ["em_elaboracao", "aguardando_assinatura"],
  ["aguardando_assinatura", "aguardando_aprovacao"],
  ["aguardando_assinatura", "em_elaboracao"],
  ["aguardando_aprovacao", "correcao_necessaria"],
  ["aguardando_aprovacao", "faturamento_autorizado"],
  ["correcao_necessaria", "em_elaboracao"],
  ["faturamento_autorizado", "aguardando_pagamento"],
  ["aguardando_pagamento", "pago_encerrado"],
];

describe("productionWorkflowStatus transitions", () => {
  it("allows every documented transition", () => {
    for (const [from, to] of VALID_PAIRS) {
      expect(isTransitionAllowed(from, to)).toBe(true);
    }
  });

  it("rejects skipping steps (em_elaboracao -> aguardando_pagamento)", () => {
    expect(isTransitionAllowed("em_elaboracao", "aguardando_pagamento")).toBe(false);
  });

  it("rejects every pair not explicitly documented", () => {
    const allowed = new Set(VALID_PAIRS.map(([from, to]) => `${from}->${to}`));
    for (const from of WORKFLOW_STATUSES) {
      for (const to of WORKFLOW_STATUSES) {
        if (from === to) continue;
        const key = `${from}->${to}`;
        if (allowed.has(key)) continue;
        expect(isTransitionAllowed(from, to)).toBe(false);
      }
    }
  });

  it("rejects moving out of the terminal state", () => {
    for (const to of WORKFLOW_STATUSES) {
      expect(isTransitionAllowed("pago_encerrado", to)).toBe(false);
    }
  });
});
