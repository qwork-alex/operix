import { DndContext, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import { WORKFLOW_STATUSES, WORKFLOW_STATUS_LABELS, isTransitionAllowed, type WorkflowStatus } from "@/lib/productionWorkflowStatus";
import { ProductionListCard } from "@/components/production-workflow/ProductionListCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useMoveProductionList, type ProductionListCardData } from "@/hooks/useProductionWorkflow";
import { ApiError } from "@/lib/api";

interface ProductionWorkflowBoardProps {
  lists: ProductionListCardData[];
  isLoading: boolean;
  onCardClick: (listName: string) => void;
}

function BoardColumn({ status, count, children }: { status: WorkflowStatus; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 flex flex-col rounded-xl border bg-muted/30 ${isOver ? "ring-2 ring-primary" : ""}`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h3 className="text-xs font-semibold text-foreground">{WORKFLOW_STATUS_LABELS[status]}</h3>
        <span className="text-[11px] text-muted-foreground rounded-full bg-background px-1.5 py-0.5 border">{count}</span>
      </div>
      <div className="flex-1 min-h-[120px] p-2 space-y-2 overflow-y-auto max-h-[70vh]">{children}</div>
    </div>
  );
}

export function ProductionWorkflowBoard({ lists, isLoading, onCardClick }: ProductionWorkflowBoardProps) {
  const moveMutation = useMoveProductionList();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const listsByStatus = new Map<string, ProductionListCardData[]>();
  for (const status of WORKFLOW_STATUSES) listsByStatus.set(status, []);
  for (const list of lists) {
    (listsByStatus.get(list.status) ?? listsByStatus.get("em_elaboracao")!).push(list);
  }
  const listByName = new Map(lists.map((l) => [l.listName, l]));

  const handleMove = (listName: string, toStatus: WorkflowStatus) => {
    moveMutation.mutate(
      { listName, toStatus },
      {
        onError: (err) => {
          const message = err instanceof ApiError ? err.message : "Não foi possível mover a lista.";
          toast.error(message);
        },
      },
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const listName = event.active.id as string;
    const toStatus = event.over?.id as WorkflowStatus | undefined;
    if (!toStatus) return;

    const list = listByName.get(listName);
    if (!list || list.status === toStatus) return;

    if (!isTransitionAllowed(list.status, toStatus)) {
      toast.error(`Não é possível mover de '${WORKFLOW_STATUS_LABELS[list.status]}' para '${WORKFLOW_STATUS_LABELS[toStatus]}' diretamente.`);
      return;
    }
    handleMove(listName, toStatus);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {WORKFLOW_STATUSES.map((status) => {
          const columnLists = listsByStatus.get(status) ?? [];
          return (
            <BoardColumn key={status} status={status} count={columnLists.length}>
              {isLoading ? (
                Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
              ) : columnLists.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-6">Nenhuma lista</p>
              ) : (
                columnLists.map((list) => (
                  <ProductionListCard
                    key={list.listName}
                    list={list}
                    onClick={() => onCardClick(list.listName)}
                    onMove={(toStatus) => handleMove(list.listName, toStatus)}
                  />
                ))
              )}
            </BoardColumn>
          );
        })}
      </div>
    </DndContext>
  );
}
