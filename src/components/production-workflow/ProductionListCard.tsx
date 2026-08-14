import { useDraggable } from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Building2, User, CalendarDays, Package, MoveRight } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";
import { useCan } from "@/hooks/usePermission";
import type { ProductionListCardData } from "@/hooks/useProductionWorkflow";
import { allowedDestinations, WORKFLOW_STATUS_LABELS } from "@/lib/productionWorkflowStatus";

interface ProductionListCardProps {
  list: ProductionListCardData;
  onClick: () => void;
  onMove: (toStatus: ReturnType<typeof allowedDestinations>[number]["to"]) => void;
}

/**
 * Client-side mirror of the backend's partner restriction (canRoleMoveTransition
 * in backend/src/routes/productionWorkflow.ts) — a UI hint only. The PATCH
 * endpoint re-validates every move server-side (FR-013, SC-005).
 */
const PARTNER_ALLOWED_STATUSES = ["em_elaboracao", "aguardando_assinatura", "aguardando_aprovacao", "correcao_necessaria"];

export function ProductionListCard({ list, onClick, onMove }: ProductionListCardProps) {
  const { formatCurrency } = useLanguage();
  const { dbRole, isAdmin } = useRole();
  const { can } = useCan();

  const canMoveAtAll = isAdmin || can("production_workflow", "move").allowed;
  const isOwnerOrAdmin = isAdmin;
  const isPartner = dbRole === "partner";

  const destinations = allowedDestinations(list.status).filter((dest) => {
    if (!canMoveAtAll) return false;
    if (dest.manual) {
      // Automatic-placeholder columns aside, manual transitions for partners
      // are limited to the pre-invoicing part of the flow.
      if (isPartner) return PARTNER_ALLOWED_STATUSES.includes(list.status) && PARTNER_ALLOWED_STATUSES.includes(dest.to);
      return true;
    }
    // Confirm-only (placeholder-automatic) transitions: owner/admin only.
    return isOwnerOrAdmin;
  });

  const draggableDestinations = new Set(destinations.filter((d) => d.manual).map((d) => d.to));
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: list.listName,
    data: { fromStatus: list.status },
    disabled: draggableDestinations.size === 0,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`p-3 space-y-2 hover:shadow-md transition-shadow ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onClick}
          className="text-sm font-semibold text-foreground truncate text-left hover:underline"
        >
          {list.clientName || "—"}
        </button>
        <Badge variant="outline" className="shrink-0 text-[10px] font-mono">{list.listName}</Badge>
      </div>

      <div {...attributes} {...listeners} className={draggableDestinations.size > 0 ? "cursor-grab" : ""}>
        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{list.operationalUnit || "—"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{list.technicianName || "—"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span>Semana {list.week}/{list.year}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          <span>{list.itemCount} {list.itemCount === 1 ? "item" : "itens"}</span>
        </div>
        <span className="text-sm font-semibold text-primary tabular-nums">{formatCurrency(list.totalValue)}</span>
      </div>

      {destinations.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-full h-7 text-[11px]">
              <MoveRight className="h-3 w-3 mr-1" /> Mover para...
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel className="text-[11px]">Mover lista</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {destinations.map((dest) => (
              <DropdownMenuItem key={dest.to} onClick={() => onMove(dest.to)} className="text-xs">
                {dest.manual ? "Mover para" : "Confirmar"}: {WORKFLOW_STATUS_LABELS[dest.to]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </Card>
  );
}
