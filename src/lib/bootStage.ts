/**
 * bootStage — central scheduler for deferred bootstrap of heavy subsystems.
 *
 * Goals (per Boot Audit directive):
 *  - Phase 1: auth + minimal UI only (NOTHING heavy runs).
 *  - Phase 2: workspace / permissions / profile (driven by app providers).
 *  - Phase 3: dashboards / metrics / realtime (driven by route data hooks).
 *  - Phase 4: AI / observability / automation / copilot / analytics
 *             (deferred to browser idle via THIS module).
 *
 * No new providers. No suspense. No retries. Pure scheduling + logging.
 *
 * SAFE_BOOT (?safe_boot=1 or VITE_SAFE_BOOT=true) disables every Phase-4
 * boot, leaving only auth + dashboard. Use to bisect freeze sources.
 */

const PHASE_LOG = (name: string, detail?: string) => {
  // Single consistent prefix so the user can grep `[BOOT]` in the console.
  // eslint-disable-next-line no-console
  console.log(`[BOOT] ${name}${detail ? ` — ${detail}` : ""}`);
};

export function isSafeBoot(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("safe_boot") === "1") return true;
  } catch { /* noop */ }
  try {
    return (import.meta as any)?.env?.VITE_SAFE_BOOT === "true";
  } catch {
    return false;
  }
}

export type BootPhase = "phase-3" | "phase-4";

interface ScheduleOpts {
  /** Extra ms delay before idle window opens. Default 1200 (Phase 4). */
  delayMs?: number;
  /** requestIdleCallback timeout. Default 4000. */
  idleTimeoutMs?: number;
  /** If true, runs even when SAFE_BOOT is on. */
  bypassSafeBoot?: boolean;
  phase?: BootPhase;
}

/**
 * Schedule a heavy boot to run AFTER the dashboard has had time to paint.
 * Returns a cancel function for React effect cleanup.
 */
export function scheduleDeferredBoot(
  name: string,
  start: () => void | (() => void),
  opts: ScheduleOpts = {},
): () => void {
  const { delayMs = 1200, idleTimeoutMs = 4000, bypassSafeBoot = false, phase = "phase-4" } = opts;

  if (!bypassSafeBoot && isSafeBoot()) {
    PHASE_LOG(name, `skipped (SAFE_BOOT, ${phase})`);
    return () => {};
  }

  let cancelled = false;
  let dispose: void | (() => void);

  const fire = () => {
    if (cancelled) return;
    PHASE_LOG(name, `starting (${phase})`);
    try {
      dispose = start();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[BOOT] ${name} threw during start — isolated`, err);
    }
  };

  const t = setTimeout(() => {
    if (cancelled) return;
    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    if (ric) ric(fire, { timeout: idleTimeoutMs });
    else setTimeout(fire, 200);
  }, delayMs);

  return () => {
    cancelled = true;
    clearTimeout(t);
    if (typeof dispose === "function") {
      try { dispose(); } catch { /* noop */ }
    }
  };
}

export const bootStage = {
  log: PHASE_LOG,
  isSafeBoot,
  schedule: scheduleDeferredBoot,
};

export default bootStage;
