import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Clock, User, AlertTriangle } from "lucide-react";
import {
  useProductionOrders, PRODUCTION_STATUSES, PRIORITY_META,
  type ProductionOrder,
} from "@/hooks/useProductionOrders";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props { onOpen: (o: ProductionOrder) => void; }

export function ProductionBoard({ onOpen }: Props) {
  const { data: orders = [], isLoading, update } = useProductionOrders();

  const grouped = useMemo(() => {
    const m = new Map<string, ProductionOrder[]>();
    PRODUCTION_STATUSES.forEach(s => m.set(s.value, []));
    orders.forEach(o => m.get(o.status)?.push(o));
    return m;
  }, [orders]);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Carregando…</div>;

  const onDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    const order = orders.find(o => o.id === id);
    if (order && order.status !== status) {
      update.mutate({ id, status: status as any });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3 pb-4 md:flex md:gap-3 md:overflow-x-auto">
      {PRODUCTION_STATUSES.map(col => {
        const items = grouped.get(col.value) ?? [];
        return (
          <div
            key={col.value}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, col.value)}
            className="min-w-0 rounded-xl bg-muted/30 p-3 md:w-72 md:flex-shrink-0 md:max-h-[calc(100svh-280px)] md:overflow-y-auto"
          >
            <div className="sticky top-0 z-10 mb-3 flex items-center justify-between bg-muted/30 py-2 backdrop-blur md:py-1">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${col.color}`} />
                <h3 className="text-sm font-semibold">{col.label}</h3>
              </div>
              <Badge variant="secondary" className="text-xs">{items.length}</Badge>
            </div>
            <div className="space-y-2">
              {items.map(o => (
                <Card
                  key={o.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", o.id)}
                  onClick={() => onOpen(o)}
                  className="min-h-[96px] cursor-pointer space-y-2 p-4 touch-manipulation transition-all hover:border-primary/40 hover:shadow-md md:min-h-0 md:p-3 md:space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-mono text-muted-foreground">{o.code}</span>
                    {o.priority !== "normal" && (
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${PRIORITY_META[o.priority].tone}`}>
                        {PRIORITY_META[o.priority].label}
                      </Badge>
                    )}
                  </div>
                  <div className="font-medium text-sm leading-snug md:truncate">
                    {o.license_plate || "Sem placa"} {o.brand && `· ${o.brand}`}
                  </div>
                  {o.client_name && <div className="text-xs text-muted-foreground md:truncate">{o.client_name}</div>}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                    {o.technician_name ? (
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{o.technician_name.split(" ")[0]}</span>
                    ) : <span />}
                    {o.due_at && new Date(o.due_at) < new Date() ? (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-3 w-3" /> Atrasado
                      </span>
                    ) : o.due_at ? (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />{formatDistanceToNow(new Date(o.due_at), { locale: ptBR })}
                      </span>
                    ) : null}
                  </div>
                </Card>
              ))}
              {items.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-8 opacity-60">vazio</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
