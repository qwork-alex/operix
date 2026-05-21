import { Link } from "react-router-dom";
import {
  LayoutDashboard, FileText, CreditCard, TrendingUp, PieChart,
  BookOpen, Car, FolderOpen, Users, Settings, Receipt, Shield, Wrench,
} from "lucide-react";
import { useIsPlatformOwner } from "@/hooks/useSubscription";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
// (useIsPlatformOwner imported above)
import { NavLink } from "@/components/NavLink";
import { useLanguage } from "@/hooks/useLanguage";
import { useCan } from "@/hooks/usePermission";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import { useWorkspace } from "@/hooks/useWorkspace";
import { BrandNameEditor, type BrandConfig } from "@/components/layout/BrandNameEditor";
import { BrandLogo } from "@/components/BrandLogo";
import { brandConfig as appBrand } from "@/brand.config";
import { toast } from "sonner";

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

  // Dynamic display name: explicit brand override → workspace name → app default
  const displayName = brandConfig.name || workspaceName || appBrand.appName;

  // Single source of truth — useCan() resolves everything (admin, override, role, deny).
  const allNav = [
    { title: t("nav.dashboard"), url: "/", icon: LayoutDashboard, module: "dashboard", action: "view" },
    { title: "Produção", url: "/production", icon: Wrench, module: "service_orders", action: "view" },
    { title: t("nav.serviceOrders"), url: "/service-orders", icon: FileText, module: "service_orders", action: "view" },
    { title: t("nav.paymentOrders"), url: "/payment-orders", icon: CreditCard, module: "payment_orders", action: "view" },
    { title: "Faturamento", url: "/billing", icon: Receipt, module: "accounting", action: "view" },
    { title: t("nav.financial"), url: "/financial", icon: TrendingUp, module: "financial", action: "view" },
    // Phase 5C: Profit Distribution is now embedded in /financial?tab=distribution.
    // Standalone /profit route is preserved for backward compat but removed from sidebar.
    { title: t("nav.fleet"), url: "/fleet", icon: Car, module: "fleet", action: "view" },
    { title: t("nav.documents"), url: "/documents", icon: FolderOpen, module: "documents", action: "view" },
    { title: t("nav.users"), url: "/users", icon: Users, module: "users", action: "view" },
  ];

  const mainNav = permsLoading ? [] : allNav.filter((item) => can(item.module, item.action).allowed);
  const showSettings = !permsLoading && can("settings", "view").allowed;

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

      <SidebarContent className="pt-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground/60 text-[10px] uppercase tracking-widest">
            {t("nav.operations")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel className="text-muted-foreground/60 text-[10px] uppercase tracking-widest">
            Conta
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/subscription"
                    className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                    activeClassName="bg-sidebar-accent text-primary font-medium"
                  >
                    <CreditCard className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>Assinaturas</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {isPlatformOwner && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/platform"
                      className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <Shield className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>Plataforma</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Settings moved into the profile dropdown (top-right). */}


    </Sidebar>
  );
}
