import { brandConfig as appBrand } from "@/brand.config";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import { useWorkspace } from "@/hooks/useWorkspace";

interface BrandLogoProps {
  size?: number;
  className?: string;
  /** Override the source name (used in invoices/PDFs to inherit workspace branding). */
  nameOverride?: string;
  /** Force-skip uploaded logo and use auto-monogram instead. */
  forceMonogram?: boolean;
  /** Direct URL override (used in invoice PDF where company logo comes from props). */
  logoUrlOverride?: string | null;
}

/**
 * Premium dynamic brand glyph.
 * - If the workspace uploaded a logo → renders it.
 * - Otherwise → generates an elegant gradient monogram from the first
 *   letter of the workspace / brand name (e.g. "Sanches Auto" → "S").
 * Respects user-configured color + glow from brand_config.
 */
export function BrandLogo({
  size = 32,
  className = "",
  nameOverride,
  forceMonogram,
  logoUrlOverride,
}: BrandLogoProps) {
  // Hooks must run unconditionally — they're cheap (cached via react-query).
  const { logoUrl, brandConfig } = useCompanyLogo();
  let workspaceName: string | null = null;
  try {
    // useWorkspace can throw if outside provider (rare — auth screens).
    workspaceName = useWorkspace().workspaceName;
  } catch { /* no workspace context */ }

  const effectiveUrl =
    logoUrlOverride !== undefined ? logoUrlOverride : logoUrl;

  const displayName =
    nameOverride ||
    brandConfig?.name ||
    workspaceName ||
    appBrand.appName;

  // Show real logo when available
  if (!forceMonogram && effectiveUrl) {
    return (
      <img
        src={effectiveUrl}
        alt={`${displayName} logo`}
        width={size}
        height={size}
        decoding="sync"
        loading="eager"
        className={`shrink-0 object-contain bg-transparent ${className}`}
        style={{ background: "transparent" }}
      />
    );
  }

  // Auto-monogram from first alphanumeric character
  const letter =
    (displayName.match(/[\p{L}\p{N}]/u)?.[0] || "Q").toUpperCase();

  const accentColor = brandConfig?.color || undefined;
  const glow = brandConfig?.glowIntensity ?? 0;

  return (
    <div
      className={`shrink-0 inline-flex items-center justify-center rounded-xl font-display font-bold select-none ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.5),
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
