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
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produção</h1>
          <p className="text-sm text-muted-foreground">Pipeline operacional de veículos em tempo real.</p>
        </div>
        <Button onClick={() => setOpen(BLANK)} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Ordem
        </Button>
      </div>

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board"><LayoutGrid className="h-4 w-4 mr-2" /> Kanban</TabsTrigger>
          <TabsTrigger value="my"><Wrench className="h-4 w-4 mr-2" /> Minhas Ordens</TabsTrigger>
          <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-2" /> Dashboard</TabsTrigger>
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
