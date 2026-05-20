/**
 * ContextualWorkspacePicker — discreet contextual workspace selector.
 *
 * Visibility rules (strict):
 *  - Admins NEVER see the picker — no icon, no dropdown, no workspace list.
 *    Admin assignment is silent and global; exposing a selector would leak
 *    workspace topology and break cross-workspace isolation.
 *  - Only roles `tecnico`, `socio`, `cliente` may see it, AND only when
 *    they belong to 2+ eligible workspaces for the current module.
 *  - Single-workspace users see nothing — assignment is automatic.
 *
 * Visual: a single minimalist icon button (no badges, no status dots).
 * Clicking opens a popover listing the user's workspaces by name. The
 * selected workspace is the destination for the action being performed
 * (upload, OS, OP, etc.). This is NOT a global workspace switcher.
 *
 * All visible strings come from `useLanguage().t()` — no hardcoded labels.
 */
import { Users2, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ContextualWorkspaceResult } from "@/hooks/useContextualWorkspace";
import { useRole } from "@/hooks/useRole";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  ctx: ContextualWorkspaceResult;
  className?: string;
  /** Kept for backward compat; visual label is intentionally suppressed. */
  label?: string;
  autoCollapse?: boolean;
}

export function ContextualWorkspacePicker({ ctx, className }: Props) {
  const { role, isAdmin } = useRole();
  const { t } = useLanguage();

  // Admins / owners: never render. Picker is restricted to tecnico/socio/cliente.
  if (isAdmin) return null;
  if (role !== "tecnico" && role !== "socio" && role !== "cliente") return null;

  // Single-workspace users: silent auto-assignment, no UI.
  if (ctx.eligibleWorkspaces.length <= 1) return null;

  const current = ctx.eligibleWorkspaces.find(
    (w) => w.id === ctx.resolvedWorkspaceId,
  );
  const needsPick = ctx.requireSelection || !ctx.resolvedWorkspaceId;

  const triggerLabel = current
    ? `${t("ws.picker.destination")}: ${current.name}`
    : t("ws.picker.select");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={triggerLabel}
          title={triggerLabel}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            needsPick && "text-primary",
            className,
          )}
        >
          <Users2 className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        className="w-56 max-w-[calc(100vw-24px)] p-1"
      >
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("ws.picker.assignTo")}
        </div>
        <div className="flex flex-col gap-0.5">
          {ctx.eligibleWorkspaces.map((w) => {
            const active = ctx.resolvedWorkspaceId === w.id;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => ctx.selectWorkspace(w.id)}
                className={cn(
                  "flex items-center justify-between rounded px-2 py-1.5 text-xs transition-colors hover:bg-accent",
                  active && "bg-accent font-medium text-foreground",
                )}
              >
                <span className="truncate">{w.name}</span>
                {active && <Check className="h-3 w-3 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
