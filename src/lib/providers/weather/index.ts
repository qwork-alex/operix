/**
 * Weather domain — registers built-in providers on import.
 * Consumers do: `import "@/lib/providers/weather";` once at bootstrap,
 * then resolve via the generic registry.
 */
import { registerProvider } from "../registry";
import { MeteoAlarmProvider } from "./MeteoAlarmProvider";
import { NOAAProvider } from "./NOAAProvider";

registerProvider("weather", MeteoAlarmProvider);
registerProvider("weather", NOAAProvider);

export * from "./types";
export { MeteoAlarmProvider, NOAAProvider };
