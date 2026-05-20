import { useState } from "react";
import { Archive, RotateCcw, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useRecoverableItems, useRestoreRecord, type RecoverableItem } from "@/hooks/useSoftDelete";

const entityLabels: Record<string, string> = {
  service_orders: "Ordem de Serviço",
  payment_orders: "Ordem de Pagamento",
  billing_invoices: "Fatura",
  financial_records: "Lançamento Financeiro",
  clients: "Cliente",
  vehicles: "Veículo",
  drivers: "Condutor",
  fleet_fuel_logs: "Abastecimento",
  fleet_trips: "Trajeto",
};

function fmt(d: string) {
  try { return new Date(d).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }); }
  catch { return d; }
}

export default function RecoveryPage() {
  const { data: items = [], isLoading } = useRecoverableItems();
  const restore = useRestoreRecord();
  const [pending, setPending] = useState<RecoverableItem | null>(null);

  return (
    <div className="module-shell">
      <PageHeader
        icon={History}
        title="Centro de Recuperação"
        subtitle="Itens arquivados nos últimos 90 dias. Podem ser restaurados."
      />

      {isLoading ? (
        <LoadingState variant="list" rows={5} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="Nenhum item arquivado"
          description="Quando um registo é arquivado, aparece aqui durante 90 dias para que possa ser restaurado."
        />
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <Card key={`${it.entity_type}-${it.id}`} className="surface-card surface-card-hover">
              <CardContent className="flex items-center justify-between gap-4 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {entityLabels[it.entity_type] ?? it.entity_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{fmt(it.deleted_at)}</span>
                  </div>
                  <p className="text-sm font-medium text-foreground truncate mt-1">{it.label}</p>
                  {it.deleted_reason && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      Motivo: {it.deleted_reason}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPending(it)}
                  disabled={restore.isPending}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Restaurar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        title="Restaurar este item?"
        description={pending ? `"${pending.label}" voltará a estar disponível no módulo correspondente.` : undefined}
        confirmLabel="Restaurar"
        variant="info"
        loading={restore.isPending}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          restore.mutate(
            { table: pending.entity_type, id: pending.id },
            { onSettled: () => setPending(null) },
          );
        }}
      />
    </div>
  );
}
