import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type PermissionRow = {
  id: string;
  module: string;
  action: "view" | "create" | "edit" | "delete";
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

const ACTION_ORDER: PermissionRow["action"][] = ["view", "create", "edit", "delete"];
const ACTION_LABEL: Record<PermissionRow["action"], string> = {
  view: "Ver",
  create: "Criar",
  edit: "Editar",
  delete: "Apagar",
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

export function PermissionsMatrix({
  permissions,
  values,
  inherited,
  onToggle,
  isLoading,
  showInheritColumn,
}: PermissionsMatrixProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, Record<string, PermissionRow>>();
    for (const p of permissions) {
      if (!map.has(p.module)) map.set(p.module, {});
      map.get(p.module)![p.action] = p;
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
            <TableHead className="w-[200px]">Módulo</TableHead>
            {ACTION_ORDER.map((a) => (
              <TableHead key={a} className="text-center w-[90px]">{ACTION_LABEL[a]}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {grouped.map(([module, actions]) => (
            <TableRow key={module} className="text-xs">
              <TableCell className="font-medium">
                {MODULE_LABEL[module] || module}
              </TableCell>
              {ACTION_ORDER.map((action) => {
                const perm = actions[action];
                if (!perm) return <TableCell key={action} />;
                const raw = values[perm.id];
                const inheritedVal = inherited?.[perm.id] ?? false;
                const isOverride = raw === true || raw === false;
                const checked = isOverride ? raw : (showInheritColumn ? inheritedVal : false);
                return (
                  <TableCell key={action} className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          // Se em modo override e o novo estado coincide com o herdado, limpar override
                          if (showInheritColumn && Boolean(v) === inheritedVal) {
                            onToggle(perm.id, null);
                          } else {
                            onToggle(perm.id, Boolean(v));
                          }
                        }}
                      />
                      {showInheritColumn && (
                        <span className="text-[9px] text-muted-foreground/60 leading-none">
                          {isOverride ? "override" : "herda"}
                        </span>
                      )}
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
