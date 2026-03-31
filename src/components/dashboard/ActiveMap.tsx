import { useLanguage } from "@/hooks/useLanguage";

const regions = [
  { name: "Lyon", count: 34 },
  { name: "Geneva", count: 21 },
  { name: "Paris", count: 48 },
  { name: "Marseille", count: 18 },
  { name: "Grenoble", count: 12 },
];

export function ActiveMap() {
  const { t } = useLanguage();

  return (
    <div className="glass-panel rounded-xl p-5 animate-fade-in">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">{t("chart.activeRegions")}</h3>
        <p className="text-xs text-muted-foreground">{t("chart.techDistribution")}</p>
      </div>
      <div className="h-[280px] rounded-lg overflow-hidden bg-muted/30 flex flex-col justify-center gap-3 px-6">
        {regions.map((r) => (
          <div key={r.name} className="flex items-center justify-between">
            <span className="text-sm text-foreground">{r.name}</span>
            <div className="flex items-center gap-2 flex-1 mx-4">
              <div className="h-2 flex-1 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(r.count / 48) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-xs font-semibold text-primary tabular-nums">{r.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}