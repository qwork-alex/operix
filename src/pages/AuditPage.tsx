import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, RotateCcw, ShieldCheck, Search, Download, AlertTriangle,
  ShieldAlert, Activity, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ============================================================
 * Enterprise Audit — unified read-only view over existing tables
 * Sources: public.audit_log (DB mutations) + public.security_events
 * SAFE MODE: no migrations, no triggers, no schema changes.
 * ============================================================ */

const PAGE_SIZE = 50;

type Severity = "info" | "warn" | "critical";
type Source = "audit" | "security";

interface UnifiedRow {
  id: string;
  source: Source;
  severity: Severity;
  ts: string;
  actor: string | null;
  actorId: string | null;
  module: string;             // table_name or event_type domain
  action: string;             // operation or event_type
  ip: string | null;
  before: any;
  after: any;
  resource: string | null;
  resourceId: string | null;
  workspaceId: string | null;
  raw: any;
  restorable: boolean;
}

const RESTORABLE_TABLES = new Set([
  "service_orders", "payment_orders", "financial_records",
  "fleet_fuel_logs", "fleet_vehicles", "drivers", "technicians",
  "clients", "profit_rules", "documents",
]);

const SEV_STYLE: Record<Severity, string> = {
  info: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  critical: "bg-red-500/20 text-red-300 border-red-500/50",
};

const OP_BADGE: Record<string, string> = {
  INSERT: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  UPDATE: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  DELETE: "bg-red-500/15 text-red-300 border-red-500/40",
  RESTORE: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  PERMISSION: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  LOGIN: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  LOGOUT: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30",
  SYSTEM: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30",
};

const SENSITIVE_KEY_RX = /(pass(word)?|token|secret|api[_-]?key|authorization|cookie|refresh|bearer|client[_-]?secret|private[_-]?key)/i;

function maskSensitive(v: any, depth = 0): any {
  if (v == null || depth > 6) return v;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((x) => maskSensitive(x, depth + 1));
  if (typeof v === "object") {
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      if (SENSITIVE_KEY_RX.test(k)) {
        out[k] = "••• masked •••";
      } else {
        out[k] = maskSensitive(val, depth + 1);
      }
    }
    return out;
  }
  return v;
}

function inferAuditSeverity(op: string): Severity {
  if (op === "DELETE" || op === "PERMISSION" || op === "SYSTEM") return "critical";
  if (op === "UPDATE" || op === "RESTORE" || op === "ASSIGNMENT" || op === "IMPORT" || op === "EXPORT") return "warn";
  return "info";
}

function normalizeAudit(r: any): UnifiedRow {
  return {
    id: `a:${r.id}`,
    source: "audit",
    severity: inferAuditSeverity(r.operation),
    ts: r.created_at,
    actor: r.actor_email || (r.actor_user_id ? r.actor_user_id.slice(0, 8) : null),
    actorId: r.actor_user_id,
    module: r.table_name,
    action: r.operation,
    ip: r.ip_address || null,
    before: maskSensitive(r.old_values),
    after: maskSensitive(r.new_values),
    resource: r.table_name,
    resourceId: r.row_id,
    workspaceId: r.workspace_id,
    raw: r,
    restorable: ["UPDATE", "DELETE"].includes(r.operation) && RESTORABLE_TABLES.has(r.table_name),
  };
}

function normalizeSecurity(r: any): UnifiedRow {
  const sev: Severity = ["info", "warn", "critical"].includes(r.severity) ? r.severity : "info";
  return {
    id: `s:${r.id}`,
    source: "security",
    severity: sev,
    ts: r.created_at,
    actor: r.user_id ? r.user_id.slice(0, 8) : null,
    actorId: r.user_id,
    module: "security",
    action: r.event_type,
    ip: r.ip_address || null,
    before: null,
    after: maskSensitive(r.metadata),
    resource: r.resource,
    resourceId: r.resource_id,
    workspaceId: r.workspace_id,
    raw: r,
    restorable: false,
  };
}

interface Filters {
  severity: "all" | Severity;
  source: "all" | Source;
  action: string;
  search: string;
  range: "24h" | "7d" | "30d" | "all";
}

function rangeSince(range: Filters["range"]): string | null {
  const now = Date.now();
  switch (range) {
    case "24h": return new Date(now - 86_400_000).toISOString();
    case "7d": return new Date(now - 7 * 86_400_000).toISOString();
    case "30d": return new Date(now - 30 * 86_400_000).toISOString();
    default: return null;
  }
}

async function fetchPage(workspaceId: string, filters: Filters, cursor: string | null) {
  const since = rangeSince(filters.range);
  const cap = PAGE_SIZE;

  const auditPromise = (async () => {
    if (filters.source === "security") return [];
    let q = (supabase as any)
      .from("audit_log").select("*").eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }).limit(cap);
    if (since) q = q.gte("created_at", since);
    if (cursor) q = q.lt("created_at", cursor);
    if (filters.action) q = q.ilike("operation", filters.action);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(normalizeAudit);
  })();

  const securityPromise = (async () => {
    if (filters.source === "audit") return [];
    let q = (supabase as any)
      .from("security_events").select("*").eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }).limit(cap);
    if (since) q = q.gte("created_at", since);
    if (cursor) q = q.lt("created_at", cursor);
    if (filters.severity !== "all") q = q.eq("severity", filters.severity);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(normalizeSecurity);
  })();

  const [a, s] = await Promise.all([auditPromise, securityPromise]);
  let merged = [...a, ...s];

  if (filters.severity !== "all") merged = merged.filter((r) => r.severity === filters.severity);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    merged = merged.filter((r) =>
      [r.actor, r.module, r.action, r.resource, r.resourceId, r.ip]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }

  merged.sort((x, y) => (x.ts < y.ts ? 1 : -1));
  return merged.slice(0, PAGE_SIZE);
}

function toCsv(rows: UnifiedRow[]): string {
  const headers = ["timestamp", "severity", "source", "actor", "module", "action", "ip", "resource", "resource_id"];
  const escape = (v: any) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([r.ts, r.severity, r.source, r.actor, r.module, r.action, r.ip, r.resource, r.resourceId].map(escape).join(","));
  }
  return lines.join("\n");
}

function useAlerts(workspaceId: string | null) {
  return useQuery({
    queryKey: ["audit-alerts", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const [secRes, auditRes] = await Promise.all([
        (supabase as any).from("security_events")
          .select("event_type, severity, user_id, created_at")
          .eq("workspace_id", workspaceId).gte("created_at", since).limit(1000),
        (supabase as any).from("audit_log")
          .select("operation, actor_user_id, created_at")
          .eq("workspace_id", workspaceId).gte("created_at", since).limit(2000),
      ]);
      const sec = secRes.data || [];
      const aud = auditRes.data || [];

      const failedByUser = new Map<string, number>();
      let suspicious = 0;
      let permChanges = 0;
      for (const e of sec) {
        if (e.event_type === "login_failed" && e.user_id) {
          failedByUser.set(e.user_id, (failedByUser.get(e.user_id) || 0) + 1);
        }
        if (e.event_type === "suspicious" || e.severity === "critical") suspicious++;
        if (e.event_type === "permission_change") permChanges++;
      }
      const bruteForce = [...failedByUser.values()].filter((n) => n >= 5).length;

      const deletesByActor = new Map<string, number>();
      for (const r of aud) {
        if (r.operation === "DELETE" && r.actor_user_id) {
          deletesByActor.set(r.actor_user_id, (deletesByActor.get(r.actor_user_id) || 0) + 1);
        }
      }
      const massDeletes = [...deletesByActor.values()].filter((n) => n >= 10).length;

      return { suspicious, bruteForce, permChanges, massDeletes, totalEvents: sec.length + aud.length };
    },
  });
}

export default function AuditPage() {
  const { workspaceId } = useWorkspace();
  const [filters, setFilters] = useState<Filters>({
    severity: "all", source: "all", action: "", search: "", range: "7d",
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const alerts = useAlerts(workspaceId);

  const query = useInfiniteQuery({
    queryKey: ["audit-feed", workspaceId, filters],
    enabled: !!workspaceId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchPage(workspaceId!, filters, pageParam as string | null),
    getNextPageParam: (last) => (last.length < PAGE_SIZE ? undefined : last[last.length - 1].ts),
  });

  const rows = useMemo<UnifiedRow[]>(() => {
    const seen = new Set<string>();
    const out: UnifiedRow[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const r of page) {
        if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
      }
    }
    return out;
  }, [query.data]);

  const handleRestore = async (rawId: string) => {
    if (!confirm("Restaurar registo ao valor anterior? Esta ação ficará registada.")) return;
    setRestoring(rawId);
    try {
      const { data, error } = await (supabase as any).rpc("restore_audit_record", { _audit_id: rawId });
      if (error) throw error;
      if ((data as any)?.success) { toast.success("Registo restaurado"); query.refetch(); }
      else throw new Error("Restore falhou");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao restaurar");
    } finally { setRestoring(null); }
  };

  const handleExport = () => {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={20} className="text-primary" />
        <h1 className="text-xl font-semibold text-foreground">Auditoria empresarial</h1>
        <span className="text-xs text-muted-foreground ml-2">
          Trilho imutável de eventos operacionais e de segurança
        </span>
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <AlertCard label="Eventos 24h" value={alerts.data?.totalEvents ?? "—"} icon={<Activity size={14} />} />
        <AlertCard label="Críticos / suspeitos" value={alerts.data?.suspicious ?? "—"} tone={alerts.data?.suspicious ? "critical" : "info"} icon={<ShieldAlert size={14} />} />
        <AlertCard label="Força bruta login" value={alerts.data?.bruteForce ?? "—"} tone={alerts.data?.bruteForce ? "warn" : "info"} icon={<AlertTriangle size={14} />} />
        <AlertCard label="Alterações permissão" value={alerts.data?.permChanges ?? "—"} tone={(alerts.data?.permChanges ?? 0) > 3 ? "warn" : "info"} icon={<ShieldCheck size={14} />} />
        <AlertCard label="Exclusões em massa" value={alerts.data?.massDeletes ?? "—"} tone={alerts.data?.massDeletes ? "critical" : "info"} icon={<AlertTriangle size={14} />} />
      </div>

      {/* Filters */}
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Select value={filters.severity} onValueChange={(v) => setFilters((f) => ({ ...f, severity: v as any }))}>
          <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda severidade</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warning</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.source} onValueChange={(v) => setFilters((f) => ({ ...f, source: v as any }))}>
          <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas fontes</SelectItem>
            <SelectItem value="audit">Operacional (DB)</SelectItem>
            <SelectItem value="security">Segurança</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.range} onValueChange={(v) => setFilters((f) => ({ ...f, range: v as any }))}>
          <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Últimas 24h</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={filters.action}
          onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
          placeholder="Ação (INSERT, DELETE…)"
          className="h-9 w-[180px] text-xs"
        />
        <div className="relative flex-1 min-w-[200px]">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Pesquisar actor, módulo, recurso, IP…"
            className="h-9 pl-7 text-xs"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={() => query.refetch()}>Atualizar</Button>
        <Button variant="ghost" size="sm" onClick={handleExport} disabled={!rows.length}>
          <Download size={12} className="mr-1" /> CSV
        </Button>
        <span className="text-xs text-muted-foreground">{rows.length} eventos</span>
      </Card>

      {/* Feed */}
      <Card className="overflow-hidden">
        {query.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="animate-spin" size={18} />
            <span className="text-sm">A carregar…</span>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Sem registos</p>
        ) : (
          <div className="divide-y divide-border/40">
            {rows.map((r) => {
              const open = expanded === r.id;
              const critical = r.severity === "critical";
              return (
                <div
                  key={r.id}
                  className={cn(
                    "p-3 text-sm transition-colors",
                    critical && "bg-red-500/[0.04] border-l-2 border-l-red-500/60",
                  )}
                >
                  <div
                    className="flex flex-wrap items-center gap-2 cursor-pointer"
                    onClick={() => setExpanded(open ? null : r.id)}
                  >
                    <Badge variant="outline" className={cn("text-[10px]", SEV_STYLE[r.severity])}>
                      {r.severity.toUpperCase()}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] font-mono", OP_BADGE[r.action] || "bg-muted/40 text-muted-foreground border-border/40")}
                    >
                      {r.action}
                    </Badge>
                    <span className="font-mono text-xs text-foreground">{r.module}</span>
                    {r.resourceId && (
                      <span className="text-[10px] font-mono text-muted-foreground">#{String(r.resourceId).slice(0, 8)}</span>
                    )}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {r.actor || "sistema"}
                      {r.ip ? ` · ${r.ip}` : ""}
                      {" · "}
                      {new Date(r.ts).toLocaleString("pt-PT")}
                    </span>
                    {r.restorable && (
                      <Button
                        variant="ghost" size="sm" className="h-7 text-[11px]"
                        disabled={restoring === r.raw.id}
                        onClick={(e) => { e.stopPropagation(); handleRestore(r.raw.id); }}
                      >
                        {restoring === r.raw.id
                          ? <Loader2 className="animate-spin" size={12} />
                          : <RotateCcw size={12} className="mr-1" />}
                        Restaurar
                      </Button>
                    )}
                    <ChevronDown
                      size={14}
                      className={cn("text-muted-foreground transition-transform", open && "rotate-180")}
                    />
                  </div>

                  {open && (
                    <div className="mt-3 grid md:grid-cols-2 gap-2 text-[11px]">
                      {r.before && (
                        <pre className="bg-muted/30 rounded p-2 overflow-auto max-h-72 border border-border/40">
                          <span className="text-muted-foreground">Anterior:</span>{"\n"}
                          {JSON.stringify(r.before, null, 2)}
                        </pre>
                      )}
                      {r.after && (
                        <pre className="bg-muted/30 rounded p-2 overflow-auto max-h-72 border border-border/40">
                          <span className="text-muted-foreground">{r.source === "security" ? "Metadata:" : "Novo:"}</span>{"\n"}
                          {JSON.stringify(r.after, null, 2)}
                        </pre>
                      )}
                      {!r.before && !r.after && (
                        <p className="md:col-span-2 text-muted-foreground italic">Sem payload adicional.</p>
                      )}
                      {r.raw?.reason && (
                        <p className="md:col-span-2 text-muted-foreground italic">Motivo: {r.raw.reason}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {query.hasNextPage && (
          <div className="p-3 border-t border-border/40 flex justify-center">
            <Button
              variant="outline" size="sm"
              disabled={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            >
              {query.isFetchingNextPage
                ? <><Loader2 className="animate-spin mr-1" size={12} /> A carregar…</>
                : "Carregar mais"}
            </Button>
          </div>
        )}
      </Card>

      <p className="text-[10px] text-muted-foreground text-center">
        Logs imutáveis · campos sensíveis mascarados automaticamente · retention regida por políticas server-side
      </p>
    </div>
  );
}

function AlertCard({
  label, value, tone = "info", icon,
}: { label: string; value: number | string; tone?: Severity; icon: React.ReactNode }) {
  return (
    <Card className={cn(
      "p-3 flex items-center gap-2 border",
      tone === "critical" && "border-red-500/40 bg-red-500/[0.04]",
      tone === "warn" && "border-amber-500/40 bg-amber-500/[0.04]",
      tone === "info" && "border-border/40",
    )}>
      <span className={cn(
        "text-muted-foreground",
        tone === "critical" && "text-red-400",
        tone === "warn" && "text-amber-400",
      )}>{icon}</span>
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold text-foreground">{value}</span>
      </div>
    </Card>
  );
}
