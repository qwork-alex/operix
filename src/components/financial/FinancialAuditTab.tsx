import { useState, useMemo } from "react";
import {
  Activity, AlertTriangle, Search, ChevronDown, ChevronRight,
  ShieldCheck, Layers, Hash, RefreshCw, GitCompare,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  useFinancialEventTimeline,
  useFinancialIntegritySummary,
  useParticipationDiffs,
} from "@/hooks/useFinancialAudit";
import { useLanguage } from "@/hooks/useLanguage";

const EVENT_TYPES = [
  "all", "billing.payment.synced", "billing.invoice.updated",
  "participation.updated", "financial.integrity.warning",
  "financial.sync.skipped", "financial.replay",
];

const ENTITY_TYPES = ["all", "invoice", "service_order", "payment_order", "participation_ledger"];

const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear - 1, currentYear - 2];

function KPI({
  label, value, tone = "default", icon: Icon,
}: { label: string; value: number; tone?: "default" | "warn" | "danger" | "ok"; icon: any }) {
  const toneClass =
    tone === "danger" ? "text-destructive"
    : tone === "warn" ? "text-warning"
    : tone === "ok" ? "text-success"
    : "text-foreground";
  return (
    <Card className="glass-panel">
      <CardContent className="p-4 flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</p>
        </div>
        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function EventRow({ ev, onSelect }: { ev: any; onSelect: (e: any) => void }) {
  const [open, setOpen] = useState(false);
  const isWarn = ev.event_type?.includes("warning") || ev.event_type?.includes("integrity");
  const isParticipation = ev.event_type === "participation.updated";

  return (
    <div className="border-b border-border/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 py-2.5 px-3 hover:bg-muted/40 text-left"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <Badge variant={isWarn ? "destructive" : isParticipation ? "default" : "secondary"} className="text-[10px] font-mono shrink-0">
          {ev.event_type}
        </Badge>
        <span className="text-xs text-muted-foreground shrink-0">{ev.entity_type}</span>
        <span className="text-xs font-mono text-muted-foreground/70 truncate flex-1">
          {ev.event_hash?.slice(0, 12) ?? "—"}
        </span>
        <span className="text-[10px] text-muted-foreground shrink-0">rev {ev.revision}</span>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {new Date(ev.created_at).toLocaleString()}
        </span>
        {isParticipation && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={(e) => { e.stopPropagation(); onSelect(ev); }}
          >
            <GitCompare className="h-3 w-3 mr-1" /> Diff
          </Button>
        )}
      </button>
      {open && (
        <div className="bg-muted/20 px-10 py-2 border-t border-border/30">
          <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all">
            {JSON.stringify(ev.payload, null, 2)}
          </pre>
          {ev.caused_by_event_id && (
            <p className="text-[10px] text-muted-foreground mt-1">
              ↳ caused_by: <span className="font-mono">{ev.caused_by_event_id}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DiffPanel({ event, onClose }: { event: any | null; onClose: () => void }) {
  const { t } = useLanguage();
  const ledgerId =
    event?.payload?.ledger_id ||
    event?.payload?.participation_ledger_id ||
    event?.entity_id;
  const { data: diffs = [], isLoading } = useParticipationDiffs(ledgerId, 50);

  return (
    <Sheet open={!!event} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <GitCompare className="h-4 w-4" /> {t("audit.diffs.title")}
          </SheetTitle>
          <SheetDescription className="font-mono text-[10px] break-all">
            ledger {ledgerId ?? "—"}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {isLoading && <Skeleton className="h-24" />}
          {!isLoading && diffs.length === 0 && (
            <p className="text-xs text-muted-foreground">{t("audit.diffs.none")}</p>
          )}
          {diffs.map((d: any) => (
            <Card key={d.id} className="border-border/50">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">{d.participant_name}</p>
                    <p className="text-[10px] text-muted-foreground">{d.participant_type} · rev {d.sync_revision}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{new Date(d.created_at).toLocaleString()}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <p className="text-muted-foreground">{t("part.expected")}</p>
                    <p className="font-mono">{Number(d.previous_expected).toFixed(2)} → <span className="text-foreground font-semibold">{Number(d.new_expected).toFixed(2)}</span></p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("part.received")}</p>
                    <p className="font-mono">{Number(d.previous_received).toFixed(2)} → <span className="text-foreground font-semibold">{Number(d.new_received).toFixed(2)}</span></p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("label.status")}</p>
                    <p className="font-mono">{d.previous_status} → <span className="text-foreground font-semibold">{d.new_status}</span></p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function FinancialAuditTab() {
  const { t } = useLanguage();
  const [year, setYear] = useState<number | null>(null);
  const [eventType, setEventType] = useState<string>("all");
  const [entityType, setEntityType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedDiff, setSelectedDiff] = useState<any | null>(null);

  const { data: integrity, isLoading: intLoading, refetch: refetchInt } = useFinancialIntegritySummary();
  const { data: events = [], isLoading: evLoading, refetch: refetchEv } = useFinancialEventTimeline({
    year,
    eventType: eventType === "all" ? null : eventType,
    entityType: entityType === "all" ? null : entityType,
    hash: search.trim().length >= 8 ? search.trim() : null,
    limit: 300,
  });

  const filteredEvents = useMemo(() => {
    if (!search.trim() || search.trim().length >= 8) return events;
    const s = search.toLowerCase();
    return events.filter((e: any) =>
      e.event_type?.toLowerCase().includes(s)
      || e.entity_type?.toLowerCase().includes(s)
      || e.event_hash?.toLowerCase().includes(s)
      || JSON.stringify(e.payload_summary ?? {}).toLowerCase().includes(s),
    );
  }, [events, search]);

  return (
    <div className="space-y-4">
      {/* Integrity KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {intLoading ? (
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : (
          <>
            <KPI label={t("audit.kpi.dupeHash")} value={integrity?.duplicate_hash_count ?? 0}
              tone={(integrity?.duplicate_hash_count ?? 0) > 0 ? "danger" : "ok"} icon={Hash} />
            <KPI label={t("audit.kpi.orphanOp")} value={integrity?.orphan_op_count ?? 0}
              tone={(integrity?.orphan_op_count ?? 0) > 0 ? "warn" : "ok"} icon={AlertTriangle} />
            <KPI label={t("audit.kpi.missingSo")} value={integrity?.missing_so_links ?? 0}
              tone={(integrity?.missing_so_links ?? 0) > 0 ? "warn" : "ok"} icon={Layers} />
            <KPI label={t("audit.kpi.overAlloc")} value={integrity?.over_allocated_distributions ?? 0}
              tone={(integrity?.over_allocated_distributions ?? 0) > 0 ? "danger" : "ok"} icon={AlertTriangle} />
            <KPI label={t("audit.kpi.invalidWs")} value={integrity?.invalid_workspace_rows ?? 0}
              tone={(integrity?.invalid_workspace_rows ?? 0) > 0 ? "danger" : "ok"} icon={ShieldCheck} />
            <KPI label={t("audit.kpi.replay")} value={integrity?.replay_collapses ?? 0} icon={RefreshCw} />
            <KPI label={t("audit.kpi.skipped")} value={integrity?.skipped_diff_updates ?? 0} icon={Activity} />
            <KPI label={t("audit.kpi.lockHits")} value={integrity?.financial_sync_lock_hits ?? 0} icon={ShieldCheck} />
          </>
        )}
      </div>

      {/* Filters */}
      <Card className="glass-panel">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={t("audit.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={year?.toString() ?? "all"} onValueChange={(v) => setYear(v === "all" ? null : Number(v))}>
            <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("audit.allYears")}</SelectItem>
              {YEARS.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map(tk => <SelectItem key={tk} value={tk}>{tk}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ENTITY_TYPES.map(tk => <SelectItem key={tk} value={tk}>{tk}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => { refetchInt(); refetchEv(); }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card className="glass-panel">
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b border-border/40 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("audit.timeline")}
            </p>
            <p className="text-[10px] text-muted-foreground">{filteredEvents.length} {t("audit.eventsCount")}</p>
          </div>
          {evLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              {t("audit.empty")}
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              {filteredEvents.map((ev: any) => (
                <EventRow key={ev.id} ev={ev} onSelect={setSelectedDiff} />
              ))}
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <DiffPanel event={selectedDiff} onClose={() => setSelectedDiff(null)} />
    </div>
  );
}
