import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrbitalModuleProps {
  icon: LucideIcon;
  label: string;
  angle: number;
  radius: number;
  centerX: number;
  centerY: number;
  isActive: boolean;
  color: string;
  onClick: () => void;
}

export function OrbitalModule({
  icon: Icon,
  label,
  angle,
  radius,
  centerX,
  centerY,
  isActive,
  color,
  onClick,
}: OrbitalModuleProps) {
  const rad = (angle * Math.PI) / 180;
  const x = centerX + Math.cos(rad) * radius;
  const y = centerY + Math.sin(rad) * radius;

  return (
    <>
      {/* Connection line */}
      <svg
        className="absolute inset-0 pointer-events-none z-0"
        style={{ width: "100%", height: "100%" }}
      >
        <line
          x1={centerX}
          y1={centerY}
          x2={x}
          y2={y}
          stroke={`hsl(${color})`}
          strokeWidth={isActive ? 2 : 1}
          strokeOpacity={isActive ? 0.6 : 0.15}
          strokeDasharray={isActive ? "none" : "4 4"}
          className="transition-all duration-500"
        />
        {/* Animated pulse on line when active */}
        {isActive && (
          <circle r="3" fill={`hsl(${color})`} opacity="0.8">
            <animateMotion
              dur="2s"
              repeatCount="indefinite"
              path={`M${centerX},${centerY} L${x},${y}`}
            />
          </circle>
        )}
      </svg>

      {/* Module icon button */}
      <button
        onClick={onClick}
        className={cn(
          "absolute z-10 flex flex-col items-center gap-1.5 transition-all duration-300 group",
          "hover:scale-110"
        )}
        style={{
          left: x,
          top: y,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div
          className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-300",
            isActive
              ? "border-primary/60 bg-primary/15 shadow-lg"
              : "border-border/50 bg-card/80 backdrop-blur-sm hover:border-primary/30"
          )}
          style={{
            boxShadow: isActive ? `0 0 20px hsl(${color} / 0.2)` : undefined,
          }}
        >
          <Icon
            size={22}
            className="transition-colors duration-300"
            style={{ color: isActive ? `hsl(${color})` : "hsl(var(--muted-foreground))" }}
          />
        </div>
        <span
          className={cn(
            "text-[11px] font-medium tracking-wide transition-colors duration-300 whitespace-nowrap",
            isActive ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {label}
        </span>
      </button>
    </>
  );
}
