import { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * AS Verified — Official Creator Seal.
 *
 * Reusable global signature mark. Pure inline SVG, theme-aware via
 * `currentColor`. Minimalist: light bulb icon + handwritten "AS Verified"
 * (Allura script font) + tiny hand-with-pen finishing the signature.
 *
 * Use sparingly. The default placement is bottom-right, non-intrusive.
 */

export type ASVerifiedVariant = "light" | "dark" | "compact" | "watermark";
export type ASVerifiedPosition =
  | "inline"
  | "bottom-right"
  | "bottom-left"
  | "bottom-center"
  | "top-right";

interface ASVerifiedSealProps {
  /** Visual variant. */
  variant?: ASVerifiedVariant;
  /** Height in pixels. Width scales proportionally. Default: 22 (32 for watermark). */
  size?: number;
  /** Opacity override (0..1). */
  opacity?: number;
  /** Positioning helper. `inline` (default) renders in-flow. */
  position?: ASVerifiedPosition;
  /** Extra classes for the wrapper. */
  className?: string;
  /** Extra inline styles for the wrapper. */
  style?: CSSProperties;
  /** Accessible title. */
  title?: string;
}

const VARIANT_COLOR: Record<ASVerifiedVariant, string> = {
  light: "#0a0a0a",
  dark: "#ffffff",
  compact: "currentColor",
  watermark: "currentColor",
};

const VARIANT_OPACITY: Record<ASVerifiedVariant, number> = {
  light: 0.85,
  dark: 0.85,
  compact: 0.7,
  watermark: 0.18,
};

const POSITION_CLASS: Record<ASVerifiedPosition, string> = {
  inline: "",
  "bottom-right":
    "fixed bottom-3 right-3 z-40 pointer-events-none select-none",
  "bottom-left":
    "fixed bottom-3 left-3 z-40 pointer-events-none select-none",
  "bottom-center":
    "fixed bottom-3 left-1/2 -translate-x-1/2 z-40 pointer-events-none select-none",
  "top-right":
    "fixed top-3 right-3 z-40 pointer-events-none select-none",
};

export function ASVerifiedSeal({
  variant = "compact",
  size,
  opacity,
  position = "inline",
  className,
  style,
  title = "AS Verified — Concebido e validado por Alex Souza",
}: ASVerifiedSealProps) {
  const compact = variant === "compact";
  const watermark = variant === "watermark";
  const h = size ?? (watermark ? 32 : compact ? 18 : 22);
  // Intrinsic viewBox aspect (~5.4:1 for full, 2.4:1 for compact)
  const vbW = compact ? 60 : 132;
  const vbH = 24;
  const color = VARIANT_COLOR[variant];
  const op = opacity ?? VARIANT_OPACITY[variant];

  return (
    <div
      role="img"
      aria-label={title}
      title={title}
      className={cn(POSITION_CLASS[position], className)}
      style={{
        color,
        opacity: op,
        lineHeight: 0,
        ...style,
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${vbW} ${vbH}`}
        height={h}
        width={(h * vbW) / vbH}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.1}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Lightbulb — minimal */}
        <g transform="translate(2 2)">
          {/* rays */}
          <path d="M6 1 V2.5" />
          <path d="M1.6 2.6 L2.6 3.6" />
          <path d="M10.4 2.6 L9.4 3.6" />
          {/* bulb */}
          <path d="M6 3.2 a4 4 0 0 0 -2.4 7.2 c.5 .35 .8 .9 .8 1.5 v.3 h3.2 v-.3 c0 -.6 .3 -1.15 .8 -1.5 A4 4 0 0 0 6 3.2 Z" />
          {/* filament */}
          <path d="M5.2 8 V6.4 M6.8 8 V6.4 M5.2 6.4 H6.8" strokeWidth={0.9} />
          {/* base */}
          <path d="M4.6 13.2 H7.4" />
          <path d="M5 14.2 H7" />
        </g>

        {/* Handwritten "AS Verified" using Allura, baseline ~18 */}
        <text
          x={compact ? 16 : 16}
          y={18.5}
          fill="currentColor"
          stroke="none"
          style={{
            fontFamily: "'Allura', 'Snell Roundhand', 'Apple Chancery', cursive",
            fontSize: compact ? "16px" : "19px",
            fontWeight: 400,
            letterSpacing: "0.2px",
          }}
        >
          {compact ? "AS" : "AS Verified"}
        </text>

        {/* Flowing underline tail under the signature */}
        {!watermark && (
          <path
            d={
              compact
                ? "M16 20.5 C 26 22, 38 21, 56 19.5"
                : "M16 20.5 C 40 22.5, 80 22, 118 19.8"
            }
            opacity={0.55}
            strokeWidth={0.9}
          />
        )}

        {/* Tiny hand holding pen — only on non-compact */}
        {!compact && (
          <g transform="translate(118 6)">
            {/* pen body */}
            <path d="M2 7 L8 1 L10 3 L4 9 Z" />
            {/* nib */}
            <path d="M2 7 L1 10 L4 9" />
            {/* hand */}
            <path d="M0 12 C 2 10.5, 5 10.5, 7 11.5 L 10 10.5" />
          </g>
        )}
      </svg>
    </div>
  );
}

export default ASVerifiedSeal;
