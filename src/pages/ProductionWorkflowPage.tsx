import { useState } from "react";
import { Workflow } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useProductionLists, type ProductionWorkflowFilters } from "@/hooks/useProductionWorkflow";
import { ProductionWorkflowBoard } from "@/components/production-workflow/ProductionWorkflowBoard";
import { ProductionListDetailModal } from "@/components/production-workflow/ProductionListDetailModal";
import { ProductionWorkflowFiltersBar } from "@/components/production-workflow/ProductionWorkflowFilters";

export default function ProductionWorkflowPage() {
  const { t } = useLanguage();
  const [filters, setFilters] = useState<ProductionWorkflowFilters>({});
  const [selectedListName, setSelectedListName] = useState<string | null>(null);

  const { data: lists = [], isLoading } = useProductionLists(filters);

  return (
    <div className="animate-fade-in flex min-h-full w-full min-w-0 flex-col gap-3 overflow-visible md:gap-2">
      <header className="sticky top-0 z-30 -mx-3 flex shrink-0 flex-col gap-3 border-b border-border/40 bg-background/95 px-3 pb-3 pt-1 backdrop-blur sm:-mx-4 sm:px-4 md:static md:mx-0 md:flex-row md:items-center md:justify-between md:bg-transparent md:px-1 md:pb-2 md:pt-0 md:backdrop-blur-none">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Workflow className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">{t("productionWorkflow.title", "Workflow de Produção")}</h1>
            <p className="text-[11px] text-muted-foreground truncate">
              {t("productionWorkflow.subtitle", "Acompanhamento do fluxo de produção por lista")}
            </p>
          </div>
        </div>
      </header>

      <ProductionWorkflowFiltersBar filters={filters} onChange={setFilters} />

      <ProductionWorkflowBoard lists={lists} isLoading={isLoading} onCardClick={setSelectedListName} />

      <ProductionListDetailModal
        listName={selectedListName}
        onClose={() => setSelectedListName(null)}
      />
    </div>
  );
}
