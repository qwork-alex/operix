import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type PermissionRow = {
  id: string;
  module: string;
  action: string;
  label: string | null;
};

export type EffectiveState = {
  /** true = ativo, false = inativo, null = herda do role (apenas para overrides) */
  [permissionId: string]: boolean | null;
};

interface PermissionsMatrixProps {
  permissions: PermissionRow[];
  /** Mapa permission_id -> estado actual (true/false). null/undefined = não definido */
  values: Record<string, boolean | null | undefined>;
  /** Mapa permission_id -> estado herdado do role (só usado em modo override) */
  inherited?: Record<string, boolean>;
  onToggle: (permissionId: string, next: boolean | null) => void;
  isLoading?: boolean;
  /** Quando true mostra coluna "Herda" para limpar override */
  showInheritColumn?: boolean;
}

/** Core CRUD actions render in fixed order; everything else appears after as granular actions. */
const CORE_ACTIONS = ["view", "create", "edit", "delete"] as const;

const ACTION_LABEL: Record<string, string> = {
  view: "Ver",
  create: "Criar",
  edit: "Editar",
  delete: "Apagar",
  // granular labels (fallback to humanized action if unknown)
  upload_document: "Carregar",
  scan_document: "Digitalizar",
  assign_technician: "Atribuir téc.",
  validate_data: "Validar",
  export_pdf: "Export PDF",
  view_reports: "Ver relatórios",
  export_reports: "Export relat.",
  register_vehicle: "Registar veículo",
  register_driver: "Registar condutor",
  log_trip: "Reg. trajeto",
  log_fuel: "Reg. combustível",
};

const MODULE_LABEL: Record<string, string> = {
  dashboard: "Dashboard",
  service_orders: "Ordens de Serviço",
  payment_orders: "Ordens de Pagamento",
  financial: "Financeiro",
  profit: "Distribuição de Lucros",
  accounting: "Contabilidade",
  fleet: "Frota",
  documents: "Documentos",
  users: "Utilizadores",
  settings: "Configurações",
};

function humanize(action: string) {
  return ACTION_LABEL[action] ?? action.replace(/_/g, " ");
}

export function PermissionsMatrix({
  permissions,
  values,
  inherited,
  onToggle,
  isLoading,
  showInheritColumn,
}: PermissionsMatrixProps) {
  /** group by module, then sort actions: CORE first, granular after (alphabetical) */
  const grouped = useMemo(() => {
    const map = new Map<string, PermissionRow[]>();
    for (const p of permissions) {
      if (!map.has(p.module)) map.set(p.module, []);
      map.get(p.module)!.push(p);
    }
    for (const [, rows] of map) {
      rows.sort((a, b) => {
        const ai = CORE_ACTIONS.indexOf(a.action as any);
        const bi = CORE_ACTIONS.indexOf(b.action as any);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.action.localeCompare(b.action);
      });
    }
    return Array.from(map.entries());
  }, [permissions]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="text-[11px]">
            <TableHead className="w-[180px]">Módulo</TableHead>
            <TableHead>Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {grouped.map(([module, perms]) => (
            <TableRow key={module} className="text-xs align-top">
              <TableCell className="font-medium pt-3">
                {MODULE_LABEL[module] || module}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-x-4 gap-y-2 py-1">
                  {perms.map((perm) => {
                    const raw = values[perm.id];
                    const inheritedVal = inherited?.[perm.id] ?? false;
                    const isOverride = raw === true || raw === false;
                    const checked = isOverride ? raw : (showInheritColumn ? inheritedVal : false);
                    const isCore = (CORE_ACTIONS as readonly string[]).includes(perm.action);
                    return (
                      <label
                        key={perm.id}
                        className={`flex items-center gap-2 px-2 py-1 rounded-md border transition-colors cursor-pointer
                          ${checked ? "border-primary/40 bg-primary/5" : "border-border/40 hover:bg-muted/40"}
                          ${!isCore ? "border-dashed" : ""}`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            if (showInheritColumn && Boolean(v) === inheritedVal) {
                              onToggle(perm.id, null);
                            } else {
                              onToggle(perm.id, Boolean(v));
                            }
                          }}
                        />
                        <span className="text-[11px] leading-tight">
                          {humanize(perm.action)}
                          {showInheritColumn && (
                            <span className="block text-[9px] text-muted-foreground/60 leading-none mt-0.5">
                              {isOverride ? "override" : "herda"}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
