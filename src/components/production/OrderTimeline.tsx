import { useProductionTimeline } from "@/hooks/useProductionOrders";
import { Activity, ArrowRight, Camera, UserPlus, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props { orderId: string; }

const ICONS: Record<string, any> = {
  created: Activity,
  status_changed: ArrowRight,
  assigned: UserPlus,
  photo_added: Camera,
  priority_changed: AlertCircle,
};

export function OrderTimeline({ orderId }: Props) {
  const { data: events = [], isLoading } = useProductionTimeline(orderId);
  if (isLoading) return <div className="text-sm text-muted-foreground">Carregando histórico…</div>;
  if (!events.length) return <div className="text-sm text-muted-foreground">Sem eventos.</div>;

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
      {events.map((e: any) => {
        const Icon = ICONS[e.event_type] ?? Activity;
        return (
          <div key={e.id} className="flex gap-3 text-sm">
            <div className="flex flex-col items-center">
              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                <Icon className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="w-px flex-1 bg-border/60 mt-1" />
            </div>
            <div className="flex-1 pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{e.actor_name ?? "Sistema"}</span>
                <span className="text-muted-foreground">{labelFor(e)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: ptBR })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function labelFor(e: any) {
  switch (e.event_type) {
    case "created": return `criou a ordem (${e.to_value})`;
    case "status_changed": return `mudou status: ${e.from_value} → ${e.to_value}`;
    case "assigned": return `atribuiu para ${e.to_value ?? "—"}`;
    case "photo_added": return `enviou foto (${e.to_value})`;
    case "priority_changed": return `prioridade: ${e.from_value} → ${e.to_value}`;
    default: return e.event_type;
  }
}
