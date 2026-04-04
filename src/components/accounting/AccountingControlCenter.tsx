import { useState, useEffect, useRef } from "react";
import {
  DollarSign,
  Receipt,
  Fuel,
  ShoppingCart,
  Landmark,
  Wallet,
} from "lucide-react";
import { Globe } from "./Globe";
import { OrbitalModule } from "./OrbitalModule";
import { ModulePanel, type ModuleEntry } from "./ModulePanel";
import { useAccountingModule } from "./useAccountingModules";

type ModuleKey = "revenue" | "expenses" | "fuel" | "purchases" | "government" | "withdrawals";

const MODULES: {
  key: ModuleKey;
  label: string;
  icon: any;
  color: string;
  angle: number;
}[] = [
  { key: "revenue", label: "Receitas", icon: DollarSign, color: "43 85% 55%", angle: -90 },
  { key: "expenses", label: "Despesas", icon: Receipt, color: "0 72% 55%", angle: -30 },
  { key: "fuel", label: "Combustível", icon: Fuel, color: "210 80% 55%", angle: 30 },
  { key: "purchases", label: "Compras", icon: ShoppingCart, color: "280 60% 55%", angle: 90 },
  { key: "government", label: "Governo", icon: Landmark, color: "152 60% 45%", angle: 150 },
  { key: "withdrawals", label: "Retiradas", icon: Wallet, color: "38 92% 55%", angle: 210 },
];

export function AccountingControlCenter() {
  const [activeModule, setActiveModule] = useState<ModuleKey | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setDimensions({
          w: containerRef.current.offsetWidth,
          h: containerRef.current.offsetHeight,
        });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const centerX = dimensions.w / 2;
  const centerY = dimensions.h / 2;
  const globeSize = Math.min(dimensions.w, dimensions.h) * 0.48;
  const orbitRadius = Math.min(dimensions.w, dimensions.h) * 0.42;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Centro de Controle</h1>
          <p className="text-sm text-muted-foreground">Contabilidade interativa</p>
        </div>
      </div>

      {/* Main area */}
      <div
        ref={containerRef}
        className="relative flex-1 min-h-[500px] rounded-xl border border-border/30 bg-card/30 overflow-hidden"
      >
        {/* Globe center */}
        <div
          className="absolute z-10"
          style={{
            left: centerX - globeSize / 2,
            top: centerY - globeSize / 2,
          }}
        >
          <Globe size={globeSize} />
        </div>

        {/* Orbital modules */}
        {MODULES.map((mod) => (
          <OrbitalModule
            key={mod.key}
            icon={mod.icon}
            label={mod.label}
            angle={mod.angle}
            radius={orbitRadius}
            centerX={centerX}
            centerY={centerY}
            isActive={activeModule === mod.key}
            color={mod.color}
            onClick={() => setActiveModule(activeModule === mod.key ? null : mod.key)}
          />
        ))}

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
            opacity="0.3"
          />
        </svg>
      </div>

      {/* Side panel for active module */}
      {activeModule && <ActiveModulePanel moduleKey={activeModule} onClose={() => setActiveModule(null)} />}
    </div>
  );
}

function ActiveModulePanel({ moduleKey, onClose }: { moduleKey: ModuleKey; onClose: () => void }) {
  const mod = MODULES.find((m) => m.key === moduleKey)!;
  const { entries, total, isLoading, add, update, delete: del, allowAdd } = useAccountingModule(moduleKey);

  return (
    <ModulePanel
      title={mod.label}
      color={mod.color}
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
