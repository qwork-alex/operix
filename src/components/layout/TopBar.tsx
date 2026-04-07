import { Bell, Globe, Search, LogOut, Check, Trash2, FileText, CreditCard, AlertTriangle, Info } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useLanguage, type LangCode } from "@/hooks/useLanguage";
import { useNotifications } from "@/hooks/useNotifications";
import { ScrollArea } from "@/components/ui/scroll-area";

const languages: { code: LangCode; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "ar", label: "العربية" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "hi", label: "हिन्दी" },
  { code: "pl", label: "Polski" },
  { code: "ru", label: "Русский" },
];

const typeIcon: Record<string, typeof Info> = {
  service_order: FileText,
  payment: CreditCard,
  discrepancy: AlertTriangle,
};

function timeAgo(dateStr: string, t: (k: string, fb?: string) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("notif.justNow");
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function TopBar() {
  const { profile, signOut } = useAuth();
  const { myRole: role } = useWorkspace();
  const { t, lang, setLang } = useLanguage();
  const { notifications, unreadCount, markAsRead, markAllRead, clearAll } = useNotifications();

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <header className="flex h-14 items-center justify-between border-b border-border/50 px-4 glass-panel">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
        <div className="hidden sm:flex items-center gap-2 ml-2 px-3 py-1.5 rounded-md bg-muted/50 text-muted-foreground text-sm">
          <Search className="h-3.5 w-3.5" />
          <span className="text-xs">{t("action.search")}</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {role && (
          <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-muted-foreground/60 mr-2 px-2 py-0.5 rounded bg-muted/30">
            {t(`role.${role}`, role)}
          </span>
        )}

        {/* Language */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <Globe className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-card border-border">
            {languages.map((l) => (
              <DropdownMenuItem
                key={l.code}
                className={`text-sm cursor-pointer ${l.code === lang ? "bg-accent text-accent-foreground" : ""}`}
                onClick={() => setLang(l.code)}
              >
                {l.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-card border-border w-80">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-semibold text-foreground">{t("notif.title")}</span>
              <div className="flex gap-1">
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => markAllRead()}>
                    <Check className="h-3 w-3 mr-1" />
                    {t("notif.markAllRead")}
                  </Button>
                )}
                {notifications.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-destructive" onClick={() => clearAll()}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            <DropdownMenuSeparator />
            <ScrollArea className="max-h-[320px]">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">{t("notif.empty")}</div>
              ) : (
                notifications.map((n: any) => {
                  const Icon = typeIcon[n.type] || Info;
                  return (
                    <div
                      key={n.id}
                      className={`flex gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-muted/50 ${!n.is_read ? "bg-primary/5" : ""}`}
                      onClick={() => { if (!n.is_read) markAsRead(n.id); }}
                    >
                      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        n.type === "discrepancy" ? "bg-destructive/10 text-destructive"
                          : n.type === "payment" ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-primary/10 text-primary"
                      }`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className={`text-xs truncate ${!n.is_read ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                            {n.title}
                          </p>
                          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{timeAgo(n.created_at, t)}</span>
                        </div>
                        {n.message && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{n.message}</p>}
                      </div>
                      {!n.is_read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    </div>
                  );
                })
              )}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User avatar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-semibold hover:bg-primary/30 transition-colors">
              {initials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-card border-border w-48">
            <div className="px-3 py-2">
              <p className="text-sm font-medium text-foreground truncate">{profile?.full_name || t("common.user")}</p>
              <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-sm cursor-pointer text-destructive">
              <LogOut className="h-3.5 w-3.5 mr-2" />
              {t("action.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
