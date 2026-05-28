import { SYSTEM_METADATA } from "@/config/system";
import { ASVerifiedSeal } from "@/components/branding/ASVerifiedSeal";

/**
 * AppFooter — discreet, enterprise-grade institutional footer.
 * Rendered globally inside authenticated app chrome.
 * Theme-aware, responsive, low visual weight by design.
 */
export function AppFooter() {
  const { trademark, year, attribution, proprietary_notice } = SYSTEM_METADATA;

  return (
    <footer
      role="contentinfo"
      aria-label="System attribution"
      className="border-t border-border/40 bg-background/60 px-6 py-2.5 text-[10px] leading-tight text-muted-foreground/70 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center justify-between gap-1 sm:flex-row">
        <span className="tracking-wide">
          {trademark} © {year} · {proprietary_notice}
        </span>
        <span className="tracking-wide opacity-80">{attribution}</span>
        <span className="hidden sm:inline-flex items-center text-foreground/70">
          <ASVerifiedSeal variant="compact" size={20} />
        </span>
        <span className="inline-flex sm:hidden items-center text-foreground/70">
          <ASVerifiedSeal variant="compact" size={16} />
        </span>
      </div>
    </footer>
  );
}
