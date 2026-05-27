import { cn } from "@/lib/utils";

interface HailRadarIconProps {
  className?: string;
  size?: number;
}

/**
 * Hybrid hail-radar icon.
 * Circular radar sweep + detection rings + falling hail particles.
 * Premium / command-center / meteorological visual identity.
 */
export function HailRadarIcon({ className, size = 16 }: HailRadarIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      {/* Outer detection ring (subtle) */}
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.25"
        fill="none"
      />
      {/* Middle detection ring */}
      <circle
        cx="12"
        cy="12"
        r="6"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.45"
        fill="none"
      />
      {/* Inner detection ring */}
      <circle
        cx="12"
        cy="12"
        r="3"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.65"
        fill="none"
      />
      {/* Radar sweep arc (270° open at bottom-left) */}
      <path
        d="M12 3 A9 9 0 1 1 3 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Sweep tail / pointer */}
      <line
        x1="12"
        y1="12"
        x2="12"
        y2="3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Center pivot dot */}
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      {/* Falling hail particles — 3 hexagonal dots in a staggered drop */}
      <g opacity="0.9">
        <polygon
          points="17,5.2 17.6,6.1 17,7 16.4,6.1"
          fill="currentColor"
        />
        <polygon
          points="19.5,8.2 20.1,9.1 19.5,10 18.9,9.1"
          fill="currentColor"
          opacity="0.7"
        />
        <polygon
          points="17,11.2 17.6,12.1 17,13 16.4,12.1"
          fill="currentColor"
          opacity="0.5"
        />
      </g>
      {/* Secondary hail streak — small trail */}
      <line
        x1="17"
        y1="5.2"
        x2="17"
        y2="7.8"
        stroke="currentColor"
        strokeWidth="0.6"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}
