import { Link } from "react-router-dom";
import {
  LayoutDashboard, FileText, CreditCard, TrendingUp, BarChart3,
  Car, Users, Receipt, Shield, Wrench, Store, Zap, Brain,
} from "lucide-react";
import { useIsPlatformOwner } from "@/hooks/useSubscription";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { useLanguage } from "@/hooks/useLanguage";
import { useCan } from "@/hooks/usePermission";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import { useWorkspace } from "@/hooks/useWorkspace";
import { BrandNameEditor, type BrandConfig } from "@/components/layout/BrandNameEditor";
import { BrandLogo } from "@/components/BrandLogo";
import { brandConfig as appBrand } from "@/brand.config";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  module: string;
  action: string;
  end?: boolean;
  enabled?: boolean; // extra gating (e.g. platform owner)
};

type NavGroup = {
  /** Optional label. When omitted, items render flush without a section header. */
  label?: string;
  items: NavItem[];
};

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { t } = useLanguage();
  const { can, isLoading: permsLoading } = useCan();
  const { brandConfig, saveBrandConfig } = useCompanyLogo();
  const { workspaceName } = useWorkspace();
  const { data: isPlatformOwner } = useIsPlatformOwner();

  const handleBrandSave = async (config: BrandConfig) => {
    try {
      await saveBrandConfig(config);
      toast.success(t("brand.nameUpdated"));
    } catch {
      toast.error(t("brand.nameUpdateError"));
    }
  };

  const displayName = brandConfig.name || workspaceName || appBrand.appName;

  // Architecture: declarative groups → easy to collapse / reorder later.
  const groups: NavGroup[] = [
    {
      // Painel — no label, acts as the top anchor
      items: [
        { title: t("nav.dashboard"), url: "/", icon: LayoutDashboard, module: "dashboard", action: "view", end: true },
      ],
    },
    {
      label: "Operações",
      items: [
        { title: "Produção", url: "/production", icon: Wrench, module: "service_orders", action: "view" },
        { title: t("nav.serviceOrders"), url: "/service-orders", icon: FileText, module: "service_orders", action: "view" },
        { title: t("nav.paymentOrders"), url: "/payment-orders", icon: CreditCard, module: "payment_orders", action: "view" },
      ],
    },
    {
      label: "Contabilidade",
      items: [
        { title: "Faturamento", url: "/billing", icon: Receipt, module: "accounting", action: "view" },
        { title: t("nav.financial"), url: "/financial", icon: TrendingUp, module: "financial", action: "view" },
        { title: "Plataforma", url: "/platform", icon: BarChart3, module: "dashboard", action: "view", enabled: !!isPlatformOwner },
      ],
    },
    {
      label: "Inteligência",
      items: [
        { title: "Automações", url: "/automations", icon: Zap, module: "settings", action: "edit" },
        { title: "QWork AI", url: "/ai", icon: Brain, module: "dashboard", action: "view" },
      ],
    },
    {
      label: "Oportunidades",
      items: [
        { title: t("nav.fleet"), url: "/fleet", icon: Car, module: "fleet", action: "view" },
        { title: "Marketplace", url: "/marketplace", icon: Store, module: "dashboard", action: "view" },
      ],
    },
    {
      label: "Contas",
      items: [
        { title: t("nav.users"), url: "/users", icon: Users, module: "users", action: "view" },
        { title: "Assinaturas", url: "/subscription", icon: Shield, module: "dashboard", action: "view" },
      ],
    },
  ];

  const visibleGroups: NavGroup[] = permsLoading
    ? []
    : groups
        .map((g) => ({
          ...g,
          items: g.items.filter(
            (i) => (i.enabled === undefined || i.enabled) && can(i.module, i.action).allowed,
          ),
        }))
        .filter((g) => g.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <div className={`flex h-14 items-center border-b border-border/50 ${collapsed ? "justify-center px-0" : "px-4"}`}>
        {!collapsed && (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <BrandLogo size={brandConfig.logoSizeNum ?? 30} />
            {(() => {
              const nameStyle: import("react").CSSProperties = {
                fontFamily: brandConfig.fontFamily || undefined,
                color: brandConfig.color || undefined,
                fontSize: brandConfig.fontSize || undefined,
                fontWeight: brandConfig.bold ? 700 : 600,
                fontStyle: brandConfig.italic ? "italic" : undefined,
                textShadow:
                  (brandConfig.glowIntensity ?? 0) > 0
                    ? `0 0 ${brandConfig.glowIntensity}px ${brandConfig.color || "hsl(var(--primary))"}`
                    : undefined,
                letterSpacing: "-0.01em",
              };
              return can("settings", "edit").allowed ? (
                <BrandNameEditor config={brandConfig} onSave={handleBrandSave}>
                  <button
                    className="overflow-hidden hover:opacity-80 transition-opacity cursor-pointer text-left font-display"
                    title={t("brand.editTooltip")}
                  >
                    <span className="text-sm text-foreground truncate" style={nameStyle}>
                      {displayName}
                    </span>
                  </button>
                </BrandNameEditor>
              ) : (
                <Link to="/" className="overflow-hidden font-display">
                  <span className="text-sm text-foreground truncate" style={nameStyle}>
                    {displayName}
                  </span>
                </Link>
              );
            })()}
          </div>
        )}
      </div>

      <SidebarContent className="pt-3 gap-1">
        {visibleGroups.map((group, idx) => (
          <SidebarGroup
            key={group.label ?? `__top-${idx}`}
            className={group.label ? "pt-3" : "pt-0"}
          >
            {group.label && (
              <SidebarGroupLabel className="text-muted-foreground/50 text-[10px] font-medium uppercase tracking-[0.14em] px-2 mb-1">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild tooltip={collapsed ? item.title : undefined}>
                      <NavLink
                        to={item.url}
                        end={item.end}
                        className="text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors rounded-md"
                        activeClassName="bg-sidebar-accent text-primary font-medium"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="text-[13px]">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
