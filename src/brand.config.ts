import logo from "@/assets/brand-logo.svg";

/**
 * Single source of truth for application branding.
 * Synchronous import — no fetch, no state, no async.
 */
export const brandConfig = {
  appName: "QWork Nexus",
  shortName: "QWork",
  logo,
} as const;
