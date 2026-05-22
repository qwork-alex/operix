/**
 * Provider registry — single import surface.
 * Importing this file registers all built-in providers (currently weather
 * domain: MeteoAlarm + NOAA). Other domains expose only types until a
 * concrete adapter is added.
 */
import "./weather";

export * from "./registry";
export type * from "./weather/types";
export type * from "./map/types";
export type * from "./ai/types";
export type * from "./geocoding/types";
export type * from "./telemetry/types";
