import { useState, useEffect, useRef, useCallback } from "react";
import {
  DollarSign,
  Receipt,
  Fuel,
  ShoppingCart,
  Landmark,
  Wallet,
  TrendingUp,
} from "lucide-react";
import { Globe } from "./Globe";
import { ModulePanel } from "./ModulePanel";
import { useAccountingModule } from "./useAccountingModules";
import { cn } from "@/lib/utils";

type ModuleKey = "revenue" | "expenses" | "fuel" | "purchases" | "government" | "withdrawals";

interface ModuleDef {
  key: ModuleKey;
  label: string;
  icon: any;
  color: string; // HSL string without hsl()
}

const MODULES: ModuleDef[] = [
  { key: "revenue",     label: "Receitas",    icon: DollarSign,   color: "43 85% 55%"  }, // yellow
  { key: "expenses",    label: "Despesas",    icon: Receipt,      color: "0 72% 55%"   }, // red
  { key: "fuel",        label: "Combustível", icon: Fuel,         color: "210 80% 55%" }, // blue
  { key: "purchases",   label: "Compras",     icon: ShoppingCart, color: "280 60% 60%" }, // purple
  { key: "government",  label: "Governo",     icon: Landmark,     color: "152 60% 45%" }, // green
  { key: "withdrawals", label: "Retiradas",   icon: Wallet,       color: "28 92% 55%"  }, // orange
];

export function AccountingControlCenter() {
  const [activeModule, setActiveModule] = useState<ModuleKey | null>(null);

  // Orbit rotation (in radians). Drag updates this; inertia decays it.
  const [orbitAngle, setOrbitAngle] = useState(0);
  const orbitAngleRef = useRef(0);
  const velocityRef = useRef(0); // rad / frame
  const draggingRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 800, h: 600 });

  // Keep ref in sync
  useEffect(() => { orbitAngleRef.current = orbitAngle; }, [orbitAngle]);

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

  // Inertia / floating animation loop
  useEffect(() => {
    const loop = () => {
      // Apply velocity with damping when not dragging and no module selected
      if (!draggingRef.current && !activeModule) {
        if (Math.abs(velocityRef.current) > 0.00005) {
          orbitAngleRef.current += velocityRef.current;
          velocityRef.current *= 0.94; // friction
          setOrbitAngle(orbitAngleRef.current);
        } else if (velocityRef.current !== 0) {
          velocityRef.current = 0;
        } else {
          // Subtle ambient drift (alive feel)
          orbitAngleRef.current += 0.0008;
          setOrbitAngle(orbitAngleRef.current);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [activeModule]);

  // Pointer drag handlers (on the stage)
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Don't start drag when clicking on a module button (it has its own handler & stops propagation)
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
    setOrbitAngle(orbitAngleRef.current);
    const now = performance.now();
    const dt = Math.max(1, now - prev.t);
    // velocity in rad per frame (~16ms)
    velocityRef.current = (delta / dt) * 16;
    lastPointerRef.current = { x: e.clientX, y: e.clientY, t: now };
  }, []);

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    lastPointerRef.current = null;
  }, []);

  const handleModuleClick = (key: ModuleKey) => {
    velocityRef.current = 0;
    setActiveModule((curr) => (curr === key ? null : key));
  };

  // Layout calculations
  const panelOpen = activeModule !== null;
  const globeArea = {
    w: panelOpen ? stage.w * 0.7 : stage.w,
    h: stage.h,
  };
  const centerX = globeArea.w / 2;
  const centerY = globeArea.h / 2;
  const minSide = Math.min(globeArea.w, globeArea.h);
  // Larger globe (~30% bigger), tighter orbit
  const globeSize = minSide * 0.62;
  const orbitRadius = minSide * 0.42;

  const activeMod = MODULES.find((m) => m.key === activeModule) ?? null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Centro de Controle</h1>
          <p className="text-sm text-muted-foreground">Contabilidade interativa</p>
        </div>
      </div>

      {/* Main split area */}
      <div className="relative flex-1 min-h-[500px] rounded-xl border border-border/30 bg-card/30 overflow-hidden flex">
        {/* Globe stage (resizes when panel opens) */}
        <div
          ref={stageRef}
          className="relative transition-[width] duration-500 ease-out"
          style={{ width: panelOpen ? "70%" : "100%", height: "100%" }}
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

          {/* Connection lines layer */}
          <svg className="absolute inset-0 pointer-events-none z-0" width="100%" height="100%">
            {MODULES.map((mod, i) => {
              const angle = orbitAngle + (i * Math.PI * 2) / MODULES.length - Math.PI / 2;
              const x = centerX + Math.cos(angle) * orbitRadius;
              const y = centerY + Math.sin(angle) * orbitRadius;
              const isActive = activeModule === mod.key;
              return (
                <g key={mod.key}>
                  <line
                    x1={centerX}
                    y1={centerY}
                    x2={x}
                    y2={y}
                    stroke={`hsl(${mod.color})`}
                    strokeWidth={isActive ? 2 : 1}
                    strokeOpacity={isActive ? 0.7 : 0.12}
                    strokeDasharray={isActive ? "none" : "4 4"}
                    style={{ transition: "stroke-opacity 0.3s ease, stroke-width 0.3s ease" }}
                  />
                  {isActive && (
                    <circle r="3" fill={`hsl(${mod.color})`} opacity="0.85">
                      <animateMotion
                        dur="2s"
                        repeatCount="indefinite"
                        path={`M${centerX},${centerY} L${x},${y}`}
                      />
                    </circle>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Globe (centered) */}
          <div
            className="absolute z-10 pointer-events-none"
            style={{
              left: centerX - globeSize / 2,
              top: centerY - globeSize / 2,
              transition: "left 0.5s ease-out, top 0.5s ease-out, width 0.5s, height 0.5s",
            }}
          >
            <Globe size={globeSize} />
            {/* Center icon (replaces text) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="rounded-full bg-background/50 backdrop-blur-sm border border-primary/20 p-3 shadow-lg"
                style={{ boxShadow: "0 0 20px hsl(var(--primary) / 0.25)" }}
              >
                <TrendingUp size={Math.max(20, globeSize * 0.07)} className="text-primary" />
              </div>
            </div>
          </div>

          {/* Orbital module buttons */}
          {MODULES.map((mod, i) => {
            const angle = orbitAngle + (i * Math.PI * 2) / MODULES.length - Math.PI / 2;
            const x = centerX + Math.cos(angle) * orbitRadius;
            const y = centerY + Math.sin(angle) * orbitRadius;
            const isActive = activeModule === mod.key;
            const Icon = mod.icon;
            return (
              <button
                key={mod.key}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleModuleClick(mod.key);
                }}
                className={cn(
                  "absolute z-20 flex flex-col items-center gap-1.5 group",
                  "transition-transform duration-300 hover:scale-105"
                )}
                style={{
                  left: x,
                  top: y,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div
                  className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center border backdrop-blur-sm",
                    "transition-all duration-300"
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
                    className="transition-colors duration-300"
                  />
                </div>
                <span
                  className={cn(
                    "text-[11px] font-medium tracking-wide whitespace-nowrap transition-colors duration-300",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}
                  style={isActive ? { textShadow: `0 0 8px hsl(${mod.color} / 0.5)` } : undefined}
                >
                  {mod.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Side panel area (30%) */}
        {activeMod && (
          <div
            className="relative animate-slide-in-right border-l"
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
              onClose={() => setActiveModule(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ActiveModulePanel({
  moduleKey,
  color,
  label,
  onClose,
}: {
  moduleKey: ModuleKey;
  color: string;
  label: string;
  onClose: () => void;
}) {
  const { entries, total, isLoading, add, update, delete: del, allowAdd } =
    useAccountingModule(moduleKey);

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
}
