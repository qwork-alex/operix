import { useSubscriptionEvents } from "@/hooks/useBilling";
import { Card } from "@/components/ui/card";
import { Activity, AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, any> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

const TONES: Record<string, string> = {
  info: "text-sky-500 bg-sky-500/10 border-sky-500/30",
  success: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
  warning: "text-amber-500 bg-amber-500/10 border-amber-500/30",
  error: "text-red-500 bg-red-500/10 border-red-500/30",
};

export function SubscriptionTimeline({ limit = 30 }: { limit?: number }) {
  const { data: events = [], isLoading } = useSubscriptionEvents(limit);

  return (
    <Card className="p-5 surface-card">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Timeline de assinatura</h3>
      </div>
      {isLoading && <div className="text-xs text-muted-foreground">A carregar…</div>}
      {!isLoading && events.length === 0 && (
        <div className="text-xs text-muted-foreground">Sem eventos ainda.</div>
      )}
      <ol className="relative space-y-3">
        {events.map((e: any) => {
          const Icon = ICONS[e.severity] || Info;
          return (
            <li key={e.id} className="flex gap-3">
              <div className={cn("h-7 w-7 shrink-0 rounded-full border grid place-items-center", TONES[e.severity] || TONES.info)}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{e.event_type}</div>
                {e.message && <div className="text-xs text-muted-foreground truncate">{e.message}</div>}
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                  {new Date(e.created_at).toLocaleString("pt-PT")}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
