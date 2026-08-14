import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useProductionLists, type ProductionWorkflowFilters } from "@/hooks/useProductionWorkflow";

const ALL = "__all__";

interface ProductionWorkflowFiltersBarProps {
  filters: ProductionWorkflowFilters;
  onChange: (filters: ProductionWorkflowFilters) => void;
}

/**
 * Options are derived from the unfiltered board data itself (year, Local,
 * Técnico) rather than a dedicated lookup endpoint, since this feature is a
 * read layer over data that already exists — no new lookup tables needed.
 */
export function ProductionWorkflowFiltersBar({ filters, onChange }: ProductionWorkflowFiltersBarProps) {
  const { data: allLists = [] } = useProductionLists({});

  const years = useMemo(
    () => Array.from(new Set(allLists.map((l) => l.year))).sort((a, b) => b - a),
    [allLists],
  );
  const clients = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of allLists) if (l.clientId && l.clientName) map.set(l.clientId, l.clientName);
    return Array.from(map.entries());
  }, [allLists]);
  const operationalUnits = useMemo(
    () => Array.from(new Set(allLists.map((l) => l.operationalUnit).filter((v): v is string => !!v))),
    [allLists],
  );
  const technicians = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of allLists) if (l.technicianId && l.technicianName) map.set(l.technicianId, l.technicianName);
    return Array.from(map.entries());
  }, [allLists]);

  const hasActiveFilters = !!(filters.year || filters.clientId || filters.operationalUnit || filters.technicianId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={filters.year ? String(filters.year) : ALL}
        onValueChange={(v) => onChange({ ...filters, year: v === ALL ? undefined : Number(v) })}
      >
        <SelectTrigger className="h-9 w-[110px] text-xs"><SelectValue placeholder="Ano" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Ano</SelectItem>
          {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select
        value={filters.clientId ?? ALL}
        onValueChange={(v) => onChange({ ...filters, clientId: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Cliente" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Cliente</SelectItem>
          {clients.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select
        value={filters.operationalUnit ?? ALL}
        onValueChange={(v) => onChange({ ...filters, operationalUnit: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Local" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Local</SelectItem>
          {operationalUnits.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select
        value={filters.technicianId ?? ALL}
        onValueChange={(v) => onChange({ ...filters, technicianId: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Técnico" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Técnico</SelectItem>
          {technicians.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => onChange({})}>
          <X className="h-3.5 w-3.5 mr-1" /> Limpar filtros
        </Button>
      )}
    </div>
  );
}
