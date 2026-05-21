import { brandConfig as appBrand } from "@/brand.config";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import { useWorkspace } from "@/hooks/useWorkspace";

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
 * Procedural brand glyph — letter-based, always generated.
 *
 * Rule: the logo is ALWAYS the first alphanumeric letter of the workspace
 * (or override) name. No raster uploads, no images — pure vector/CSS render.
 *
 * Dynamically inherits brand color, glow and typography from `brand_config`.
 */
export function BrandLogo({
  size = 32,
  className = "",
  nameOverride,
  colorOverride,
  disableGlow,
}: BrandLogoProps) {
  // Hooks must run unconditionally.
  const { brandConfig } = useCompanyLogo();
  let workspaceName: string | null = null;
  try {
    workspaceName = useWorkspace().workspaceName;
  } catch { /* outside provider (e.g. auth screens) */ }

  const displayName =
    nameOverride ||
    brandConfig?.name ||
    workspaceName ||
    appBrand.appName;

  const letter =
    (displayName.match(/[\p{L}\p{N}]/u)?.[0] || "Q").toUpperCase();

  const accentColor = colorOverride || brandConfig?.color || undefined;
  const glow = disableGlow ? 0 : (brandConfig?.glowIntensity ?? 0);

  return (
    <div
      className={`shrink-0 inline-flex items-center justify-center rounded-xl font-display font-bold select-none ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.5),
        fontFamily: brandConfig?.fontFamily || undefined,
        color: "hsl(var(--primary-foreground))",
        background: accentColor
          ? `linear-gradient(135deg, ${accentColor}, hsl(var(--accent)))`
          : "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))",
        boxShadow: [
          "inset 0 1px 0 hsl(0 0% 100% / 0.18)",
          "inset 0 -1px 0 hsl(0 0% 0% / 0.25)",
          "0 6px 18px -8px hsl(var(--primary) / 0.55)",
          glow > 0 ? `0 0 ${glow}px ${accentColor || "hsl(var(--primary))"}` : "",
        ]
          .filter(Boolean)
          .join(", "),
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
      aria-label={`${displayName} logo`}
    >
      {letter}
    </div>
  );
}
