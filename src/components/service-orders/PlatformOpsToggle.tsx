import { useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { usePlatforms } from "@/hooks/usePlatforms";
import { useRole } from "@/hooks/useRole";
import { useWorkspace } from "@/hooks/useWorkspace";

interface Props {
  platformName: string;
}

/**
 * Inline operational toggle for a platform, rendered in the OS group header.
 *
 * Authority rules
 * ---------------
 * - Workspace admin / partner (and owner) → can toggle workspace platforms.
 * - Technician inside a workspace → toggle is HIDDEN (no collective authority).
 * - Standalone technician (no workspace) → no platform row exists for them,
 *   so nothing to render here; their own OS run privately.
 *
 * Behavior
 * --------
 * - If a platforms row exists for the given name → toggle reflects its state
 *   and switches between `active` ⇄ `paused` via optimistic mutation.
 * - If no platforms row exists yet (legacy text-only OS) → toggle still
 *   renders (default OFF). Turning it ON auto-creates the platform with
 *   state="active" so future toggles use the canonical entity.
 *
 * No new providers, no extra effects, no global state.
 */
export function PlatformOpsToggle({ platformName }: Props) {
  const { platforms, setState, create } = usePlatforms();
  const { role } = useRole();
  const { workspaceId } = useWorkspace();
  const [creating, setCreating] = useState(false);

  const match = useMemo(() => {
    const norm = platformName.trim().toLowerCase();
    if (!norm || norm === "sem plataforma") return null;
    return (
      platforms.find((p) => p.name.trim().toLowerCase() === norm) ||
      platforms.find((p) => p.slug.toLowerCase() === norm.replace(/\s+/g, "-")) ||
      null
    );
  }, [platforms, platformName]);

  // Skip the empty/placeholder bucket.
  const norm = platformName.trim().toLowerCase();
  if (!norm || norm === "sem plataforma") return null;

  // Authority gate — technicians inside a workspace cannot toggle collective platforms.
  const isTechInWorkspace = role === "tecnico" && !!workspaceId;
  if (isTechInWorkspace) return null;

  // Cannot persist platform without a workspace (standalone users have no canonical row).
  if (!workspaceId) return null;

  const checked = match ? match.state === "active" : false;

  const onChange = async (v: boolean) => {
    if (match) {
      setState.mutate({ id: match.id, state: v ? "active" : "paused" });
      return;
    }
    // No row yet → create on first activation.
    if (!v || creating) return;
    setCreating(true);
    try {
      await create.mutateAsync({ name: platformName.trim(), state: "active" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={
        match
          ? checked
            ? "Plataforma ativa — clique para encerrar"
            : "Plataforma encerrada — clique para ativar"
          : "Plataforma não registada — clique para ativar"
      }
      onClick={(e) => e.stopPropagation()}
    >
      {creating ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      ) : (
        <Switch
          checked={checked}
          onCheckedChange={onChange}
          className="scale-75 origin-left data-[state=checked]:bg-emerald-500/70"
          aria-label={`Toggle plataforma ${platformName}`}
        />
      )}
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {checked ? "Ativa" : "Encerrada"}
      </span>
    </span>
  );
}
