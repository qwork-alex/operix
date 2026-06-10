/**
 * useContextualWorkspace — Contextual Action Engine
 *
 * Resolves which workspace a given action should be assigned to.
 *
 * Rules:
 *  - If only ONE of the user's workspaces grants access to the module →
 *    return it automatically (no selector).
 *  - If MULTIPLE workspaces grant access → require explicit selection.
 *  - Selection is remembered per-module for the current session only
 *    (sessionStorage), so the discreet selector disappears after confirm
 *    but does NOT persist across tabs/sessions.
 *
 * Non-breaking: this hook is opt-in. Existing code keeps using
 * useWorkspace().workspaceId. New action flows (uploads, OP creation,
 * invoices, trips, etc.) can call this hook to enforce the rule.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "./useWorkspace";
import { useWorkspaceModules } from "./useWorkspaceModules";

export interface EligibleWorkspace {
  id: string;
  name: string;
}

export interface ContextualWorkspaceResult {
  /** All workspaces the user has access to (active memberships). */
  allWorkspaces: EligibleWorkspace[];
  /** Workspaces that grant the requested module. */
  eligibleWorkspaces: EligibleWorkspace[];
  /** Resolved workspace id: auto when only one eligible, else session pick. */
  resolvedWorkspaceId: string | null;
  /** True when the user must pick a workspace before committing the action. */
  requireSelection: boolean;
  /** Persist the user's pick for this module in the current session. */
  selectWorkspace: (workspaceId: string) => void;
  /** Clear the session pick (e.g. after the action commits). */
  clearSelection: () => void;
  isLoading: boolean;
}

const sessionKey = (module: string) => `ctx_ws::${module}`;

export function useContextualWorkspace(module: string): ContextualWorkspaceResult {
  const { workspaceId: currentWs, availableWorkspaces, isLoading: workspaceLoading } = useWorkspace();
  const { canAccessModule, isLoading: modsLoading } = useWorkspaceModules();
  const workspaces = useMemo(
    () =>
      availableWorkspaces
        .filter((workspace) => workspace.membershipStatus === "active")
        .map((workspace) => ({ id: workspace.id, name: workspace.name })) as EligibleWorkspace[],
    [availableWorkspaces],
  );

  const eligibleWorkspaces = useMemo(
    () => workspaces.filter((w) => canAccessModule(w.id, module)),
    [workspaces, canAccessModule, module],
  );

  const [sessionPick, setSessionPick] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(sessionKey(module));
  });

  // If the session pick is no longer eligible, drop it.
  useEffect(() => {
    if (!sessionPick) return;
    if (!eligibleWorkspaces.some((w) => w.id === sessionPick)) {
      setSessionPick(null);
      sessionStorage.removeItem(sessionKey(module));
    }
  }, [sessionPick, eligibleWorkspaces, module]);

  const selectWorkspace = useCallback(
    (id: string) => {
      sessionStorage.setItem(sessionKey(module), id);
      setSessionPick(id);
    },
    [module],
  );

  const clearSelection = useCallback(() => {
    sessionStorage.removeItem(sessionKey(module));
    setSessionPick(null);
  }, [module]);

  let resolvedWorkspaceId: string | null = null;
  let requireSelection = false;

  if (eligibleWorkspaces.length === 1) {
    resolvedWorkspaceId = eligibleWorkspaces[0].id;
  } else if (eligibleWorkspaces.length > 1) {
    // Prefer explicit session pick, then current active workspace if it's eligible.
    if (sessionPick && eligibleWorkspaces.some((w) => w.id === sessionPick)) {
      resolvedWorkspaceId = sessionPick;
    } else if (currentWs && eligibleWorkspaces.some((w) => w.id === currentWs)) {
      // Current workspace is eligible — use it implicitly, but still ask
      // for an explicit confirmation on first action of the session.
      resolvedWorkspaceId = currentWs;
      requireSelection = !sessionPick;
    } else {
      requireSelection = true;
    }
  }

  return {
    allWorkspaces: workspaces,
    eligibleWorkspaces,
    resolvedWorkspaceId,
    requireSelection,
    selectWorkspace,
    clearSelection,
    isLoading: workspaceLoading || modsLoading,
  };
}
