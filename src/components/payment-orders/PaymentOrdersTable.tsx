import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Json } from "@/integrations/supabase/types";

interface PaymentOrderRow {
  id: string;
  clients?: { name: string } | null;
  platform: string | null;
  list_name: string | null;
  technicians?: { name: string } | null;
  car_name: string | null;
  license_plate: string | null;
  services: Json | null;
  total: number | null;
  status: string;
}

const statusStyle: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  matched: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  mismatch: "bg-red-500/10 text-red-400 border-red-500/30",
};

export function PaymentOrdersTable({ orders, isLoading }: { orders: PaymentOrderRow[]; isLoading: boolean }) {
  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-border/50 bg-card p-8 text-center text-sm text-muted-foreground">
        No payment orders yet. Upload a payment document to get started.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="text-[11px]">
            <TableHead>Client</TableHead>
            <TableHead>Platform</TableHead>
            <TableHead>List</TableHead>
            <TableHead>Technician</TableHead>
            <TableHead>Car</TableHead>
            <TableHead>Plate</TableHead>
            <TableHead>Services</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => {
            const services = Array.isArray(o.services) ? o.services as { name: string; price: number }[] : [];
            return (
              <TableRow key={o.id} className="text-xs">
                <TableCell className="font-medium">{(o.clients as any)?.name || "—"}</TableCell>
                <TableCell>{o.platform || "—"}</TableCell>
                <TableCell>{o.list_name || "—"}</TableCell>
                <TableCell>{(o.technicians as any)?.name || "—"}</TableCell>
                <TableCell>{o.car_name || "—"}</TableCell>
                <TableCell className="font-mono text-[11px]">{o.license_plate || "—"}</TableCell>
                <TableCell className="max-w-[180px] truncate">
                  {services.map(s => s.name).join(", ") || "—"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">€{(o.total || 0).toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusStyle[o.status] || statusStyle.pending}>
                    {o.status}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
