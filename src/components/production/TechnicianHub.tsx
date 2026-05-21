import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useProductionOrders, PRODUCTION_STATUSES, PRIORITY_META,
  type ProductionOrder, type ProductionStatus,
} from "@/hooks/useProductionOrders";
import { Camera, Play, Pause, CheckCircle2, ChevronRight } from "lucide-react";
import { OrderDetailDialog } from "./OrderDetailDialog";

const QUICK: { status: ProductionStatus; label: string; icon: any; cls: string }[] = [
  { status: "in_production", label: "Iniciar", icon: Play, cls: "bg-indigo-500 hover:bg-indigo-600 text-white" },
  { status: "paused", label: "Pausar", icon: Pause, cls: "bg-orange-500 hover:bg-orange-600 text-white" },
  { status: "finished", label: "Finalizar", icon: CheckCircle2, cls: "bg-emerald-500 hover:bg-emerald-600 text-white" },
];

export function TechnicianHub() {
  const { data: orders = [], update, isLoading } = useProductionOrders({ technicianOnly: true });
  const [open, setOpen] = useState<ProductionOrder | null>(null);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando…</div>;
  if (!orders.length) {
    return <div className="p-12 text-center text-muted-foreground">Nenhuma ordem atribuída.</div>;
  }

  return (
    <>
      <div className="space-y-3">
        {orders.map(o => {
          const statusMeta = PRODUCTION_STATUSES.find(s => s.value === o.status);
          return (
            <Card key={o.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3" onClick={() => setOpen(o)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-muted-foreground">{o.code}</span>
                    <Badge variant="outline" className={`text-[10px] ${PRIORITY_META[o.priority].tone}`}>
                      {PRIORITY_META[o.priority].label}
                    </Badge>
                  </div>
                  <div className="font-bold text-lg leading-tight">{o.license_plate || "Sem placa"}</div>
                  <div className="text-sm text-muted-foreground">
                    {[o.brand, o.model, o.color].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {o.client_name && <div className="text-xs text-muted-foreground mt-1">{o.client_name}</div>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className={`${statusMeta?.color} text-white text-[10px]`}>{statusMeta?.label}</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {QUICK.map(q => (
                  <Button key={q.status} size="sm" className={`h-12 ${q.cls}`}
                    onClick={(e) => { e.stopPropagation(); update.mutate({ id: o.id, status: q.status }); }}
                    disabled={o.status === q.status}>
                    <q.icon className="h-4 w-4 mr-1.5" /> {q.label}
                  </Button>
                ))}
                <Button size="sm" variant="outline" className="h-12"
                  onClick={(e) => { e.stopPropagation(); setOpen(o); }}>
                  <Camera className="h-4 w-4 mr-1.5" /> Fotos
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      <OrderDetailDialog order={open} onClose={() => setOpen(null)} />
    </>
  );
}
