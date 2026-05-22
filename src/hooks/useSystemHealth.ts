/**
 * useSystemHealth — subscribe to the live SystemHealth snapshot.
 */
import { useEffect, useState } from "react";
import { SystemHealthEngine, type SystemHealth } from "@/agents/observability";

const INITIAL: SystemHealth = {
  score: 100,
  grade: "green",
  components: [],
  reasons: [],
  generatedAt: Date.now(),
};

export function useSystemHealth(): SystemHealth {
  const [h, setH] = useState<SystemHealth>(() => {
    SystemHealthEngine.start();
    return SystemHealthEngine.current() ?? INITIAL;
  });
  useEffect(() => {
    SystemHealthEngine.start();
    return SystemHealthEngine.subscribe(setH);
  }, []);
  return h;
}

export default useSystemHealth;
