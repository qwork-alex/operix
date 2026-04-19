import { brandConfig } from "@/brand.config";

interface BrandLogoProps {
  size?: number;
  className?: string;
}

/**
 * The ONE component responsible for rendering the brand logo
 * across the entire application. Do not render <img> for the logo
 * anywhere else — always import and use <BrandLogo />.
 */
export function BrandLogo({ size = 32, className = "" }: BrandLogoProps) {
  return (
    <img
      src={brandConfig.logo}
      alt={`${brandConfig.appName} logo`}
      width={size}
      height={size}
      decoding="sync"
      loading="eager"
      className={`shrink-0 object-contain bg-transparent ${className}`}
      style={{ background: "transparent" }}
    />
  );
}
