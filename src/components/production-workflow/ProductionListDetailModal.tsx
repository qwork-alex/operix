import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/hooks/useLanguage";
import { useProductionListItems } from "@/hooks/useProductionWorkflow";
import { formatLicensePlate } from "@/lib/formatPlate";

interface ProductionListDetailModalProps {
  listName: string | null;
  onClose: () => void;
}

export function ProductionListDetailModal({ listName, onClose }: ProductionListDetailModalProps) {
  const { formatCurrency } = useLanguage();
  const { data: items = [], isLoading } = useProductionListItems(listName);

  return (
    <Dialog open={!!listName} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{listName}</DialogTitle>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Plataforma</TableHead>
              <TableHead>Técnico</TableHead>
              <TableHead>Semana</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Placa</TableHead>
              <TableHead>Serviços</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhum item encontrado para esta lista.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.clientName || "—"}</TableCell>
                  <TableCell>{item.platform || "—"}</TableCell>
                  <TableCell>{item.technicianName || "—"}</TableCell>
                  <TableCell>{item.week}</TableCell>
                  <TableCell>{item.carName || "—"}</TableCell>
                  <TableCell>{item.licensePlate ? formatLicensePlate(item.licensePlate) : "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {(item.services ?? []).map((s) => s.name).filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {item.total != null ? formatCurrency(Number(item.total)) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
