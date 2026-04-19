import { BRAND } from "@/config/brand";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";

interface BrandProps {
  size?: number;
  showName?: boolean;
  short?: boolean;
  className?: string;
  /**
   * When true, allows admin-uploaded logo/name overrides (async).
   * Default false → fully synchronous render, zero FOUC.
   * Use only inside authenticated app chrome (Sidebar/TopBar) where
   * the brief flicker after admin customization is acceptable.
   */
  allowOverride?: boolean;
}

/**
 * Single, controlled brand renderer — used by Auth, Sidebar and TopBar.
 * - Static SVG logo + name load instantly from `@/config/brand` (no fetch, no state).
 * - When allowOverride is true, admin-uploaded logo/config swaps in seamlessly.
 */
export function Brand({
  size = 32,
  showName = true,
  short = false,
  className = "",
  allowOverride = false,
}: BrandProps) {
  // Hook always called (rules of hooks) but result ignored when not allowed.
  const override = useCompanyLogo();
  const logoUrl = allowOverride ? override.logoUrl : "";
  const brandConfig = allowOverride ? override.brandConfig : null;

  const displayName = brandConfig?.name || BRAND.name;
  const shortName = brandConfig?.name?.split(" ")[0] || BRAND.shortName;
  const finalName = short ? shortName : displayName;
  const glow = brandConfig?.glowIntensity ?? 0;

  const nameStyle: React.CSSProperties = {
    fontFamily: brandConfig?.fontFamily || undefined,
    color: brandConfig?.color || undefined,
    fontSize: brandConfig?.fontSize || undefined,
    fontWeight: brandConfig?.bold ? 700 : 600,
    fontStyle: brandConfig?.italic ? "italic" : undefined,
    textShadow: glow > 0 ? `0 0 ${glow}px ${brandConfig?.color || "#fff"}` : undefined,
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src={logoUrl || BRAND.logo}
        alt={`${displayName} logo`}
        width={size}
        height={size}
        decoding="sync"
        loading="eager"
        className="shrink-0 object-contain bg-transparent"
        style={{ background: "transparent" }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = BRAND.logo;
        }}
      />
      {showName && (
        <span className="whitespace-nowrap leading-none tracking-tight" style={nameStyle}>
          {finalName}
        </span>
      )}
    </div>
  );
}
