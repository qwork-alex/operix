/**
 * useVirtualEngineerBoot — mount once at app shell level (e.g. AppLayout)
 * so the engineer starts analysing as soon as AgentRuntime / RuntimeHealth
 * have data, even before any consumer subscribes.
 */
import { useEffect } from "react";
import { VirtualEngineer } from "@/lib/virtualEngineer";

export function useVirtualEngineerBoot(): void {
  useEffect(() => {
    VirtualEngineer.start();
    // Intentionally not stopping on unmount — singleton lives for the
    // session, mirroring AgentRuntime / OperationalEventBus lifecycle.
  }, []);
}

export default useVirtualEngineerBoot;
