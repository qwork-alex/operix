import { Link } from "react-router-dom";
import {
  LayoutDashboard, FileText, CreditCard, TrendingUp, PieChart,
  BookOpen, Car, FolderOpen, Users, Settings,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermission";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import { BrandNameEditor, type BrandConfig } from "@/components/layout/BrandNameEditor";
import { BrandLogo } from "@/components/BrandLogo";
import { brandConfig as appBrand } from "@/brand.config";
import { toast } from "sonner";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { t } = useLanguage();
  const { isAdmin, role } = useRole();
  const { brandConfig, saveBrandConfig } = useCompanyLogo();

  const handleBrandSave = async (config: BrandConfig) => {
    try {
      await saveBrandConfig(config);
      toast.success(t("brand.nameUpdated"));
    } catch {
      toast.error(t("brand.nameUpdateError"));
    }
  };

  const displayName = brandConfig.name || appBrand.appName;

  const allNav = [
    { title: t("nav.dashboard"), url: "/", icon: LayoutDashboard, roles: ["admin", "tecnico", "socio", "cliente"], perm: "dashboard.view" },
    { title: t("nav.serviceOrders"), url: "/service-orders", icon: FileText, roles: ["admin", "tecnico", "socio"], perm: "service_orders.view" },
    { title: t("nav.paymentOrders"), url: "/payment-orders", icon: CreditCard, roles: ["admin", "socio"], perm: "payment_orders.view" },
    { title: t("nav.financial"), url: "/financial", icon: TrendingUp, roles: ["admin", "socio"], perm: "financial.view" },
    { title: t("nav.profit"), url: "/profit", icon: PieChart, roles: ["admin", "socio"], perm: "profit.view" },
    { title: t("nav.accounting"), url: "/accounting", icon: BookOpen, roles: ["admin"], perm: "accounting.view" },
    { title: t("nav.fleet"), url: "/fleet", icon: Car, roles: ["admin", "tecnico"], perm: "fleet.view" },
    { title: t("nav.documents"), url: "/documents", icon: FolderOpen, roles: ["admin", "tecnico", "socio"], perm: "documents.view" },
    { title: t("nav.users"), url: "/users", icon: Users, roles: ["admin"], perm: "users.view" },
  ];

  // Bulk-load all permission keys at once
  const { map: permMap, isLoading: permsLoading } = usePermissions(allNav.map((n) => n.perm));

  const mainNav = allNav.filter((item) => {
    if (role && !item.roles.includes(role)) return false;
    if (isAdmin) return true;
    // While loading, hide nothing extra (role filter still applies)
    if (permsLoading) return true;
    return permMap[item.perm] === true;
  });

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">

      <div className={`flex h-14 items-center border-b border-border/50 ${collapsed ? "justify-center px-0" : "px-4"}`}>
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <BrandLogo size={28} />
            {isAdmin ? (
              <BrandNameEditor config={brandConfig} onSave={handleBrandSave}>
                <button className="overflow-hidden hover:opacity-80 transition-opacity cursor-pointer text-left" title={t("brand.editTooltip")}>
                  <span className="text-sm font-semibold text-foreground">{displayName}</span>
                </button>
              </BrandNameEditor>
            ) : (
              <Link to="/" className="overflow-hidden">
                <span className="text-sm font-semibold text-foreground">{displayName}</span>
              </Link>
            )}
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
      </SidebarContent>

      <SidebarFooter className="border-t border-border/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="/settings"
                className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                activeClassName="bg-sidebar-accent text-primary font-medium"
              >
                <Settings className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{t("nav.settings")}</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
