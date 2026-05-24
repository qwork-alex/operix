import { CSSProperties } from "react";

/**
 * AS Verified — Official authorship signature mark.
 * Pure inline SVG, theme-aware via currentColor, zero dependencies.
 * Decorative by default (pointer-events: none).
 */

export type ASVerifiedVariant = "subtle" | "normal" | "premium";
export type ASVerifiedMode = "auto" | "compact";

interface ASVerifiedSignatureProps {
  variant?: ASVerifiedVariant;
  mode?: ASVerifiedMode;
  className?: string;
  style?: CSSProperties;
  animated?: boolean;
  title?: string;
  interactive?: boolean;
}

const OPACITY: Record<ASVerifiedVariant, number> = {
  subtle: 0.35,
  normal: 0.7,
  premium: 0.95,
};

const STROKE: Record<ASVerifiedVariant, number> = {
  subtle: 1,
  normal: 1.25,
  premium: 1.5,
};

export function ASVerifiedSignature({
  variant = "normal",
  mode = "auto",
  className,
  style,
  animated = false,
  title = "AS Verified — Concebido e validado por Alex Souza",
  interactive = false,
}: ASVerifiedSignatureProps) {
  const opacity = OPACITY[variant];
  const sw = STROKE[variant];
  const compact = mode === "compact";

  // ViewBox sized for one-line signature
  const width = compact ? 86 : 184;
  const height = 28;

  return (
    <svg
      role="img"
      aria-label={title}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        color: "currentColor",
        opacity,
        pointerEvents: interactive ? "auto" : "none",
        userSelect: "none",
        display: "block",
        ...style,
      }}
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{title}</title>

      {/* Lightbulb icon — minimal */}
      <g transform="translate(4 4)">
        <path d="M10 2.5a5.5 5.5 0 0 0-3.3 9.9c.5.4.8 1 .8 1.6v.5h5v-.5c0-.6.3-1.2.8-1.6A5.5 5.5 0 0 0 10 2.5Z" />
        <path d="M7.8 17h4.4" />
        <path d="M8.5 19h3" />
      </g>

      {/* Handwritten "AS Verified" — single flowing path */}
      {!compact && (
        <g transform="translate(26 6)">
          {/* A */}
          <path d="M0 16 L5 2 L10 16 M2 11 H8" />
          {/* S */}
          <path d="M20 4 C 17 3, 13 4, 13 7 C 13 10, 20 10, 20 13 C 20 16, 16 17, 13 15" />
          {/* space */}
          {/* V */}
          <path d="M28 4 L32 16 L36 4" />
          {/* e */}
          <path d="M38 12 C 38 9, 41 8, 43 10 C 44 11, 43 12, 38 12 C 38 15, 41 16, 44 14" />
          {/* r */}
          <path d="M47 8 V 16 M47 10 C 48 8, 50 8, 51 9" />
          {/* i */}
          <path d="M54 9 V 16 M54 6.5 V 6.6" />
          {/* f */}
          <path d="M58 16 V 6 C 58 4, 60 3, 62 4 M56 10 H 61" />
          {/* i */}
          <path d="M65 9 V 16 M65 6.5 V 6.6" />
          {/* e */}
          <path d="M68 12 C 68 9, 71 8, 73 10 C 74 11, 73 12, 68 12 C 68 15, 71 16, 74 14" />
          {/* d */}
          <path d="M83 4 V 16 M83 10 C 81 8, 77 9, 77 13 C 77 17, 81 17, 83 15" />
          {/* flowing underline tail */}
          <path
            d="M0 20 C 20 23, 50 23, 86 19"
            opacity={0.6}
            strokeDasharray={animated ? "200" : undefined}
            strokeDashoffset={animated ? "200" : undefined}
            style={
              animated
                ? { animation: "as-draw 1.8s ease-out 0.2s forwards" }
                : undefined
            }
          />
        </g>
      )}

      {compact && (
        <g transform="translate(26 6)">
          <path d="M0 16 L5 2 L10 16 M2 11 H8" />
          <path d="M20 4 C 17 3, 13 4, 13 7 C 13 10, 20 10, 20 13 C 20 16, 16 17, 13 15" />
        </g>
      )}

      {/* Tiny hand holding pen at signature end */}
      <g transform={`translate(${(compact ? 60 : 158)} 8)`}>
        {/* pen */}
        <path d="M14 0 L20 6 L17 9 L11 3 Z" />
        <path d="M11 3 L8 12 L17 9" />
        {/* hand */}
        <path d="M2 16 C 4 14, 7 14, 9 15 L 12 14" />
      </g>

      {animated && (
        <style>{`@keyframes as-draw { to { stroke-dashoffset: 0; } }`}</style>
      )}
    </svg>
  );
}

export default ASVerifiedSignature;
