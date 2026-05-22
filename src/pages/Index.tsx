import { OperationalKPIs } from "@/components/dashboard/OperationalKPIs";
import { PlatformsPanel } from "@/components/dashboard/PlatformsPanel";
import { OperationalEventsStream } from "@/components/dashboard/OperationalEventsStream";
import { OperationalMap } from "@/components/dashboard/OperationalMap";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useLanguage } from "@/hooks/useLanguage";
import { useGeolocation } from "@/hooks/useGeolocation";

const Dashboard = () => {
  const { t } = useLanguage();
  useGeolocation();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground">Centro operacional em tempo real</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
            <span className="relative rounded-full bg-emerald-400 h-2 w-2" />
          </span>
          Realtime activo
        </div>
      </div>

      {/* Operational KPIs */}
      <OperationalKPIs />

      {/* Platforms lifecycle */}
      <ErrorBoundary>
        <PlatformsPanel />
      </ErrorBoundary>

      {/* Radar PDR — full width */}
      <ErrorBoundary>
        <OperationalMap />
      </ErrorBoundary>

      {/* Stream + Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <ErrorBoundary>
          <OperationalEventsStream />
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default Dashboard;
