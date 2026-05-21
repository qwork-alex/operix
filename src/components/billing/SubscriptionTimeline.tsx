import { useMemo } from "react";
import { useSubscriptionEvents } from "@/hooks/useBilling";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, AlertTriangle, CheckCircle2, Info, XCircle, CreditCard, TrendingUp,
  Sparkles, RotateCcw, X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, any> = {
  trial_started: Sparkles,
  payment_succeeded: CheckCircle2,
  payment_failed: XCircle,
  invoice_paid: CheckCircle2,
  invoice_payment_failed: XCircle,
  subscription_created: Sparkles,
  subscription_updated: TrendingUp,
  subscription_renewed: RotateCcw,
  subscription_cancelled: XIcon,
  upgrade: TrendingUp,
  downgrade: TrendingUp,
  card_expiring: CreditCard,
  manual_transfer_declared: Info,
};

const TONES: Record<string, string> = {
  info:    "text-sky-400 bg-sky-500/10 border-sky-500/30 shadow-[0_0_12px_rgba(56,189,248,0.18)]",
  success: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.18)]",
  warning: "text-amber-400 bg-amber-500/10 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.18)]",
  error:   "text-red-400 bg-red-500/10 border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.18)]",
};

function fmtMonth(d: string) {
  return new Date(d).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
}

function humanType(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SubscriptionTimeline({ limit = 80 }: { limit?: number }) {
  const { data: events = [], isLoading } = useSubscriptionEvents(limit);

  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    events.forEach((e: any) => {
      const key = fmtMonth(e.created_at);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    });
    return Array.from(m.entries());
  }, [events]);

  return (
    <Card className="p-5 surface-card">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Histórico da subscrição</h3>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : events.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <Activity className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          Sem eventos registados ainda.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([month, items]) => (
            <div key={month}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 font-semibold">{month}</p>
              <ol className="relative space-y-3 border-l border-border/40 pl-4 ml-3">
                {items.map((e: any) => {
                  const Icon = ICONS[e.event_type] || ICONS[e.severity] || Info;
                  const tone = TONES[e.severity] || TONES.info;
                  return (
                    <li key={e.id} className="relative">
                      <div className={cn("absolute -left-[26px] top-0 h-6 w-6 rounded-full border grid place-items-center", tone)}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <div className="text-xs font-semibold">{humanType(e.event_type)}</div>
                      {e.message && <div className="text-xs text-muted-foreground">{e.message}</div>}
                      <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                        {new Date(e.created_at).toLocaleString("pt-PT")}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
