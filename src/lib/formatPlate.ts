/**
 * Standardizes license plate formatting.
 * - Uppercases all characters
 * - Removes existing hyphens/spaces
 * - Applies hyphen formatting based on length:
 *   - 7 chars: AA-123-AA (2-3-2) — French/EU standard
 *   - 6 chars: AA-1234 (2-4)
 *   - 8 chars: AAA-123-AA (3-3-2)
 *   - Other lengths: returned as-is (uppercased, no hyphens)
 */
export function formatLicensePlate(raw: string | null | undefined): string {
  if (!raw) return "";
  const clean = raw.replace(/[\s\-]/g, "").toUpperCase();
  if (!clean) return "";

  switch (clean.length) {
    case 7:
      return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5, 7)}`;
    case 6:
      return `${clean.slice(0, 2)}-${clean.slice(2, 6)}`;
    case 8:
      return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 8)}`;
    default:
      return clean;
  }
}
