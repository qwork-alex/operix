/**
 * VirtualEngineer boot — Phase 4, idle-deferred, SAFE_BOOT aware.
 */
import { useEffect } from "react";
import { VirtualEngineer } from "@/lib/virtualEngineer";
import { scheduleDeferredBoot } from "@/lib/bootStage";

export function useVirtualEngineerBoot(): void {
  useEffect(() => {
    return scheduleDeferredBoot("VirtualEngineer", () => {
      VirtualEngineer.start();
    }, { delayMs: 1800 });
  }, []);
}

export default useVirtualEngineerBoot;
