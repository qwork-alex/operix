import { useEffect, useState } from "react";
import { agentBus, type AgentEvent } from "@/lib/agentEventBus";
import { loadPersistedAgentEvents } from "@/lib/operationalObserver";

export type TimelineKind = "error" | "warn" | "info" | "success" | "user" | "reconnect";

export interface TimelineEntry {
  id: string;
  at: number;
  kind: TimelineKind;
  title: string;
  detail?: string;
}

function classify(e: AgentEvent): TimelineKind {
  if (e.kind === "user_message") return "user";
  if (e.title?.toLowerCase().includes("reconect")) return "reconnect";
  if (e.level === "error") return "error";
  if (e.level === "warn") return "warn";
  if (e.level === "success") return "success";
  return "info";
}

/**
 * Local operational timeline (memory + last persisted errors).
 * Drains agentBus once on mount and listens for new entries.
 */
export function useOperationalTimeline(limit = 40) {
  const [entries, setEntries] = useState<TimelineEntry[]>(() => {
    const seed: AgentEvent[] = [
      ...loadPersistedAgentEvents(),
      ...agentBus.snapshot(),
    ];
    const seen = new Set<string>();
    return seed
      .filter((e) => !e.meta?.silent)
      .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
      .map((e) => ({ id: e.id, at: e.at, kind: classify(e), title: e.title, detail: e.detail }))
      .slice(-limit);
  });

  useEffect(() => {
    return agentBus.subscribe((e) => {
      if (e.meta?.silent) return;
      setEntries((prev) => {
        const next = [...prev, { id: e.id, at: e.at, kind: classify(e), title: e.title, detail: e.detail }];
        return next.length > limit ? next.slice(-limit) : next;
      });
    });
  }, [limit]);

  return entries;
}
