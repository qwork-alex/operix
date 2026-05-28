import { useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import { usePlatforms } from "@/hooks/usePlatforms";

interface Props {
  platformName: string;
}

/**
 * Discreet operational toggle for a platform, rendered inline in the
 * Service Orders group header. Matches the visual language of the
 * permission toggles already used across the app (Radix Switch).
 *
 * - ON  → platform state = "active"
 * - OFF → platform state = "paused" (encerrada)
 *
 * No modals, no global rerender — uses the existing `usePlatforms`
 * hook which already does optimistic updates + realtime invalidation.
 * If the platform row doesn't exist yet (legacy text-only OS), the
 * toggle is hidden silently.
 */
export function PlatformOpsToggle({ platformName }: Props) {
  const { platforms, setState } = usePlatforms();

  const match = useMemo(() => {
    const norm = platformName.trim().toLowerCase();
    if (!norm || norm === "sem plataforma") return null;
    return (
      platforms.find((p) => p.name.trim().toLowerCase() === norm) ||
      platforms.find((p) => p.slug.toLowerCase() === norm.replace(/\s+/g, "-")) ||
      null
    );
  }, [platforms, platformName]);

  if (!match) return null;

  const checked = match.state === "active";
  const onChange = (v: boolean) => {
    setState.mutate({ id: match.id, state: v ? "active" : "paused" });
  };

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={checked ? "Plataforma ativa — clique para encerrar" : "Plataforma encerrada — clique para ativar"}
      onClick={(e) => e.stopPropagation()}
    >
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        className="scale-75 origin-left data-[state=checked]:bg-emerald-500/70"
        aria-label={`Toggle plataforma ${match.name}`}
      />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {checked ? "Ativa" : "Encerrada"}
      </span>
    </span>
  );
}
