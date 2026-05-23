import type { CSSProperties } from "react";
import type { BrandConfig, BrandGradient } from "@/components/layout/BrandNameEditor";

/** Convert a gradient definition into a CSS image string. */
export function gradientToCss(g: BrandGradient | null | undefined): string | null {
  if (!g || !g.from || !g.to) return null;
  if (g.type === "radial") {
    return `radial-gradient(circle at 30% 30%, ${g.from}, ${g.to})`;
  }
  const angle = typeof g.angle === "number" ? g.angle : 135;
  return `linear-gradient(${angle}deg, ${g.from}, ${g.to})`;
}

/**
 * Build the text style for the brand name.
 *
 * Glow is applied as `text-shadow` (or `filter: drop-shadow` when gradient text
 * is active, since `text-shadow` does not render with transparent text).
 * NEVER applies a background, box-shadow, or container glow.
 */
export function buildBrandTextStyle(b: BrandConfig): CSSProperties {
  const textGradient = gradientToCss(b.textGradient);
  const glow = b.textGlowIntensity ?? b.glowIntensity ?? 0;
  const glowColor = b.textGlowColor || b.color || "hsl(var(--primary))";
  const weight = b.fontWeight ?? (b.bold ? 700 : 600);

  const base: CSSProperties = {
    fontFamily: b.fontFamily || undefined,
    fontSize: b.fontSize || undefined,
    fontWeight: weight,
    fontStyle: b.italic ? "italic" : undefined,
    letterSpacing:
      typeof b.letterSpacing === "number" ? `${b.letterSpacing}em` : "-0.01em",
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
    lineHeight: 1.1,
  };

  if (textGradient) {
    return {
      ...base,
      backgroundImage: textGradient,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      WebkitTextFillColor: "transparent",
      filter: glow > 0 ? `drop-shadow(0 0 ${glow}px ${glowColor})` : undefined,
    };
  }

  return {
    ...base,
    color: b.color || undefined,
    textShadow: glow > 0 ? `0 0 ${glow}px ${glowColor}` : undefined,
  };
}

/** Returns whichever brand letter to render in the logo. */
export function brandLetter(name: string | null | undefined, fallback = "Q"): string {
  if (!name) return fallback;
  return (name.match(/[\p{L}\p{N}]/u)?.[0] || fallback).toUpperCase();
}
