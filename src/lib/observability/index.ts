/**
 * Observability entry — boot the monitor and re-export the public API.
 * Import once at app bootstrap: `import "@/lib/observability";`
 */
import { start } from "./RuntimeHealthMonitor";

start();

export * from "./types";
export {
  RuntimeHealthMonitor, getSnapshot, subscribe,
  recordProviderLatency, recordIngestion,
  recordEdgeFailure, recordJobFailure, recordRealtimeEvent,
} from "./RuntimeHealthMonitor";
