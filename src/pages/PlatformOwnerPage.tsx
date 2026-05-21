import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Shield, Building2, AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingState } from "@/components/shared/LoadingState";
import { useIsPlatformOwner } from "@/hooks/useSubscription";

export default function PlatformOwnerPage() {
  const { data: isOwner, isLoading: ownerLoading } = useIsPlatformOwner();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["platform-subscriptions"],
    enabled: !!isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_subscriptions")
        .select("id, workspace_id, status, billing_cycle, trial_ends_at, current_period_end, technician_count, current_price, created_at, workspaces(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (ownerLoading) return <div className="module-shell"><LoadingState variant="cards" /></div>;
  if (!isOwner) return <Navigate to="/" replace />;

  const counts = rows.reduce(
    (acc, r: any) => {
      acc.total++;
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    { total: 0 } as Record<string, number>,
  );

  return (
    <div className="module-shell space-y-6">
      <PageHeader icon={Shield} title="Plataforma" subtitle="Visão global de todas as workspaces" />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Workspaces", value: counts.total, icon: Building2, tone: "text-foreground" },
          { label: "Activas", value: counts.active ?? 0, icon: CheckCircle2, tone: "text-emerald-500" },
          { label: "Em avaliação", value: counts.trial ?? 0, icon: Clock, tone: "text-amber-500" },
          { label: "Em atraso", value: counts.overdue ?? 0, icon: AlertCircle, tone: "text-orange-500" },
          { label: "Suspensas", value: counts.suspended ?? 0, icon: AlertCircle, tone: "text-red-500" },
        ].map((k) => (
          <Card key={k.label} className="p-4 surface-card">
            <div className={`flex items-center gap-2 text-xs text-muted-foreground mb-2`}>
              <k.icon className={`h-3.5 w-3.5 ${k.tone}`} /> {k.label}
            </div>
            <p className="text-2xl font-semibold">{k.value}</p>
          </Card>
        ))}
      </div>

      <Card className="surface-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-semibold">Tenants</h3>
        </div>
        {isLoading ? (
          <div className="p-6"><LoadingState variant="table" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-2">Workspace</th>
                  <th className="text-left px-4 py-2">Estado</th>
                  <th className="text-left px-4 py-2">Ciclo</th>
                  <th className="text-right px-4 py-2">Técnicos</th>
                  <th className="text-right px-4 py-2">Preço</th>
                  <th className="text-left px-4 py-2">Renovação / Trial</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">{r.workspaces?.name ?? "—"}</td>
                    <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">{r.status}</Badge></td>
                    <td className="px-4 py-2 text-xs">{r.billing_cycle}</td>
                    <td className="px-4 py-2 text-right">{r.technician_count}</td>
                    <td className="px-4 py-2 text-right">{Number(r.current_price).toFixed(2)} €</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {r.current_period_end
                        ? new Date(r.current_period_end).toLocaleDateString("pt-PT")
                        : r.trial_ends_at
                          ? `Trial → ${new Date(r.trial_ends_at).toLocaleDateString("pt-PT")}`
                          : "—"}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-xs">Sem workspaces.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
