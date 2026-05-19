/**
 * QW Nexus Proprietary Enterprise Platform
 *
 * System Architecture and Product Direction:
 *   Alex Souza
 *
 * Proprietary metadata — single source of truth for institutional
 * identity, ownership and authorship signatures across the app.
 * Imported synchronously; no fetch, no state, no side effects.
 */
export const SYSTEM_METADATA = {
  system_name: "QW Nexus",
  system_owner: "Alex Souza",
  system_architect: "Alex Souza",
  intellectual_property: "QW Nexus Proprietary System",
  proprietary_notice: "All rights reserved",
  trademark: "QW Nexus™",
  year: 2026,
  attribution: "Criado, idealizado e arquitetado por Alex Souza",
  description:
    "Plataforma proprietária de gestão empresarial, financeira e operacional.",
  // Reserved for future governance / audit signatures.
  governance: {
    ownership: "Alex Souza",
    audit_ready: true,
    signature_version: "1.0.0",
  },
} as const;

export type SystemMetadata = typeof SYSTEM_METADATA;
