import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, RefreshCcw, Repeat2, AlertTriangle, ArrowRight, Clock, Zap } from "lucide-react";
import { useRunAutomation } from "@/hooks/useAutomation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

function useLastAutomationRun() {
  return useQuery({
    queryKey: ["automation-last-run"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscription_events" as any)
        .select("created_at, metadata")
        .eq("event_type", "automation.run")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
    refetchInterval: 30_000,
  });
}

export function AutomationPanel() {
  const run = useRunAutomation();
  const { data: lastRun } = useLastAutomationRun();

  const stages = [
    { icon: RefreshCcw, label: "Renovações", desc: "Gera nova fatura quando o ciclo expira", tone: "text-amber-500" },
    { icon: Repeat2, label: "Retries", desc: "Tentativas escalonadas (3d → 5d → 7d)", tone: "text-violet-500" },
    { icon: AlertTriangle, label: "Dunning", desc: "Reminder · Warning · Limited · Suspension", tone: "text-red-500" },
    { icon: ArrowRight, label: "Transições", desc: "Active → Grace → Suspend → Archive · Restore", tone: "text-sky-500" },
  ];

  return (
    <Card className="p-5 surface-card relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-amber-500/5"
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold">Motor de automação SaaS</h3>
            <p className="text-xs text-muted-foreground">
              Pipeline lifecycle: renovações → tentativas → dunning → transições.
            </p>
          </div>
          <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {run.isPending ? "A correr…" : "Correr agora"}
          </Button>
        </div>

        <div className="flex items-center gap-4 mb-4 text-[11px] text-muted-foreground flex-wrap">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-emerald-500" />
            <span>Cron ativo · diário 03:00 UTC</span>
          </div>
          {lastRun?.created_at && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              <span>Última execução {formatDistanceToNow(new Date(lastRun.created_at), { addSuffix: true })}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {stages.map((s) => (
            <div key={s.label} className="rounded-md border border-border/60 bg-card/40 p-3">
              <div className={`flex items-center gap-2 text-xs font-semibold ${s.tone}`}>
                <s.icon className="h-3.5 w-3.5" /> {s.label}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-muted-foreground mt-4">
          Execução automática diária + dispatcher de emails a cada 5 minutos.
        </p>
      </div>
    </Card>
  );
}
