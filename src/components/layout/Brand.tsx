import { BRAND } from "@/config/brand";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";

interface BrandProps {
  size?: number;
  showName?: boolean;
  short?: boolean;
  className?: string;
}

/**
 * Single, controlled brand renderer.
 * - Static SVG logo loads instantly (no FOUC, no flicker).
 * - If admin uploaded a custom logo, it overrides via <img onLoad> swap (no layout shift).
 * - Brand name comes from admin config when present, otherwise the static BRAND.name.
 */
export function Brand({ size = 32, showName = true, short = false, className = "" }: BrandProps) {
  const { logoUrl, brandConfig } = useCompanyLogo();

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
        className="shrink-0 object-contain"
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
