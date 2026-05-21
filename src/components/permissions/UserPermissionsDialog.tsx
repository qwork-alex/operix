import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RotateCcw, Eye, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useInvalidatePermissions } from "@/hooks/usePermission";

interface UserPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  userName?: string;
  userRole?: string;
}

type PermissionRow = { id: string; module: string; action: string };

/**
 * UI catalog — granular, organized by module and optional subgroup.
 * Each leaf maps to a (dbModule, dbAction) tuple. When the tuple does not
 * yet exist in the `permissions` catalog, the toggle renders as "Brevemente"
 * (disabled) so we never persist orphan rows. Backend remains untouched.
 */
type CatalogItem = {
  label: string;
  /** db module name */
  m: string;
  /** db action name */
  a: string;
};

type CatalogGroup = {
  label: string;
  items: CatalogItem[];
};

type CatalogModule = {
  key: string;
  label: string;
  /** Flat list (no subgroups) */
  items?: CatalogItem[];
  /** Subgroups (replaces items when present) */
  groups?: CatalogGroup[];
};

const CATALOG: CatalogModule[] = [
  {
    key: "dashboard",
    label: "Painel",
    items: [
      { label: "Ver painel", m: "dashboard", a: "view" },
      { label: "Ver dashboard", m: "dashboard", a: "view_dashboard" },
      { label: "Relatar granizo", m: "dashboard", a: "report_hail" },
      { label: "Editar dashboard", m: "dashboard", a: "edit" },
    ],
  },
  {
    key: "production",
    label: "Produção",
    items: [
      { label: "Ver pipeline", m: "production", a: "view_pipeline" },
      { label: "Ver minhas ordens", m: "production", a: "view_own" },
      { label: "Ver painel de bordo", m: "production", a: "view_board" },
      { label: "Criar ordem", m: "production", a: "create" },
      { label: "Editar ordem", m: "production", a: "edit" },
      { label: "Apagar ordem", m: "production", a: "delete" },
      { label: "Validar ordem", m: "production", a: "validate" },
    ],
  },
  {
    key: "service_orders",
    label: "Ordens de serviço",
    items: [
      { label: "Ver", m: "service_orders", a: "view" },
      { label: "Criar", m: "service_orders", a: "create" },
      { label: "Editar", m: "service_orders", a: "edit" },
      { label: "Apagar", m: "service_orders", a: "delete" },
      { label: "Exportar PDF", m: "service_orders", a: "export_pdf" },
      { label: "Digitalizar", m: "service_orders", a: "scan_document" },
      { label: "Carregar documentos", m: "service_orders", a: "upload_document" },
      { label: "Validar", m: "service_orders", a: "validate_data" },
      { label: "Atribuir técnico", m: "service_orders", a: "assign_technician" },
    ],
  },
  {
    key: "payment_orders",
    label: "Ordens de pagamento",
    items: [
      { label: "Ver", m: "payment_orders", a: "view" },
      { label: "Criar", m: "payment_orders", a: "create" },
      { label: "Editar", m: "payment_orders", a: "edit" },
      { label: "Apagar", m: "payment_orders", a: "delete" },
      { label: "Exportar PDF", m: "payment_orders", a: "export_pdf" },
      { label: "Digitalizar", m: "payment_orders", a: "scan_document" },
      { label: "Carregar documentos", m: "payment_orders", a: "upload_document" },
      { label: "Validar", m: "payment_orders", a: "validate_data" },
      { label: "Atribuir técnico", m: "payment_orders", a: "assign_technician" },
    ],
  },
  {
    key: "billing",
    label: "Faturamento",
    groups: [
      {
        label: "Faturas",
        items: [
          { label: "Ver", m: "billing_invoices", a: "view" },
          { label: "Criar", m: "billing_invoices", a: "create" },
          { label: "Editar", m: "billing_invoices", a: "edit" },
          { label: "Apagar", m: "billing_invoices", a: "delete" },
          { label: "Exportar", m: "billing_invoices", a: "export" },
        ],
      },
      {
        label: "Pagamentos",
        items: [
          { label: "Ver", m: "billing_payments", a: "view" },
          { label: "Criar", m: "billing_payments", a: "create" },
          { label: "Editar", m: "billing_payments", a: "edit" },
          { label: "Apagar", m: "billing_payments", a: "delete" },
          { label: "Exportar", m: "billing_payments", a: "export" },
        ],
      },
      {
        label: "Conciliação",
        items: [
          { label: "Ver", m: "billing_reconciliation", a: "view" },
          { label: "Editar", m: "billing_reconciliation", a: "edit" },
          { label: "Exportar", m: "billing_reconciliation", a: "export" },
        ],
      },
      {
        label: "Contas a vencer",
        items: [
          { label: "Ver", m: "billing_aging", a: "view" },
          { label: "Exportar", m: "billing_aging", a: "export" },
        ],
      },
      {
        label: "Clientes",
        items: [
          { label: "Ver", m: "billing_clients", a: "view" },
          { label: "Criar", m: "billing_clients", a: "create" },
          { label: "Editar", m: "billing_clients", a: "edit" },
          { label: "Apagar", m: "billing_clients", a: "delete" },
        ],
      },
      {
        label: "Relatórios",
        items: [
          { label: "Ver", m: "billing_reports", a: "view" },
          { label: "Exportar", m: "billing_reports", a: "export" },
        ],
      },
    ],
  },
  {
    key: "financial",
    label: "Financeiro",
    groups: [
      {
        label: "Confronto SOP",
        items: [
          { label: "Ver", m: "fin_confronto", a: "view" },
          { label: "Criar", m: "fin_confronto", a: "create" },
          { label: "Editar", m: "fin_confronto", a: "edit" },
          { label: "Apagar", m: "fin_confronto", a: "delete" },
        ],
      },
      {
        label: "Distribuição de lucro",
        items: [
          { label: "Ver", m: "profit", a: "view" },
          { label: "Criar", m: "profit", a: "create" },
          { label: "Editar", m: "profit", a: "edit" },
          { label: "Apagar", m: "profit", a: "delete" },
        ],
      },
      {
        label: "Contabilidade",
        items: [
          { label: "Ver", m: "accounting", a: "view" },
          { label: "Criar", m: "accounting", a: "create" },
          { label: "Editar", m: "accounting", a: "edit" },
          { label: "Apagar", m: "accounting", a: "delete" },
        ],
      },
      {
        label: "Detalhamento",
        items: [
          { label: "Ver", m: "financial", a: "view" },
          { label: "Editar", m: "financial", a: "edit" },
          { label: "Ver relatórios", m: "financial", a: "view_reports" },
          { label: "Exportar relatórios", m: "financial", a: "export_reports" },
        ],
      },
      {
        label: "Participação",
        items: [
          { label: "Ver", m: "fin_participation", a: "view" },
          { label: "Editar", m: "fin_participation", a: "edit" },
        ],
      },
      {
        label: "Auditoria",
        items: [
          { label: "Ver", m: "fin_audit", a: "view" },
          { label: "Exportar", m: "fin_audit", a: "export" },
        ],
      },
      {
        label: "Integridade",
        items: [
          { label: "Ver", m: "fin_integrity", a: "view" },
          { label: "Editar", m: "fin_integrity", a: "edit" },
        ],
      },
    ],
  },
  {
    key: "fleet",
    label: "Frota",
    items: [
      { label: "Ver", m: "fleet", a: "view" },
      { label: "Criar", m: "fleet", a: "create" },
      { label: "Editar", m: "fleet", a: "edit" },
      { label: "Apagar", m: "fleet", a: "delete" },
      { label: "Exportar relatórios", m: "fleet", a: "export_reports" },
      { label: "Registrar combustível", m: "fleet", a: "log_fuel" },
      { label: "Registrar trajeto", m: "fleet", a: "log_trip" },
      { label: "Registrar veículo", m: "fleet", a: "register_vehicle" },
      { label: "Registrar condutor", m: "fleet", a: "register_driver" },
    ],
  },
  {
    key: "documents",
    label: "Documentos",
    items: [
      { label: "Ver", m: "documents", a: "view" },
      { label: "Criar pasta", m: "documents", a: "create" },
      { label: "Enviar documento", m: "documents", a: "upload" },
      { label: "Editar", m: "documents", a: "edit" },
      { label: "Apagar", m: "documents", a: "delete" },
    ],
  },
  {
    key: "users",
    label: "Usuários",
    items: [
      { label: "Ver utilizadores", m: "users", a: "view" },
      { label: "Criar utilizador", m: "users", a: "create" },
      { label: "Editar utilizador", m: "users", a: "edit" },
      { label: "Apagar utilizador", m: "users", a: "delete" },
      { label: "Ver permissões", m: "users", a: "view_permissions" },
      { label: "Gerir permissões", m: "users", a: "manage_permissions" },
      { label: "Visualizar como utilizador", m: "users", a: "impersonate" },
    ],
  },
  {
    key: "marketplace",
    label: "Marketplace",
    items: [
      { label: "Ver anúncios", m: "marketplace", a: "view" },
      { label: "Criar anúncio", m: "marketplace", a: "create" },
      { label: "Editar anúncio", m: "marketplace", a: "edit" },
      { label: "Apagar anúncio", m: "marketplace", a: "delete" },
      { label: "Ver apenas workspace atual", m: "marketplace", a: "scope_workspace" },
    ],
  },
  {
    key: "subscriptions",
    label: "Assinaturas",
    items: [
      { label: "Ver assinatura", m: "subscriptions", a: "view" },
      { label: "Ver histórico", m: "subscriptions", a: "view_history" },
      { label: "Ver pagamentos", m: "subscriptions", a: "view_payments" },
      { label: "Exportar faturas", m: "subscriptions", a: "export_invoices" },
      { label: "Alterar plano", m: "subscriptions", a: "change_plan" },
      { label: "Cancelar subscrição", m: "subscriptions", a: "cancel" },
      { label: "Gerir faturação", m: "subscriptions", a: "manage_billing" },
    ],
  },
  {
    key: "platform",
    label: "Plataforma",
    items: [
      { label: "Ver visão geral", m: "platform", a: "view_overview" },
      { label: "Ver contas bancárias", m: "platform", a: "view_banks" },
      { label: "Ver subscrições", m: "platform", a: "view_subscriptions" },
      { label: "Ver pagamentos", m: "platform", a: "view_payments" },
      { label: "Ver IVA", m: "platform", a: "view_vat" },
      { label: "Ver faturas", m: "platform", a: "view_invoices" },
      { label: "Ver webhooks", m: "platform", a: "view_webhooks" },
      { label: "Ver ciclo de vida", m: "platform", a: "view_lifecycle" },
      { label: "Ver automação", m: "platform", a: "view_automation" },
      { label: "Ver auditoria", m: "platform", a: "view_audit" },
      { label: "Ver segurança", m: "platform", a: "view_security" },
      { label: "Ver compliance", m: "platform", a: "view_compliance" },
    ],
  },
  {
    key: "settings",
    label: "Configurações",
    items: [
      { label: "Ver configurações", m: "settings", a: "view" },
      { label: "Editar configurações", m: "settings", a: "edit" },
      { label: "Alterar idioma", m: "settings", a: "change_language" },
      { label: "Alterar tema", m: "settings", a: "change_theme" },
      { label: "Alterar senha", m: "settings", a: "change_password" },
      { label: "Reset password", m: "settings", a: "reset_password" },
      { label: "Ver senhas temporárias", m: "settings", a: "view_temp_credentials" },
      { label: "Reset do sistema", m: "settings", a: "reset_system" },
    ],
  },
  {
    key: "profile",
    label: "Perfil",
    items: [
      { label: "Ver perfil", m: "profile", a: "view" },
      { label: "Editar perfil", m: "profile", a: "edit" },
      { label: "Exportar perfil", m: "profile", a: "export" },
      { label: "Apagar perfil", m: "profile", a: "delete" },
    ],
  },
  {
    key: "notifications",
    label: "Notificações",
    items: [
      { label: "Ver notificações", m: "notifications", a: "view" },
      { label: "Ver alertas críticos", m: "notifications", a: "view_critical" },
      { label: "Marcar como lido", m: "notifications", a: "mark_read" },
      { label: "Apagar notificações", m: "notifications", a: "delete" },
    ],
  },
];

export function UserPermissionsDialog({
  open,
  onOpenChange,
  userId,
  userName,
  userRole,
}: UserPermissionsDialogProps) {
  const queryClient = useQueryClient();
  const invalidatePerms = useInvalidatePermissions();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    dashboard: true,
  });

  const { data: permissions = [], isLoading: loadingPerms } = useQuery({
    queryKey: ["permissions-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permissions")
        .select("id, module, action")
        .order("module")
        .order("action");
      if (error) throw error;
      return (data || []) as PermissionRow[];
    },
    enabled: open,
  });

  const { data: rolePerms = [] } = useQuery({
    queryKey: ["role-permissions-for-user", userRole],
    queryFn: async () => {
      if (!userRole) return [];
      const { data, error } = await supabase
        .from("role_permissions")
        .select("permission_id")
        .eq("role", userRole as any);
      if (error) throw error;
      return (data || []).map((r: any) => r.permission_id as string);
    },
    enabled: open && !!userRole,
  });

  const { data: overrides = [], isLoading: loadingOv } = useQuery({
    queryKey: ["user-permissions", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("user_permissions")
        .select("permission_id, allow")
        .eq("user_id", userId);
      if (error) throw error;
      return (data || []) as { permission_id: string; allow: boolean }[];
    },
    enabled: open && !!userId,
  });

  const { data: settings } = useQuery({
    queryKey: ["user-settings", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("user_settings")
        .select("can_view_other_users")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? { can_view_other_users: false }) as {
        can_view_other_users: boolean;
      };
    },
    enabled: open && !!userId,
  });

  const updateSettingMutation = useMutation({
    mutationFn: async (patch: { can_view_other_users: boolean }) => {
      if (!userId) return;
      const { error } = await supabase
        .from("user_settings")
        .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings", userId] });
      invalidatePerms();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  /** "module:action" -> permission row */
  const lookup = useMemo(() => {
    const m: Record<string, PermissionRow> = {};
    for (const p of permissions) m[`${p.module}:${p.action}`] = p;
    return m;
  }, [permissions]);

  /** permission_id -> effective boolean (override wins, else role default) */
  const effective = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const id of rolePerms) map[id] = true;
    for (const o of overrides) map[o.permission_id] = o.allow;
    return map;
  }, [rolePerms, overrides]);

  const toggleMutation = useMutation({
    mutationFn: async ({
      permissionId,
      next,
    }: {
      permissionId: string;
      next: boolean;
    }) => {
      if (!userId) return;
      const { error } = await supabase
        .from("user_permissions")
        .upsert(
          { user_id: userId, permission_id: permissionId, allow: next },
          { onConflict: "user_id,permission_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-permissions", userId] });
      invalidatePerms();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const bulkToggleMutation = useMutation({
    mutationFn: async ({ ids, next }: { ids: string[]; next: boolean }) => {
      if (!userId || ids.length === 0) return;
      const rows = ids.map((permission_id) => ({
        user_id: userId,
        permission_id,
        allow: next,
      }));
      const { error } = await supabase
        .from("user_permissions")
        .upsert(rows, { onConflict: "user_id,permission_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-permissions", userId] });
      invalidatePerms();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const resetAllMutation = useMutation({
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase
        .from("user_permissions")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-permissions", userId] });
      invalidatePerms();
      toast.success("Permissões repostas aos padrões da função.");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const isAdminUser = userRole === "admin";
  const loading = loadingPerms || loadingOv;

  /** Resolve catalog items into the toggles to render. */
  const resolveItems = (items: CatalogItem[]) =>
    items.map((it) => {
      const row = lookup[`${it.m}:${it.a}`];
      return {
        item: it,
        id: row?.id ?? null,
        available: !!row,
        on: row ? !!effective[row.id] : false,
      };
    });

  const renderToggleRow = (
    label: string,
    id: string | null,
    available: boolean,
    on: boolean,
  ) => {
    const content = (
      <label
        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md border transition-colors ${
          !available
            ? "border-border/30 bg-muted/20 opacity-60 cursor-not-allowed"
            : on
              ? "border-primary/40 bg-primary/5 cursor-pointer"
              : "border-border/40 hover:bg-muted/30 cursor-pointer"
        }`}
      >
        <span className="text-xs flex items-center gap-1.5 truncate">
          {!available && <Lock className="h-3 w-3 shrink-0" />}
          <span className="truncate">{label}</span>
        </span>
        <Switch
          checked={on}
          disabled={!available || !id}
          onCheckedChange={(v) =>
            id && toggleMutation.mutate({ permissionId: id, next: Boolean(v) })
          }
        />
      </label>
    );

    if (available) return content;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div>{content}</div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <span className="text-[11px]">Brevemente — requer configuração de backend</span>
        </TooltipContent>
      </Tooltip>
    );
  };

  const renderItemsGrid = (items: CatalogItem[]) => {
    const resolved = resolveItems(items);
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {resolved.map(({ item, id, available, on }) => (
          <div key={`${item.m}:${item.a}`}>
            {renderToggleRow(item.label, id, available, on)}
          </div>
        ))}
      </div>
    );
  };

  const renderModuleHeader = (
    mod: CatalogModule,
    availableIds: string[],
    isOpen: boolean,
  ) => {
    const allOn = availableIds.length > 0 && availableIds.every((id) => effective[id]);
    return (
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-muted/30 rounded-t-lg">
        <button
          type="button"
          onClick={() => setExpanded((s) => ({ ...s, [mod.key]: !isOpen }))}
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          {mod.label}
          <span className="text-[10px] text-muted-foreground font-normal">
            {availableIds.length} ativas
          </span>
        </button>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-[11px] text-muted-foreground">Permissão total</span>
          <Switch
            checked={allOn}
            disabled={availableIds.length === 0}
            onCheckedChange={(v) =>
              bulkToggleMutation.mutate({
                ids: availableIds,
                next: Boolean(v),
              })
            }
          />
        </label>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-4xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm">Permissões — {userName || "Utilizador"}</div>
              <div className="text-[11px] text-muted-foreground font-normal mt-0.5">
                Função: <span className="font-mono">{userRole || "—"}</span> · Overrides
                têm prioridade sobre os padrões da função.
              </div>
            </div>
            {!isAdminUser && overrides.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => resetAllMutation.mutate()}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Repor padrões
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {isAdminUser ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Administradores têm sempre acesso total — não é possível restringir.
          </div>
        ) : (
          <TooltipProvider delayDuration={150}>
            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              {/* Visibility */}
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <Switch
                    checked={!!settings?.can_view_other_users}
                    onCheckedChange={(v) =>
                      updateSettingMutation.mutate({ can_view_other_users: v })
                    }
                  />
                  <div className="flex-1">
                    <div className="text-sm flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5 text-primary" />
                      Ver outros utilizadores
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Permite listar outros utilizadores do workspace atual.
                    </div>
                  </div>
                </label>
              </div>

              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {CATALOG.map((mod) => {
                    const isOpen = !!expanded[mod.key];
                    // Collect every available db id across this module (flat + groups)
                    const flat = mod.items ?? [];
                    const groupItems = (mod.groups ?? []).flatMap((g) => g.items);
                    const allItems = [...flat, ...groupItems];
                    const availableIds = allItems
                      .map((it) => lookup[`${it.m}:${it.a}`]?.id)
                      .filter(Boolean) as string[];

                    return (
                      <div
                        key={mod.key}
                        className="rounded-lg border border-border/60 bg-background/40"
                      >
                        {renderModuleHeader(mod, availableIds, isOpen)}
                        {isOpen && (
                          <div className="p-3 space-y-3">
                            {mod.items && renderItemsGrid(mod.items)}
                            {mod.groups?.map((g) => {
                              const groupIds = g.items
                                .map((it) => lookup[`${it.m}:${it.a}`]?.id)
                                .filter(Boolean) as string[];
                              const groupAllOn =
                                groupIds.length > 0 &&
                                groupIds.every((id) => effective[id]);
                              return (
                                <div
                                  key={g.label}
                                  className="rounded-md border border-border/40 bg-muted/10 p-2.5"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="text-[12px] font-medium text-foreground/90">
                                      {g.label}
                                    </div>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <span className="text-[10px] text-muted-foreground">
                                        Total
                                      </span>
                                      <Switch
                                        checked={groupAllOn}
                                        disabled={groupIds.length === 0}
                                        onCheckedChange={(v) =>
                                          bulkToggleMutation.mutate({
                                            ids: groupIds,
                                            next: Boolean(v),
                                          })
                                        }
                                      />
                                    </label>
                                  </div>
                                  {renderItemsGrid(g.items)}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TooltipProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}
