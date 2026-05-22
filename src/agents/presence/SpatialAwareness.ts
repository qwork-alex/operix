/**
 * SpatialAwareness — builds a live map of the viewport identifying:
 *   - forbidden zones (tables, modals, inputs, focused cards)
 *   - preferred zones (empty/neutral whitespace)
 *
 * Selector-driven, cheap, runs on demand from MovementOrchestrator.
 */
import type { SpatialMap, ZoneRect, PresencePosition } from "./types";

const FORBIDDEN_SELECTORS: Array<{ sel: string; weight: number; reason: string }> = [
  { sel: "table", weight: 100, reason: "table" },
  { sel: "[role='dialog']", weight: 200, reason: "modal" },
  { sel: "[data-radix-popper-content-wrapper]", weight: 180, reason: "popover" },
  { sel: "input:focus, textarea:focus, [contenteditable]:focus", weight: 220, reason: "input-focus" },
  { sel: "input, textarea, select", weight: 60, reason: "input" },
  { sel: "[data-agent-focus]", weight: 140, reason: "critical-card" },
  { sel: "header, nav, aside, [data-sidebar]", weight: 120, reason: "chrome" },
  { sel: ".surface-card, .surface-elevated", weight: 40, reason: "card" },
];

const AGENT_SIZE = 72; // px – diameter of presence overlay
const MARGIN = 16;

export function buildSpatialMap(): SpatialMap {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const forbidden: ZoneRect[] = [];

  for (const { sel, weight, reason } of FORBIDDEN_SELECTORS) {
    let nodes: NodeListOf<Element>;
    try {
      nodes = document.querySelectorAll(sel);
    } catch {
      continue;
    }
    nodes.forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return;
      forbidden.push({
        x: Math.max(0, r.left - MARGIN),
        y: Math.max(0, r.top - MARGIN),
        w: Math.min(vw, r.width + MARGIN * 2),
        h: Math.min(vh, r.height + MARGIN * 2),
        weight,
        reason,
      });
    });
  }

  // Preferred = corners + edges with empty space
  const preferred: ZoneRect[] = [
    { x: vw - 220, y: vh - 220, w: 200, h: 200, weight: 10, reason: "bottom-right" },
    { x: vw - 220, y: 80, w: 200, h: 200, weight: 8, reason: "top-right" },
    { x: 40, y: vh - 220, w: 200, h: 200, weight: 6, reason: "bottom-left" },
  ];

  return { viewportW: vw, viewportH: vh, forbidden, preferred, generatedAt: Date.now() };
}

/** Score a candidate position — lower is better. */
export function scorePosition(p: PresencePosition, map: SpatialMap): number {
  const r = { x: p.x, y: p.y, w: AGENT_SIZE, h: AGENT_SIZE };
  let score = 0;
  for (const z of map.forbidden) {
    if (rectOverlap(r, z)) score += z.weight;
  }
  // bonus for being near a preferred zone
  for (const z of map.preferred) {
    if (rectOverlap(r, z)) score -= z.weight;
  }
  // Penalty for being too close to edges (offscreen risk)
  if (p.x < 8 || p.y < 8 || p.x + AGENT_SIZE > map.viewportW - 8 || p.y + AGENT_SIZE > map.viewportH - 8) {
    score += 500;
  }
  return score;
}

function rectOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

/** Find a non-intrusive target position close to the current one. */
export function findSafePosition(current: PresencePosition, map: SpatialMap): PresencePosition {
  // Sample preferred anchors first, fall back to a small grid.
  const candidates: PresencePosition[] = map.preferred.map((z) => ({
    x: z.x + z.w / 2 - AGENT_SIZE / 2,
    y: z.y + z.h / 2 - AGENT_SIZE / 2,
  }));

  const step = 80;
  for (let x = 40; x < map.viewportW - AGENT_SIZE - 40; x += step) {
    for (let y = 80; y < map.viewportH - AGENT_SIZE - 40; y += step) {
      candidates.push({ x, y });
    }
  }

  let best = current;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const s = scorePosition(c, map);
    // Prefer staying close to current position (smooth movement)
    const dist = Math.hypot(c.x - current.x, c.y - current.y);
    const total = s + dist * 0.05;
    if (total < bestScore) {
      bestScore = total;
      best = c;
    }
  }
  return best;
}

export const AGENT_OVERLAY_SIZE = AGENT_SIZE;
