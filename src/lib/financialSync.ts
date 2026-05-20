import type { QueryClient } from "@tanstack/react-query";

/**
 * Invalidate every cache that depends on financial_records so that any
 * Accounting mutation immediately reflects in:
 *  - Technician Detail
 *  - Participation
 *  - Financial overview / reconciliation
 *  - Accounting period spreadsheet
 */
export function invalidateAccountingDownstream(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["accounting-module"] });
  qc.invalidateQueries({ queryKey: ["accounting-expenses-by-period"] });
  qc.invalidateQueries({ queryKey: ["technician-earnings"] });
  qc.invalidateQueries({ queryKey: ["participation-ledger"] });
  qc.invalidateQueries({ queryKey: ["participant-aggregation"] });
  qc.invalidateQueries({ queryKey: ["reconciliation-summary"] });
  qc.invalidateQueries({ queryKey: ["financial-events"] });
}
