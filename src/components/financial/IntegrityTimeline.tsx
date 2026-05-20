import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/hooks/useLanguage";
import type { IntegrityIssue, IntegritySnapshot } from "@/hooks/useFinancialIntegrity";
import { severityBadgeBg } from "@/lib/integrityDiagnostics";

type Props = {
  issues: IntegrityIssue[];
  snapshots: IntegritySnapshot[];
};

export function IntegrityTimeline({ issues, snapshots }: Props) {
  const { t } = useLanguage();

  const events = [
    ...issues.map((i) => ({
      kind: "issue" as const,
      at: i.detected_at,
      severity: i.severity,
      label: i.issue_type,
      detail: i.entity_type ?? "",
      status: i.status,
    })),
    ...snapshots.map((s) => ({
      kind: "snapshot" as const,
      at: s.created_at,
      severity: "info" as const,
      label: `${t("integrity.timeline.snapshot")} · ${s.snapshot_type}`,
      detail: `OS:${s.total_os} OP:${s.total_op}`,
      status: "resolved" as const,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{t("integrity.timeline.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">{t("integrity.empty")}</div>
        ) : (
          <ol className="relative border-l border-border/50 ml-3 space-y-3">
            {events.map((e, idx) => (
              <li key={idx} className="ml-4">
                <span className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ${e.severity === "critical" ? "bg-destructive" : e.severity === "warning" ? "bg-amber-500" : "bg-muted-foreground/40"}`} />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(e.at).toLocaleString()}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase ${severityBadgeBg(e.severity)}`}>
                    {e.severity}
                  </span>
                  <span className="text-xs font-medium text-foreground">{e.label}</span>
                  {e.detail && <span className="text-[11px] text-muted-foreground">{e.detail}</span>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
