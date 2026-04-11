import { useRef } from "react";
import { Link } from "react-router-dom";
import {
  LayoutDashboard, FileText, CreditCard, TrendingUp, PieChart,
  BookOpen, Car, FolderOpen, Users, Settings, Loader2,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { useLanguage } from "@/hooks/useLanguage";
import { useRole } from "@/hooks/useRole";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import { BrandNameEditor, type BrandConfig } from "@/components/layout/BrandNameEditor";
import { toast } from "sonner";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { t } = useLanguage();
  const { isAdmin, role } = useRole();
  const { logoUrl, brandConfig, uploadLogo, isUploading, saveBrandConfig } = useCompanyLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoClick = (e: React.MouseEvent) => {
    if (!isAdmin) return;
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!file.type.startsWith("image/")) {
      toast.error("Apenas imagens são permitidas");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem deve ter no máximo 5MB");
      return;
    }
    try {
      await uploadLogo(file);
      toast.success("Logo atualizado com sucesso");
    } catch {
      toast.error("Erro ao atualizar logo");
    }
  };

  const handleBrandSave = async (config: BrandConfig) => {
    try {
      await saveBrandConfig(config);
      toast.success("Nome atualizado com sucesso");
    } catch {
      toast.error("Erro ao atualizar nome");
    }
  };

  const displayName = brandConfig.name || "QWork Nexus";
  const shortName = brandConfig.name?.split(" ")[0] || "QWork";

  const logoSizeMap = { small: "h-6 w-6", medium: "h-8 w-8", large: "h-10 w-10" };
  const logoSizeClass = logoSizeMap[brandConfig.logoSize || "medium"];

  const nameStyle: React.CSSProperties = {
    fontFamily: brandConfig.fontFamily || undefined,
    color: brandConfig.color || undefined,
    fontSize: collapsed ? "8px" : (brandConfig.fontSize || undefined),
    fontWeight: brandConfig.bold ? 700 : 600,
    fontStyle: brandConfig.italic ? "italic" : undefined,
  };

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

  const logoElement = logoUrl ? (
    <img src={logoUrl} alt="Logo" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
  ) : (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground text-sm">
      Q
    </div>
  );

  const nameElement = (
    <span className="whitespace-nowrap leading-none tracking-tight" style={nameStyle}>
      {collapsed ? shortName : displayName}
    </span>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      <div className={`flex h-14 items-center border-b border-border/50 ${collapsed ? "justify-center px-0" : "px-4"}`}>
        <div className={`flex items-center gap-2 overflow-hidden ${collapsed ? "flex-col gap-0.5" : ""}`}>
          {/* Logo */}
          <div
            onClick={handleLogoClick}
            className={`relative group ${isAdmin ? "cursor-pointer" : ""}`}
            title={isAdmin ? "Clique para alterar o logo" : undefined}
          >
            {isUploading ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {logoElement}
                {isAdmin && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[8px] text-white font-medium">Editar</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Name */}
          {isAdmin ? (
            <BrandNameEditor config={brandConfig} onSave={handleBrandSave}>
              <button
                className="overflow-hidden hover:opacity-80 transition-opacity cursor-pointer text-left"
                title="Clique para personalizar"
              >
                {nameElement}
              </button>
            </BrandNameEditor>
          ) : (
            <Link to="/" className="overflow-hidden">
              {nameElement}
            </Link>
          )}
        </div>
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
