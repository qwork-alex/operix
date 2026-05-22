/**
 * useOperationalCopilotBoot — lightweight bootstrap.
 *
 * Mounted once at the AppLayout level. Loads the Copilot snapshot in the
 * background so any downstream surface that calls `useOperationalCopilot()`
 * lands on warm cache instead of a cold fetch. No UI is rendered.
 */
import { useOperationalCopilot } from "./useOperationalCopilot";

export function useOperationalCopilotBoot() {
  // Snapshot computation runs in TanStack Query; result is cached and
  // periodically refreshed. We don't read the value here.
  useOperationalCopilot({ enabled: true });
}
