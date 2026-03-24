import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Trash2, Pencil } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";

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
  const { t, formatCurrency } = useLanguage();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service_orders"] });
      toast.success(t("toast.deleted"));
    },
    onError: (err) => toast.error((err as Error).message),
  });

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
        <p className="text-sm">{t("so.noOrders")}</p>
        <p className="text-xs mt-1">{t("so.uploadHint")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/30">
            <TableHead>{t("label.client")}</TableHead>
            <TableHead>{t("label.platform")}</TableHead>
            <TableHead>{t("label.technician")}</TableHead>
            <TableHead>{t("label.week")}</TableHead>
            <TableHead>{t("label.car")}</TableHead>
            <TableHead>{t("label.plate")}</TableHead>
            <TableHead>{t("label.services")}</TableHead>
            <TableHead className="text-right">{t("label.total")}</TableHead>
            <TableHead>{t("label.status")}</TableHead>
            <TableHead>{t("label.actions")}</TableHead>
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
                  {o.total != null ? formatCurrency(Number(o.total)) : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusStyle[o.status] || statusStyle.draft}>
                    {o.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => deleteMutation.mutate(o.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
