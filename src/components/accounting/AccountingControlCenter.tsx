import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import {
  Home,
  Receipt,
  Fuel,
  ShoppingCart,
  Landmark,
  Wallet,
} from "lucide-react";
import { SpaceBackground } from "./SpaceBackground";
import { ModulePanel } from "./ModulePanel";
import { useAccountingModule } from "./useAccountingModules";
import { cn } from "@/lib/utils";
import { useFinancialYears, useWorkspaceTechnicians, MONTH_LABELS } from "@/hooks/useFinancialPeriods";
import { useLanguage } from "@/hooks/useLanguage";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ModuleKey = "rentals" | "expenses" | "fuel" | "purchases" | "government" | "withdrawals";

interface ModuleDef {
  key: ModuleKey;
  label: string;
  icon: any;
  color: string; // HSL string without hsl()
}

const MODULES: ModuleDef[] = [
  { key: "rentals",     label: "Aluguéis",    icon: Home,         color: "43 85% 55%"  },
  { key: "expenses",    label: "Despesas",    icon: Receipt,      color: "0 72% 55%"   },
  { key: "fuel",        label: "Combustível", icon: Fuel,         color: "210 80% 55%" },
  { key: "purchases",   label: "Compras",     icon: ShoppingCart, color: "280 60% 60%" },
  { key: "government",  label: "Governo",     icon: Landmark,     color: "152 60% 45%" },
  { key: "withdrawals", label: "Retiradas",   icon: Wallet,       color: "28 92% 55%"  },
];

function StaticAccountingGlobe({ size }: { size: number }) {
  return (
    <div
      className="relative rounded-full border border-primary/20 shadow-[0_0_60px_hsl(var(--primary)/0.20)]"
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(circle at 34% 30%, hsl(var(--primary) / 0.62), hsl(var(--primary) / 0.26) 30%, hsl(var(--card) / 0.72) 62%, hsl(var(--background)) 100%)",
      }}
      aria-hidden
    >
      <div className="absolute inset-[12%] rounded-full border border-primary/15" />
      <div className="absolute left-[18%] top-[28%] h-[12%] w-[34%] rounded-full bg-primary/25 blur-[1px]" />
      <div className="absolute right-[18%] top-[48%] h-[10%] w-[28%] rounded-full bg-primary/20 blur-[1px]" />
      <div className="absolute inset-0 rounded-full shadow-[inset_-24px_-28px_55px_hsl(var(--background)/0.78)]" />
    </div>
  );
}

// ---------- Memoized orbital button (GPU transform only) ----------
interface OrbitButtonProps {
  mod: ModuleDef;
  x: number;
  y: number;
  isActive: boolean;
  onSelect: (key: ModuleKey) => void;
}
const OrbitButton = memo(function OrbitButton({ mod, x, y, isActive, onSelect }: OrbitButtonProps) {
  const Icon = mod.icon;
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(mod.key);
      }}
      className="absolute z-20 flex flex-col items-center gap-1.5 group left-0 top-0"
      style={{
        transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`,
        willChange: "transform",
      }}
    >
      <div
        className={cn(
          "w-14 h-14 rounded-2xl flex items-center justify-center border",
          "transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out",
          "group-hover:scale-105"
        )}
        style={{
          borderColor: isActive ? `hsl(${mod.color} / 0.7)` : "hsl(var(--border) / 0.5)",
          background: isActive ? `hsl(${mod.color} / 0.15)` : "hsl(var(--card) / 0.8)",
          boxShadow: isActive
            ? `0 0 15px hsl(${mod.color} / 0.55), 0 0 30px hsl(${mod.color} / 0.25)`
            : undefined,
        }}
      >
        <Icon
          size={22}
          style={{ color: isActive ? `hsl(${mod.color})` : "hsl(var(--muted-foreground))" }}
        />
      </div>
      <span
        className={cn(
          "text-[11px] font-medium tracking-wide whitespace-nowrap",
          isActive ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {mod.label}
      </span>
    </button>
  );
});

export function AccountingControlCenter({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useLanguage();
  const [activeModule, setActiveModule] = useState<ModuleKey | null>(null);
  const { data: yearsList = [] } = useFinancialYears();
  const { data: techList = [] } = useWorkspaceTechnicians();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedTech, setSelectedTech] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  useEffect(() => {
    if (yearsList.length === 0) return;
    if (!yearsList.includes(selectedYear)) {
      setSelectedYear(yearsList[yearsList.length - 1]);
    }
  }, [yearsList, selectedYear]);

  // Orbit angle stored in ref; we mutate DOM/SVG directly to avoid React re-renders per frame
  const orbitAngleRef = useRef(0);
  const velocityRef = useRef(0);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  // We still keep a state value, but only update it when needed (drag end / module click)
  // Frame-by-frame updates go through refs + direct style mutation.
  const [, forceTick] = useState(0);
  const tickScheduledRef = useRef(false);
  const scheduleTick = useCallback(() => {
    if (tickScheduledRef.current) return;
    tickScheduledRef.current = true;
    requestAnimationFrame(() => {
      tickScheduledRef.current = false;
      forceTick((n) => (n + 1) % 1000000);
    });
  }, []);

  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 800, h: 600 });

  // Refs to per-button DOM nodes & per-line SVG nodes for direct mutation
  const buttonRefs = useRef<Array<HTMLDivElement | null>>([]);
  const lineRefs = useRef<Array<SVGLineElement | null>>([]);

  // Resize observer
  useEffect(() => {
    const update = () => {
      if (stageRef.current) {
        setStage({ w: stageRef.current.offsetWidth, h: stageRef.current.offsetHeight });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, []);

  // Layout calculations (memoized)
  const panelOpen = activeModule !== null;
  const layout = useMemo(() => {
    const globeAreaW = panelOpen ? stage.w * 0.7 : stage.w;
    const globeAreaH = stage.h;
    const centerX = globeAreaW / 2;
    const centerY = globeAreaH / 2;
    const minSide = Math.min(globeAreaW, globeAreaH);
    return {
      centerX,
      centerY,
      globeSize: minSide * 0.62,
      orbitRadius: minSide * 0.42,
    };
  }, [stage.w, stage.h, panelOpen]);

  // Direct DOM updater — avoids React reconciliation per frame
  const applyOrbitToDom = useCallback(() => {
    const { centerX, centerY, orbitRadius } = layout;
    const angle0 = orbitAngleRef.current;
    const count = MODULES.length;
    for (let i = 0; i < count; i++) {
      const a = angle0 + (i * Math.PI * 2) / count - Math.PI / 2;
      const x = centerX + Math.cos(a) * orbitRadius;
      const y = centerY + Math.sin(a) * orbitRadius;
      const btn = buttonRefs.current[i];
      if (btn) {
        btn.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      }
      const line = lineRefs.current[i];
      if (line) {
        line.setAttribute("x2", String(x));
        line.setAttribute("y2", String(y));
      }
    }
  }, [layout]);

  // Apply DOM positions whenever layout changes (resize, panel open/close)
  useEffect(() => {
    applyOrbitToDom();
  }, [applyOrbitToDom]);

  // Stabilized Phase 5D: no continuous render loop in the mounted financial route.
  useEffect(() => {
    applyOrbitToDom();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [applyOrbitToDom]);

  // Pointer drag handlers
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    velocityRef.current = 0;
    lastPointerRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !lastPointerRef.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const prev = lastPointerRef.current;
    const a1 = Math.atan2(prev.y - cy, prev.x - cx);
    const a2 = Math.atan2(e.clientY - cy, e.clientX - cx);
    let delta = a2 - a1;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    orbitAngleRef.current += delta;
    applyOrbitToDom();
    const now = performance.now();
    const dt = Math.max(1, now - prev.t);
    velocityRef.current = (delta / dt) * 16;
    lastPointerRef.current = { x: e.clientX, y: e.clientY, t: now };
  }, [applyOrbitToDom]);

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    lastPointerRef.current = null;
  }, []);

  const handleModuleClick = useCallback((key: ModuleKey) => {
    velocityRef.current = 0;
    setActiveModule((curr) => (curr === key ? null : key));
  }, []);

  const activeMod = MODULES.find((m) => m.key === activeModule) ?? null;
  const { centerX, centerY, globeSize, orbitRadius } = layout;

  // Compute initial positions for SSR/first render (DOM updater overwrites on next frame)
  const initialPositions = useMemo(() => {
    return MODULES.map((_, i) => {
      const a = orbitAngleRef.current + (i * Math.PI * 2) / MODULES.length - Math.PI / 2;
      return {
        x: centerX + Math.cos(a) * orbitRadius,
        y: centerY + Math.sin(a) * orbitRadius,
      };
    });
  }, [centerX, centerY, orbitRadius]);

  // Phase 5C: years are derived from the Detalhamento temporal source of truth.
  const years = useMemo(() => {
    if (yearsList.length > 0) return yearsList;
    const now = new Date().getFullYear();
    return [now];
  }, [yearsList]);

  return (
    <div className="h-full flex flex-col min-w-0 w-full">
      {/* Header — responsive toolbar, viewport-safe */}
      <div className="sticky top-0 z-20 flex items-center justify-between mb-4 gap-2 flex-wrap min-w-0 rounded-lg bg-background/80 py-1 backdrop-blur-sm">
        {embedded ? (
          <div />
        ) : (
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground truncate">{t("acc.controlCenter")}</h1>
            <p className="text-sm text-muted-foreground truncate">{t("acc.subtitle")}</p>
          </div>
        )}
        <div className="flex items-center justify-end gap-1.5 flex-wrap min-w-0 max-w-full overflow-visible">
          <Select value={selectedTech} onValueChange={setSelectedTech}>
            <SelectTrigger className="h-8 w-[min(160px,42vw)] text-xs">
              <SelectValue placeholder={t("acc.allTechs")} />
            </SelectTrigger>
            <SelectContent align="end" collisionPadding={12} className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-24px)]">
              <SelectItem value="all">{t("acc.allTechs")}</SelectItem>
              {techList.map((tech) => (
                <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="h-8 w-[90px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" collisionPadding={12} className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-24px)]">
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="h-8 w-[min(120px,34vw)] text-xs">
              <SelectValue placeholder={t("acc.allMonths")} />
            </SelectTrigger>
            <SelectContent align="end" collisionPadding={12} className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-24px)]">
              <SelectItem value="all">{t("acc.allMonths")}</SelectItem>
              {MONTH_LABELS.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>




      {/* Main split area */}
      <div className="relative flex-none h-[clamp(520px,65vh,680px)] min-h-[520px] rounded-xl border border-border/30 overflow-hidden flex">
        {/* Cinematic space backdrop (full container, behind everything) */}
        <div className="absolute inset-0 z-0">
          <SpaceBackground />
        </div>

        {/* Globe stage */}
        <div
          ref={stageRef}
            className="relative z-10 h-full min-w-0 transition-[width] duration-300 ease-out"
            style={{ width: panelOpen ? "70%" : "100%" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Orbit ring */}
          <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
            <circle
              cx={centerX}
              cy={centerY}
              r={orbitRadius}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth="1"
              strokeDasharray="6 6"
              opacity="0.25"
            />
          </svg>

          {/* Connection lines */}
          <svg className="absolute inset-0 pointer-events-none z-0" width="100%" height="100%">
            {MODULES.map((mod, i) => {
              const isActive = activeModule === mod.key;
              const pos = initialPositions[i];
              return (
                <line
                  key={mod.key}
                  ref={(el) => (lineRefs.current[i] = el)}
                  x1={centerX}
                  y1={centerY}
                  x2={pos.x}
                  y2={pos.y}
                  stroke={`hsl(${mod.color})`}
                  strokeWidth={isActive ? 2 : 1}
                  strokeOpacity={isActive ? 0.7 : 0.12}
                  strokeDasharray={isActive ? "none" : "4 4"}
                />
              );
            })}
          </svg>

          {/* Static center planet — avoids extra WebGL contexts in the mounted financial route */}
          <div
            className="absolute z-10 pointer-events-none left-0 top-0"
            style={{
              transform: `translate3d(${centerX - globeSize / 2}px, ${centerY - globeSize / 2}px, 0)`,
              willChange: "transform",
              overflow: "visible",
            }}
          >
            <StaticAccountingGlobe size={globeSize} />
          </div>

          {/* Orbital module buttons (positions mutated directly in DOM) */}
          {MODULES.map((mod, i) => {
            const isActive = activeModule === mod.key;
            const Icon = mod.icon;
            const pos = initialPositions[i];
            return (
              <div
                key={mod.key}
                ref={(el) => (buttonRefs.current[i] = el)}
                className="absolute z-20 left-0 top-0"
                style={{
                  transform: `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`,
                  willChange: "transform",
                }}
              >
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleModuleClick(mod.key);
                  }}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div
                    className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center border",
                      "transition-[background-color,border-color,box-shadow] duration-200 ease-out",
                      "group-hover:scale-105"
                    )}
                    style={{
                      borderColor: isActive ? `hsl(${mod.color} / 0.7)` : "hsl(var(--border) / 0.5)",
                      background: isActive
                        ? `hsl(${mod.color} / 0.15)`
                        : "hsl(var(--card) / 0.8)",
                      boxShadow: isActive
                        ? `0 0 15px hsl(${mod.color} / 0.55), 0 0 30px hsl(${mod.color} / 0.25)`
                        : undefined,
                    }}
                  >
                    <Icon
                      size={22}
                      style={{ color: isActive ? `hsl(${mod.color})` : "hsl(var(--muted-foreground))" }}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-[11px] font-medium tracking-wide whitespace-nowrap",
                      isActive ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {mod.label}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Side panel */}
        {activeMod && (
          <div
            className="relative z-10 h-full min-w-[280px] animate-slide-in-right border-l bg-card/40 backdrop-blur-md"
            style={{
              width: "30%",
              borderColor: `hsl(${activeMod.color} / 0.35)`,
              boxShadow: `inset 0 0 40px hsl(${activeMod.color} / 0.08)`,
            }}
          >
            <ActiveModulePanel
              moduleKey={activeMod.key}
              color={activeMod.color}
              label={activeMod.label}
              year={selectedYear}
              techId={selectedTech === "all" ? null : selectedTech}
              month={selectedMonth === "all" ? null : Number(selectedMonth)}
              onClose={() => setActiveModule(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const ActiveModulePanel = memo(function ActiveModulePanel({
  moduleKey,
  color,
  label,
  year,
  techId,
  month,
  onClose,
}: {
  moduleKey: ModuleKey;
  color: string;
  label: string;
  year: number;
  techId: string | null;
  month: number | null;
  onClose: () => void;
}) {
  const { entries, total, isLoading, add, update, delete: del, allowAdd } =
    useAccountingModule(moduleKey, year, techId, month);

  return (
    <ModulePanel
      title={label}
      color={color}
      entries={entries}
      total={total}
      isLoading={isLoading}
      isOpen
      onClose={onClose}
      onAdd={add}
      onUpdate={update}
      onDelete={del}
      allowAdd={allowAdd}
    />
  );
});
