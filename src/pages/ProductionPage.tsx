import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, LayoutGrid, BarChart3, Wrench } from "lucide-react";
import { ProductionBoard } from "@/components/production/ProductionBoard";
import { TechnicianHub } from "@/components/production/TechnicianHub";
import { OperationalDashboard } from "@/components/production/OperationalDashboard";
import { OrderDetailDialog } from "@/components/production/OrderDetailDialog";
import type { ProductionOrder } from "@/hooks/useProductionOrders";

const BLANK: ProductionOrder = {
  id: "__new__", workspace_id: "", code: "", client_id: null, client_name: null,
  technician_user_id: null, technician_name: null, platform: null, insurer: null,
  license_plate: null, vin: null, brand: null, model: null, color: null, notes: null,
  priority: "normal", status: "new_vehicle", due_at: null, started_at: null,
  finished_at: null, delivered_at: null, service_order_id: null, created_by: "",
  created_at: "", updated_at: "",
};

export default function ProductionPage() {
  const [open, setOpen] = useState<ProductionOrder | null>(null);

  return (
    <div className="min-w-0 max-w-full space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Produção</h1>
          <p className="text-sm text-muted-foreground">Pipeline operacional de veículos em tempo real.</p>
        </div>
        <Button onClick={() => setOpen(BLANK)} className="h-11 w-full gap-2 sm:w-auto md:h-10">
          <Plus className="h-4 w-4" /> Nova Ordem
        </Button>
      </div>

      <Tabs defaultValue="board" className="min-w-0 max-w-full">
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1 md:inline-flex md:w-auto">
          <TabsTrigger value="board" className="min-h-10 gap-1.5 px-2 text-xs md:text-sm"><LayoutGrid className="h-4 w-4" /> <span className="truncate">Pipeline</span></TabsTrigger>
          <TabsTrigger value="my" className="min-h-10 gap-1.5 px-2 text-xs md:text-sm"><Wrench className="h-4 w-4" /> <span className="truncate">Minhas</span></TabsTrigger>
          <TabsTrigger value="dashboard" className="min-h-10 gap-1.5 px-2 text-xs md:text-sm"><BarChart3 className="h-4 w-4" /> <span className="truncate">Painel</span></TabsTrigger>
        </TabsList>
        <TabsContent value="board" className="mt-4">
          <ProductionBoard onOpen={setOpen} />
        </TabsContent>
        <TabsContent value="my" className="mt-4">
          <TechnicianHub />
        </TabsContent>
        <TabsContent value="dashboard" className="mt-4">
          <OperationalDashboard />
        </TabsContent>
      </Tabs>

      <OrderDetailDialog order={open} onClose={() => setOpen(null)} />
    </div>
  );
}
