import { brandConfig as appBrand } from "@/brand.config";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import { useWorkspace } from "@/hooks/useWorkspace";
import { brandLetter, gradientToCss } from "@/lib/brandStyles";

interface BrandLogoProps {
  size?: number;
  className?: string;
  /** Override the source name (used in invoices/PDFs to inherit workspace name). */
  nameOverride?: string;
  /** Optional explicit color override (used by print contexts). */
  colorOverride?: string;
  /** When true, ignores configured glow (useful for print/PDF). */
  disableGlow?: boolean;
}

/**
 * Procedural brand glyph — letter-based, always generated as inline SVG.
 *
 * Rules:
 *  - The glow is applied via `filter: drop-shadow` on the SVG <text>, never
 *    on the wrapping container. No box-shadow, no container background glow.
 *  - The glyph can be solid color or gradient (linear / radial).
 *  - Container is transparent unless `logoStyle === "solid" | "glass"`, and
 *    even then it carries NO outer glow.
 */
export function BrandLogo({
  size = 32,
  className = "",
  nameOverride,
  colorOverride,
  disableGlow,
}: BrandLogoProps) {
  const { brandConfig } = useCompanyLogo();
  let workspaceName: string | null = null;
  try {
    workspaceName = useWorkspace().workspaceName;
  } catch { /* outside provider (auth screens) */ }

  const displayName =
    nameOverride || brandConfig?.name || workspaceName || appBrand.appName;
  const letter = brandLetter(displayName);

  const radius = brandConfig?.logoRadius ?? 22; // % radius
  const style = brandConfig?.logoStyle || "transparent";
  const fillColor = colorOverride || brandConfig?.logoColor || brandConfig?.color;
  const gradient = gradientToCss(brandConfig?.logoGradient);
  const glow = disableGlow ? 0 : (brandConfig?.logoGlowIntensity ?? 0);
  const glowColor =
    brandConfig?.logoGlowColor ||
    fillColor ||
    "hsl(var(--primary))";

  // SVG gradient id (unique-ish per render).
  const gid = `bg-grad-${size}`;

  // Container background — kept subtle, never glowing.
  let containerBg = "transparent";
  let containerBorder = "transparent";
  if (style === "solid") {
    containerBg = "hsl(var(--muted) / 0.4)";
    containerBorder = "hsl(var(--border) / 0.6)";
  } else if (style === "glass") {
    containerBg = "hsl(var(--card) / 0.55)";
    containerBorder = "hsl(var(--border) / 0.5)";
  }

  return (
    <div
      className={`shrink-0 inline-flex items-center justify-center select-none ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: `${radius}%`,
        background: containerBg,
        border: containerBorder !== "transparent" ? `1px solid ${containerBorder}` : undefined,
        // NO box-shadow. Ever.
      }}
      aria-label={`${displayName} logo`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          // Drop-shadow rides the alpha channel of the letter → only the
          // glyph glows, not a square.
          filter: glow > 0 ? `drop-shadow(0 0 ${glow * 0.35}px ${glowColor}) drop-shadow(0 0 ${glow * 0.9}px ${glowColor})` : undefined,
          overflow: "visible",
        }}
      >
        {brandConfig?.logoGradient ? (
          <defs>
            <linearGradient
              id={gid}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
              gradientTransform={`rotate(${(brandConfig.logoGradient.angle ?? 135) - 135}, 0.5, 0.5)`}
            >
              <stop offset="0%" stopColor={brandConfig.logoGradient.from} />
              <stop offset="100%" stopColor={brandConfig.logoGradient.to} />
            </linearGradient>
          </defs>
        ) : null}
        <text
          x="50"
          y="54"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={brandConfig?.fontFamily || "Space Grotesk, Inter, sans-serif"}
          fontSize="64"
          fontWeight={800}
          letterSpacing="-2"
          fill={brandConfig?.logoGradient ? `url(#${gid})` : fillColor || "hsl(var(--primary))"}
          style={{
            // Anti-alias the glyph itself.
            paintOrder: "stroke fill",
          }}
        >
          {letter}
        </text>
      </svg>
    </div>
  );
}
