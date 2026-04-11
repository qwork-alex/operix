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

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { t } = useLanguage();
  const { isAdmin, role } = useRole();

  const allNav = [
    { title: t("nav.dashboard"), url: "/", icon: LayoutDashboard, roles: ["admin", "tecnico", "socio", "cliente"] },
    { title: t("nav.serviceOrders"), url: "/service-orders", icon: FileText, roles: ["admin", "tecnico", "socio"] },
    { title: t("nav.paymentOrders"), url: "/payment-orders", icon: CreditCard, roles: ["admin", "socio"] },
    { title: t("nav.financial"), url: "/financial", icon: TrendingUp, roles: ["admin", "socio"] },
    { title: t("nav.profit"), url: "/profit", icon: PieChart, roles: ["admin", "socio"] },
    { title: t("nav.accounting"), url: "/accounting", icon: BookOpen, roles: ["admin"] },
    { title: t("nav.fleet"), url: "/fleet", icon: Car, roles: ["admin", "tecnico"] },
    { title: t("nav.documents"), url: "/documents", icon: FolderOpen, roles: ["admin", "tecnico", "socio"] },
    { title: t("nav.users"), url: "/users", icon: Users, roles: ["admin"] },
  ];

  const mainNav = allNav.filter((item) => !role || item.roles.includes(role));

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <div className={`flex h-14 items-center border-b border-border/50 ${collapsed ? "justify-center px-0" : "px-4"}`}>
        <Link to="/" className={`flex items-center gap-2 overflow-hidden ${collapsed ? "flex-col gap-0.5" : ""}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground text-sm">
            Q
          </div>
          {collapsed ? (
            <span className="text-[8px] font-semibold tracking-tight text-muted-foreground whitespace-nowrap leading-none">
              QWork
            </span>
          ) : (
            <span className="text-base font-semibold tracking-tight text-foreground whitespace-nowrap">
              QWork Nexus
            </span>
          )}
        </Link>
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
