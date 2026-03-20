import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface ServiceOrderRow {
  id: string;
  client_id: string | null;
  platform: string | null;
  technician_id: string | null;
  week: string | null;
  car_name: string | null;
  license_plate: string | null;
  service_1_name: string | null;
  service_1_price: number | null;
  service_2_name: string | null;
  service_2_price: number | null;
  service_3_name: string | null;
  service_3_price: number | null;
  service_4_name: string | null;
  service_4_price: number | null;
  total: number | null;
  status: string;
  created_at: string;
  clients?: { name: string } | null;
  technicians?: { name: string } | null;
}

interface ServiceOrdersTableProps {
  orders: ServiceOrderRow[];
  isLoading: boolean;
}

const statusStyle: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  confirmed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  invoiced: "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

export function ServiceOrdersTable({ orders, isLoading }: ServiceOrdersTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!orders.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">No service orders yet.</p>
        <p className="text-xs mt-1">Upload a document above to get started.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/30">
            <TableHead>Client</TableHead>
            <TableHead>Platform</TableHead>
            <TableHead>Technician</TableHead>
            <TableHead>Week</TableHead>
            <TableHead>Car</TableHead>
            <TableHead>Plate</TableHead>
            <TableHead>Services</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => {
            const services = [
              o.service_1_name,
              o.service_2_name,
              o.service_3_name,
              o.service_4_name,
            ].filter(Boolean);
            return (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{(o as any).clients?.name || "—"}</TableCell>
                <TableCell>{o.platform || "—"}</TableCell>
                <TableCell>{(o as any).technicians?.name || "—"}</TableCell>
                <TableCell>{o.week || "—"}</TableCell>
                <TableCell>{o.car_name || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{o.license_plate || "—"}</TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {services.length ? services.join(", ") : "—"}
                  </span>
                </TableCell>
                <TableCell className="text-right font-semibold text-primary tabular-nums">
                  {o.total != null ? `€${Number(o.total).toFixed(2)}` : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusStyle[o.status] || statusStyle.draft}>
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
