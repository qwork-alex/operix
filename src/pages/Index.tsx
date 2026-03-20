import { Euro, CreditCard, CheckCircle2, TrendingUp } from "lucide-react";
import { KPICard } from "@/components/dashboard/KPICard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { ServicePieChart } from "@/components/dashboard/ServicePieChart";
import { ActiveMap } from "@/components/dashboard/ActiveMap";
import { RecentActivity } from "@/components/dashboard/RecentActivity";

const Dashboard = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your operations</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Revenue"
          value="€88,420"
          change={12.5}
          icon={<Euro className="h-5 w-5" />}
          glowClass="glow-gold"
        />
        <KPICard
          title="Pending Payments"
          value="€14,230"
          change={-3.2}
          icon={<CreditCard className="h-5 w-5" />}
          glowClass="glow-blue"
        />
        <KPICard
          title="Completed Services"
          value="847"
          change={8.7}
          icon={<CheckCircle2 className="h-5 w-5" />}
          glowClass="glow-green"
        />
        <KPICard
          title="Performance"
          value="94.2%"
          change={2.1}
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <ServicePieChart />
      </div>

      {/* Map + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActiveMap />
        <RecentActivity />
      </div>
    </div>
  );
};

export default Dashboard;
