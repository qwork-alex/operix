import { lazy, Suspense } from "react";
import { OperationalKPIs } from "@/components/dashboard/OperationalKPIs";
// PlatformsPanel removed from dashboard — platforms are now derived from Service Orders.
import { OperationalEventsStream } from "@/components/dashboard/OperationalEventsStream";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useLanguage } from "@/hooks/useLanguage";
import { useGeolocation } from "@/hooks/useGeolocation";

// Map is heavy (maplibre + 1.7k LOC). Split it off so KPIs and panels
// paint instantly; the map streams in below the fold.
const OperationalMap = lazy(() =>
  import("@/components/dashboard/OperationalMap").then((m) => ({ default: m.OperationalMap })),
);

const Dashboard = () => {
  const { t } = useLanguage();
  useGeolocation();

  return (
    <div className="min-w-0 max-w-full space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

      {/* Plataformas operacionais panel removido — métricas derivadas das OS reais. */}


      {/* Radar PDR — full width, streamed in */}
      <ErrorBoundary>
        <div data-agent-focus="operational-map">
          <Suspense fallback={<Skeleton className="h-[420px] w-full rounded-lg" />}>
            <OperationalMap />
          </Suspense>
        </div>
      </ErrorBoundary>

      {/* Stream + Revenue */}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>
        <ErrorBoundary>
          <div data-agent-focus="operational-events">
            <OperationalEventsStream />
          </div>
        </ErrorBoundary>
      </div>

    </div>
  );
};

export default Dashboard;
