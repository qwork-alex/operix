import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw, ShieldCheck, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const OPERATIONS = [
  "INSERT", "UPDATE", "DELETE", "RESTORE",
  "IMPORT", "EXPORT", "ASSIGNMENT", "PERMISSION",
  "LOGIN", "LOGOUT", "SYSTEM",
];

const OP_COLOR: Record<string, string> = {
  INSERT: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  UPDATE: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
  RESTORE: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  IMPORT: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  PERMISSION: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

interface AuditRow {
  id: string;
  workspace_id: string | null;
  table_name: string;
  row_id: string | null;
  operation: string;
  actor_user_id: string | null;
  actor_email: string | null;
  origin: string;
  old_values: any;
  new_values: any;
  changed_fields: string[] | null;
  reason: string | null;
  created_at: string;
}

export default function AuditPage() {
  const { workspaceId } = useWorkspace();
  const [opFilter, setOpFilter] = useState<string>("all");
  const [tableFilter, setTableFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["audit_log", workspaceId, opFilter, tableFilter],
    enabled: !!workspaceId,
    queryFn: async () => {
      let q = (supabase as any)
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (workspaceId) q = q.eq("workspace_id", workspaceId);
      if (opFilter !== "all") q = q.eq("operation", opFilter);
      if (tableFilter) q = q.ilike("table_name", `%${tableFilter}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as AuditRow[];
    },
  });

  const handleRestore = async (id: string) => {
    if (!confirm("Restaurar registo ao valor anterior? Esta ação ficará registada.")) return;
    setRestoring(id);
    try {
      const { data, error } = await (supabase as any).rpc("restore_audit_record", { _audit_id: id });
      if (error) throw error;
      if ((data as any)?.success) {
        toast.success("Registo restaurado");
        refetch();
      } else {
        throw new Error("Restore falhou");
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao restaurar");
    } finally {
      setRestoring(null);
    }
  };

  const isRestorable = (r: AuditRow) =>
    ["UPDATE", "DELETE"].includes(r.operation) &&
    [
      "service_orders", "payment_orders", "financial_records",
      "fleet_fuel_logs", "fleet_vehicles", "drivers", "technicians",
      "clients", "profit_rules", "documents",
    ].includes(r.table_name);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={20} className="text-primary" />
        <h1 className="text-xl font-semibold text-foreground">Auditoria empresarial</h1>
        <span className="text-xs text-muted-foreground ml-2">
          Trilho imutável de alterações no workspace
        </span>
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Select value={opFilter} onValueChange={setOpFilter}>
          <SelectTrigger className="h-9 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as operações</SelectItem>
            {OPERATIONS.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            placeholder="Tabela…"
            className="h-9 w-[200px] pl-7 text-xs"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          Atualizar
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {data?.length ?? 0} entradas
        </span>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="animate-spin" size={18} />
            <span className="text-sm">A carregar…</span>
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Sem registos</p>
        ) : (
          <div className="divide-y divide-border/40">
            {data!.map((r) => {
              const open = expanded === r.id;
              return (
                <div key={r.id} className="p-3 text-sm">
                  <div
                    className="flex flex-wrap items-center gap-2 cursor-pointer"
                    onClick={() => setExpanded(open ? null : r.id)}
                  >
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] font-mono", OP_COLOR[r.operation] || "")}
                    >
                      {r.operation}
                    </Badge>
                    <span className="font-mono text-xs text-foreground">{r.table_name}</span>
                    {r.changed_fields && r.changed_fields.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {r.changed_fields.slice(0, 3).join(", ")}
                        {r.changed_fields.length > 3 && ` +${r.changed_fields.length - 3}`}
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {r.actor_email || r.actor_user_id?.slice(0, 8) || "sistema"} ·{" "}
                      {new Date(r.created_at).toLocaleString("pt-PT")}
                    </span>
                    {isRestorable(r) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px]"
                        disabled={restoring === r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestore(r.id);
                        }}
                      >
                        {restoring === r.id ? (
                          <Loader2 className="animate-spin" size={12} />
                        ) : (
                          <RotateCcw size={12} className="mr-1" />
                        )}
                        Restaurar
                      </Button>
                    )}
                  </div>

                  {open && (
                    <div className="mt-3 grid md:grid-cols-2 gap-2 text-[11px]">
                      <pre className="bg-muted/30 rounded p-2 overflow-auto max-h-72 border border-border/40">
                        <span className="text-muted-foreground">Anterior:</span>{"\n"}
                        {r.old_values ? JSON.stringify(r.old_values, null, 2) : "—"}
                      </pre>
                      <pre className="bg-muted/30 rounded p-2 overflow-auto max-h-72 border border-border/40">
                        <span className="text-muted-foreground">Novo:</span>{"\n"}
                        {r.new_values ? JSON.stringify(r.new_values, null, 2) : "—"}
                      </pre>
                      {r.reason && (
                        <p className="md:col-span-2 text-muted-foreground italic">Motivo: {r.reason}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
