/**
 * useOperationalCopilotBoot — DEFERRED bootstrap.
 *
 * The Copilot snapshot includes the Demand Engine (forecastDemand) and pulls
 * 7 tables of historical data. To prevent it from blocking the AppShell /
 * session hydration, we defer enablement until the browser is idle AND the
 * dashboard has had a chance to paint. Failures here NEVER block the app.
 */
import { useEffect, useState } from "react";
import { useOperationalCopilot } from "./useOperationalCopilot";

export function useOperationalCopilotBoot() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const arm = () => {
      if (!cancelled) setReady(true);
    };
    const t = setTimeout(() => {
      const ric = (window as any).requestIdleCallback as
        | ((cb: () => void, opts?: { timeout: number }) => number)
        | undefined;
      if (ric) ric(arm, { timeout: 4000 });
      else setTimeout(arm, 1500);
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  // Hook mounts unconditionally (rules-of-hooks); the query activates
  // only after `ready` flips. Any error stays contained in TanStack Query.
  useOperationalCopilot({ enabled: ready });
}
