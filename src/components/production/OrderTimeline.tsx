import { useProductionTimeline } from "@/hooks/useProductionOrders";
import { Activity, ArrowRight, Camera, UserPlus, AlertCircle, Edit3, Pause, Play, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props { orderId: string; }

const ICONS: Record<string, any> = {
  created: Activity,
  status_changed: ArrowRight,
  assigned: UserPlus,
  photo_added: Camera,
  priority_changed: AlertCircle,
  field_updated: Edit3,
};

export function OrderTimeline({ orderId }: Props) {
  const { data: events = [], isLoading } = useProductionTimeline(orderId);
  if (isLoading) return <div className="text-sm text-muted-foreground">Carregando histórico…</div>;
  if (!events.length) return <div className="text-sm text-muted-foreground">Sem eventos.</div>;

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
      {events.map((e: any) => {
        const Icon = iconFor(e);
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
                {new Date(e.created_at).toLocaleString("pt-PT")} · {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: ptBR })}
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
    case "created": return `criou a ordem (${statusLabel(e.to_value)})`;
    case "status_changed": return statusActionLabel(e.from_value, e.to_value);
    case "assigned": return `atribuiu para ${e.to_value ?? "—"}`;
    case "photo_added": return `enviou foto (${photoLabel(e.to_value)})`;
    case "priority_changed": return `alterou prioridade: ${e.from_value} → ${e.to_value}`;
    case "field_updated":
      if (e.to_value === "minimized") return "minimizou a ordem (continua ativa)";
      if (e.to_value === "resumed") return "retomou a ordem";
      return "editou dados da ordem";
    default: return e.event_type;
  }
}

function iconFor(e: any) {
  if (e.event_type === "status_changed") {
    if (e.to_value === "paused") return Pause;
    if (e.from_value === "paused" && e.to_value === "in_production") return Play;
    if (e.to_value === "finished") return CheckCircle2;
  }
  return ICONS[e.event_type] ?? Activity;
}

function statusActionLabel(from?: string | null, to?: string | null) {
  if (to === "paused") return "pausou a ordem";
  if (from === "paused" && to === "in_production") return "retomou a ordem";
  if (to === "finished") return "finalizou a ordem";
  return `alterou status: ${statusLabel(from)} → ${statusLabel(to)}`;
}

function statusLabel(value?: string | null) {
  const labels: Record<string, string> = {
    new_vehicle: "Novo Veículo",
    triage: "Em Triagem",
    awaiting_validation: "Aguardando Validação",
    in_production: "Em Produção",
    paused: "Pausado",
    finished: "Finalizado",
    invoiced: "Faturado",
    delivered: "Entregue",
  };
  return value ? labels[value] ?? value : "—";
}

function photoLabel(value?: string | null) {
  const labels: Record<string, string> = { before: "Antes", during: "Durante", after: "Depois", damage: "Danos", validation: "Validação" };
  return value ? labels[value] ?? value : "—";
}
