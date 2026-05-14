import { Euro, CreditCard, CheckCircle2, TrendingUp } from "lucide-react";
import { KPICard } from "@/components/dashboard/KPICard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { ServicePieChart } from "@/components/dashboard/ServicePieChart";
import { OperationalMap } from "@/components/dashboard/OperationalMap";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { useDashboardStats } from "@/hooks/useDashboardData";
import { useLanguage } from "@/hooks/useLanguage";
import { useGeolocation } from "@/hooks/useGeolocation";

const Dashboard = () => {
  const { data, isLoading } = useDashboardStats();
  const { t, formatCurrency } = useLanguage();
  useGeolocation(); // Track user location on dashboard visit

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title={t("dashboard.revenue")}
          value={isLoading ? "..." : formatCurrency(data?.totalRevenue ?? 0)}
          change={0}
          icon={<Euro className="h-5 w-5" />}
          glowClass="glow-gold"
        />
        <KPICard
          title={t("dashboard.pendingPayments")}
          value={isLoading ? "..." : formatCurrency(data?.pendingPayments ?? 0)}
          change={0}
          icon={<CreditCard className="h-5 w-5" />}
          glowClass="glow-blue"
        />
        <KPICard
          title={t("dashboard.completedServices")}
          value={isLoading ? "..." : String(data?.completedServices ?? 0)}
          change={0}
          icon={<CheckCircle2 className="h-5 w-5" />}
          glowClass="glow-green"
        />
        <KPICard
          title={t("dashboard.performance")}
          value={isLoading ? "..." : `${data?.performance ?? 0}%`}
          change={0}
          icon={<TrendingUp className="h-5 w-5" />}
          glowClass="glow-purple"
        />
      </div>

      {/* Revenue Chart - full width */}
      <RevenueChart />

      {/* Map - full width */}
      <ActiveMap />

      {/* Service Status + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ServicePieChart />
        <RecentActivity />
      </div>
    </div>
  );
};

export default Dashboard;
