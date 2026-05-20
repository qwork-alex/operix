/**
 * ContextualWorkspacePicker — discreet contextual workspace selector.
 *
 * Renders ONLY when the user is linked to 2+ workspaces eligible for the
 * current module (e.g. a technician shared between "Quality Work" and
 * "Sanches"). For single-workspace users it renders nothing — assignment
 * is silent and automatic.
 *
 * Visual: a single minimalist Users icon button. Clicking opens a popover
 * listing the user's workspaces by name. The selected workspace is the
 * destination for the action being performed (upload, OS, OP, etc.).
 *
 * This is NOT a global workspace switcher. It does not change the active
 * application context — it only picks the destination workspace for the
 * next assignment.
 */
import { Users2, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ContextualWorkspaceResult } from "@/hooks/useContextualWorkspace";

interface Props {
  ctx: ContextualWorkspaceResult;
  className?: string;
  /** Visual label is intentionally suppressed; kept for backward compat. */
  label?: string;
  autoCollapse?: boolean;
}

export function ContextualWorkspacePicker({ ctx, className }: Props) {
  // Single-workspace users: silent auto-assignment, no UI.
  if (ctx.eligibleWorkspaces.length <= 1) return null;

  const current = ctx.eligibleWorkspaces.find(
    (w) => w.id === ctx.resolvedWorkspaceId,
  );
  const needsPick = ctx.requireSelection || !ctx.resolvedWorkspaceId;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            current
              ? `Workspace de destino: ${current.name}`
              : "Selecionar workspace de destino"
          }
          title={
            current
              ? `Destino: ${current.name}`
              : "Selecionar workspace de destino"
          }
          className={cn(
            "relative inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            needsPick && "text-primary",
            className,
          )}
        >
          <Users2 className="h-3.5 w-3.5" />
          {needsPick && (
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        className="w-56 max-w-[calc(100vw-24px)] p-1"
      >
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          Atribuir a
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
