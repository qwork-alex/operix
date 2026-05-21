/**
 * PermissionButton — visual layer for context-aware actions.
 *
 * Frontend-only. Wraps <Button /> and resolves via the single `can()` source.
 * - When allowed: renders the button normally.
 * - When denied: renders a disabled button with an explanatory tooltip.
 * - When hideWhenDenied: renders nothing (use for destructive-only actions).
 *
 * SAFE MODE: no backend, no role hardcoding — uses usePermission resolver.
 */
import { forwardRef, ReactNode } from "react";
import { Button, ButtonProps } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Lock } from "lucide-react";
import { useCan } from "@/hooks/usePermission";

export interface PermissionButtonProps extends ButtonProps {
  /** "module.action" — required */
  permission: string;
  /** Show nothing when denied instead of a disabled button. */
  hideWhenDenied?: boolean;
  /** Override the default restriction message. */
  deniedMessage?: string;
  /** Icon prefix when locked. */
  showLockIcon?: boolean;
  children?: ReactNode;
}

export const PermissionButton = forwardRef<HTMLButtonElement, PermissionButtonProps>(
  function PermissionButton(
    {
      permission,
      hideWhenDenied = false,
      deniedMessage,
      showLockIcon = true,
      disabled,
      children,
      onClick,
      ...rest
    },
    ref,
  ) {
    const { can, isLoading } = useCan();
    const [m, a] = permission.split(".");
    const allowed = can(m, a).allowed;

    if (isLoading) {
      return (
        <Button ref={ref} disabled {...rest}>
          {children}
        </Button>
      );
    }

    if (allowed) {
      return (
        <Button ref={ref} disabled={disabled} onClick={onClick} {...rest}>
          {children}
        </Button>
      );
    }

    if (hideWhenDenied) return null;

    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Wrap in span so tooltip works on disabled button */}
            <span className="inline-flex">
              <Button
                ref={ref}
                disabled
                aria-disabled
                className={rest.className}
                variant={rest.variant}
                size={rest.size}
              >
                {showLockIcon && <Lock className="h-3 w-3 mr-1.5 opacity-70" />}
                {children}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <span className="text-[11px]">
              {deniedMessage ??
                `Sem permissão para esta ação (${permission}). Contacte o administrador.`}
            </span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  },
);
