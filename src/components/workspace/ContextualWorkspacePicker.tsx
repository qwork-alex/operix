/**
 * ContextualWorkspacePicker — discreet inline selector.
 *
 * Renders ONLY when the user must choose between 2+ eligible workspaces
 * for the given module. Hidden when auto-resolved.
 *
 * Usage:
 *   const ctx = useContextualWorkspace("payment_orders");
 *   <ContextualWorkspacePicker ctx={ctx} label="Atribuir a:" />
 *   // commit your action with ctx.resolvedWorkspaceId
 */
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ContextualWorkspaceResult } from "@/hooks/useContextualWorkspace";

interface Props {
  ctx: ContextualWorkspaceResult;
  label?: string;
  className?: string;
  /** Auto-hide after the user confirms (default true). */
  autoCollapse?: boolean;
}

export function ContextualWorkspacePicker({
  ctx,
  label = "Workspace:",
  className,
  autoCollapse = true,
}: Props) {
  // Auto-mode: only 1 eligible workspace → render nothing.
  if (ctx.eligibleWorkspaces.length <= 1) return null;

  // User has already confirmed in this session and we don't need to nag.
  const confirmed = !ctx.requireSelection && !!ctx.resolvedWorkspaceId;
  if (confirmed && autoCollapse) {
    const current = ctx.eligibleWorkspaces.find(
      (w) => w.id === ctx.resolvedWorkspaceId,
    );
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors",
              className,
            )}
            aria-label="Alterar workspace desta ação"
          >
            <span className="opacity-60">↳</span>
            <span className="font-mono">{current?.name ?? "—"}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1" align="start">
          <WorkspaceList ctx={ctx} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px]",
        className,
      )}
      role="group"
      aria-label="Selecionar workspace para esta ação"
    >
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        {ctx.eligibleWorkspaces.map((w) => {
          const active = ctx.resolvedWorkspaceId === w.id;
          return (
            <Button
              key={w.id}
              type="button"
              size="sm"
              variant={active ? "default" : "ghost"}
              onClick={() => ctx.selectWorkspace(w.id)}
              className="h-6 px-2 text-[10px] font-mono"
            >
              {active && <Check className="h-3 w-3 mr-1" />}
              {w.name}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function WorkspaceList({ ctx }: { ctx: ContextualWorkspaceResult }) {
  return (
    <div className="flex flex-col gap-0.5">
      {ctx.eligibleWorkspaces.map((w) => {
        const active = ctx.resolvedWorkspaceId === w.id;
        return (
          <button
            key={w.id}
            type="button"
            onClick={() => ctx.selectWorkspace(w.id)}
            className={cn(
              "flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-accent transition-colors",
              active && "bg-accent font-medium",
            )}
          >
            <span className="font-mono">{w.name}</span>
            {active && <Check className="h-3 w-3 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}
