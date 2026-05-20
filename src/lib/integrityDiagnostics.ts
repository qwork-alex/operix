// Phase 5B — Integrity Diagnostics helpers
import type { IntegrityIssue } from "@/hooks/useFinancialIntegrity";

export type IntegrityKpis = {
  open: number;
  critical: number;
  warning: number;
  info: number;
  drift: number;
  orphan: number;
  resolved: number;
};

export function computeKpis(issues: IntegrityIssue[]): IntegrityKpis {
  const k: IntegrityKpis = { open: 0, critical: 0, warning: 0, info: 0, drift: 0, orphan: 0, resolved: 0 };
  for (const i of issues) {
    if (i.status === "open") {
      k.open++;
      if (i.severity === "critical") k.critical++;
      if (i.severity === "warning") k.warning++;
      if (i.severity === "info") k.info++;
      if (i.issue_type === "drift_detected") k.drift++;
      if (i.issue_type === "orphan_record" || i.issue_type === "missing_reference") k.orphan++;
    } else if (i.status === "resolved") {
      k.resolved++;
    }
  }
  return k;
}

export function severityColor(sev: string): string {
  switch (sev) {
    case "critical": return "text-destructive";
    case "warning": return "text-amber-500";
    default: return "text-muted-foreground";
  }
}

export function severityBadgeBg(sev: string): string {
  switch (sev) {
    case "critical": return "bg-destructive/15 text-destructive border border-destructive/30";
    case "warning": return "bg-amber-500/15 text-amber-500 border border-amber-500/30";
    default: return "bg-muted text-muted-foreground border border-border";
  }
}
