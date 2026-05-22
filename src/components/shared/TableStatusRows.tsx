import { TableRow, TableCell } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Normalized loading / empty rows for data tables across the platform.
 * Replaces ad-hoc <TableRow>...Carregando...</TableRow> snippets so spacing,
 * typography and icon usage stay consistent.
 */
export function TableLoadingRow({
  colSpan,
  label = "Carregando...",
}: { colSpan: number; label?: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className="text-center py-8 text-muted-foreground text-sm"
      >
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin opacity-70" />
          {label}
        </span>
      </TableCell>
    </TableRow>
  );
}

export function TableEmptyRow({
  colSpan,
  label = "Nenhum registo encontrado",
  className,
}: { colSpan: number; label?: string; className?: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className={cn("text-center py-8 text-muted-foreground text-sm", className)}
      >
        {label}
      </TableCell>
    </TableRow>
  );
}
