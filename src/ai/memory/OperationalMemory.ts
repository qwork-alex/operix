/**
 * OperationalMemory — lightweight, observation-only memory for the AI assistant.
 *
 * Records, per workspace:
 *   - recent operational signals/alerts (with first/last seen, occurrence count)
 *   - recently visited modules (route → last visited + visit count)
 *   - repeated user actions (action key → count within a sliding window)
 *   - recurring operational anomalies (signal id seen N+ times across sessions)
 *
 * Pure observation. No emotions, no personality. The assistant uses this to
 * surface contextual hints like:
 *   "You checked this stalled order earlier."
 *   "This workspace had repeated ingestion interruptions."
 *
 * Persisted to sessionStorage scoped by workspace, with a small localStorage
 * tail for cross-session recurrence detection. Bounded to keep memory small.
 */
export type MemoryLevel = "info" | "warn" | "error";

export interface SignalMemoryEntry {
  id: string;
  level: MemoryLevel;
  title: string;
  firstSeen: number;
  lastSeen: number;
  occurrences: number;
}

export interface ModuleMemoryEntry {
  path: string;
  label?: string;
  visits: number;
  lastVisit: number;
}

export interface ActionMemoryEntry {
  key: string;
  count: number;
  lastAt: number;
}

export interface OperationalMemorySnapshot {
  workspaceId: string | null;
  signals: SignalMemoryEntry[];
  modules: ModuleMemoryEntry[];
  actions: ActionMemoryEntry[];
  recurringSignals: SignalMemoryEntry[]; // occurrences >= 3 (cross-session)
}

type Listener = (snap: OperationalMemorySnapshot) => void;

const MAX_SIGNALS = 40;
const MAX_MODULES = 20;
const MAX_ACTIONS = 30;
const ACTION_WINDOW_MS = 10 * 60_000; // 10 minutes
const RECURRENCE_THRESHOLD = 3;

const SESSION_KEY = (ws: string) => `ai.opmem.session.${ws}`;
const PERSIST_KEY = (ws: string) => `ai.opmem.persist.${ws}`;

class OperationalMemoryStore {
  private workspaceId: string | null = null;
  private signals = new Map<string, SignalMemoryEntry>();
  private modules = new Map<string, ModuleMemoryEntry>();
  private actions = new Map<string, ActionMemoryEntry>();
  private persistedSignals = new Map<string, SignalMemoryEntry>(); // cross-session
  private listeners = new Set<Listener>();

  setWorkspace(id: string | null) {
    if (this.workspaceId === id) return;
    this.workspaceId = id;
    this.signals.clear();
    this.modules.clear();
    this.actions.clear();
    this.persistedSignals.clear();
    if (id) {
      this.hydrate(id);
    }
    this.emit();
  }

  recordSignal(input: { id: string; level: MemoryLevel; title: string }) {
    if (!input?.id) return;
    const now = Date.now();
    const existing = this.signals.get(input.id);
    if (existing) {
      existing.lastSeen = now;
      existing.occurrences += 1;
      existing.level = input.level;
      existing.title = input.title;
    } else {
      this.signals.set(input.id, {
        id: input.id,
        level: input.level,
        title: input.title,
        firstSeen: now,
        lastSeen: now,
        occurrences: 1,
      });
      this.trim(this.signals, MAX_SIGNALS);
    }
    // Cross-session persisted tally
    const p = this.persistedSignals.get(input.id);
    if (p) {
      p.lastSeen = now;
      p.occurrences += 1;
      p.level = input.level;
      p.title = input.title;
    } else {
      this.persistedSignals.set(input.id, {
        id: input.id,
        level: input.level,
        title: input.title,
        firstSeen: now,
        lastSeen: now,
        occurrences: 1,
      });
      this.trim(this.persistedSignals, MAX_SIGNALS);
    }
    this.persist();
    this.emit();
  }

  recordModule(path: string, label?: string) {
    if (!path) return;
    const now = Date.now();
    const existing = this.modules.get(path);
    if (existing) {
      existing.visits += 1;
      existing.lastVisit = now;
      if (label) existing.label = label;
    } else {
      this.modules.set(path, { path, label, visits: 1, lastVisit: now });
      this.trim(this.modules, MAX_MODULES);
    }
    this.persist();
    this.emit();
  }

  recordAction(key: string) {
    if (!key) return;
    const now = Date.now();
    // Decay stale actions outside the window
    for (const [k, v] of this.actions) {
      if (now - v.lastAt > ACTION_WINDOW_MS) this.actions.delete(k);
    }
    const existing = this.actions.get(key);
    if (existing) {
      existing.count += 1;
      existing.lastAt = now;
    } else {
      this.actions.set(key, { key, count: 1, lastAt: now });
      this.trim(this.actions, MAX_ACTIONS);
    }
    this.persist();
    this.emit();
  }

  /** Did the user observe this signal before in this session? */
  hasSeenSignal(id: string): SignalMemoryEntry | null {
    return this.signals.get(id) ?? null;
  }

  /** Has this signal recurred across sessions (≥ RECURRENCE_THRESHOLD)? */
  isRecurring(id: string): boolean {
    const p = this.persistedSignals.get(id);
    return !!p && p.occurrences >= RECURRENCE_THRESHOLD;
  }

  /** Is this action being repeated within the sliding window? */
  isRepeating(key: string, threshold = 3): boolean {
    const a = this.actions.get(key);
    return !!a && a.count >= threshold;
  }

  snapshot(): OperationalMemorySnapshot {
    return {
      workspaceId: this.workspaceId,
      signals: [...this.signals.values()].sort((a, b) => b.lastSeen - a.lastSeen),
      modules: [...this.modules.values()].sort((a, b) => b.lastVisit - a.lastVisit),
      actions: [...this.actions.values()].sort((a, b) => b.lastAt - a.lastAt),
      recurringSignals: [...this.persistedSignals.values()]
        .filter((s) => s.occurrences >= RECURRENCE_THRESHOLD)
        .sort((a, b) => b.occurrences - a.occurrences),
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    try { fn(this.snapshot()); } catch { /* noop */ }
    return () => { this.listeners.delete(fn); };
  }

  // ── internals ──────────────────────────────────────────────────────
  private trim<T>(map: Map<string, T>, max: number) {
    if (map.size <= max) return;
    const overflow = map.size - max;
    let i = 0;
    for (const k of map.keys()) {
      if (i++ >= overflow) break;
      map.delete(k);
    }
  }

  private emit() {
    const snap = this.snapshot();
    this.listeners.forEach((l) => { try { l(snap); } catch { /* noop */ } });
  }

  private hydrate(ws: string) {
    if (typeof window === "undefined") return;
    try {
      const s = window.sessionStorage.getItem(SESSION_KEY(ws));
      if (s) {
        const parsed = JSON.parse(s);
        (parsed.signals ?? []).forEach((e: SignalMemoryEntry) => this.signals.set(e.id, e));
        (parsed.modules ?? []).forEach((e: ModuleMemoryEntry) => this.modules.set(e.path, e));
        (parsed.actions ?? []).forEach((e: ActionMemoryEntry) => this.actions.set(e.key, e));
      }
    } catch { /* ignore */ }
    try {
      const p = window.localStorage.getItem(PERSIST_KEY(ws));
      if (p) {
        const parsed = JSON.parse(p);
        (parsed.signals ?? []).forEach((e: SignalMemoryEntry) => this.persistedSignals.set(e.id, e));
      }
    } catch { /* ignore */ }
  }

  private persist() {
    if (typeof window === "undefined" || !this.workspaceId) return;
    try {
      window.sessionStorage.setItem(
        SESSION_KEY(this.workspaceId),
        JSON.stringify({
          signals: [...this.signals.values()],
          modules: [...this.modules.values()],
          actions: [...this.actions.values()],
        }),
      );
    } catch { /* quota */ }
    try {
      window.localStorage.setItem(
        PERSIST_KEY(this.workspaceId),
        JSON.stringify({ signals: [...this.persistedSignals.values()] }),
      );
    } catch { /* quota */ }
  }
}

export const operationalMemory = new OperationalMemoryStore();

/** Build a single contextual hint sentence from current memory, or null. */
export function deriveContextualHint(
  snap: OperationalMemorySnapshot,
  ctx: { path?: string; signalId?: string } = {},
): string | null {
  if (ctx.signalId) {
    const s = snap.signals.find((x) => x.id === ctx.signalId);
    const r = snap.recurringSignals.find((x) => x.id === ctx.signalId);
    if (r && r.occurrences >= RECURRENCE_THRESHOLD) {
      return `This issue has recurred ${r.occurrences} times in this workspace.`;
    }
    if (s && s.occurrences > 1) {
      return `You checked this earlier — ${s.occurrences} occurrences so far.`;
    }
  }
  if (ctx.path) {
    const m = snap.modules.find((x) => x.path === ctx.path);
    if (m && m.visits >= 3) {
      return `You've returned to this module ${m.visits} times recently.`;
    }
  }
  const topRecurring = snap.recurringSignals[0];
  if (topRecurring) {
    return `Recurring: ${topRecurring.title} (${topRecurring.occurrences}× observed).`;
  }
  return null;
}
