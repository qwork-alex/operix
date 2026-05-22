import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { agentBus, type AgentEvent } from "@/lib/agentEventBus";
import "@/lib/operationalObserver"; // ensure singleton observer is started

export type SignalLevel = "ok" | "info" | "warn" | "error";

export interface OperationalSignal {
  id: string;
  level: SignalLevel;
  title: string;
  detail?: string;
}

/**
 * Reads centralized operational signals derived from:
 *  - platforms table (degraded / no heartbeat)
 *  - hail_events freshness (radar ingest age)
 *  - recent agentBus events (runtime errors, network failures)
 *
 * No polling — relies on React Query staleTime + agentBus ticks.
 */
export function useOperationalSignals() {
  const { workspaceId } = useWorkspace();
  const [recent, setRecent] = useState<AgentEvent[]>(() =>
    agentBus.snapshot().slice(-30),
  );

  useEffect(() => {
    const unsub = agentBus.subscribe((e) => {
      setRecent((prev) => {
        const next = [...prev, e];
        return next.length > 30 ? next.slice(-30) : next;
      });
    });
    return unsub;
  }, []);

  const { data: platforms } = useQuery({
    queryKey: ["op-signals-platforms", workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("platforms")
        .select("name,state,last_heartbeat_at")
        .eq("workspace_id", workspaceId!);
      return data ?? [];
    },
  });

  const { data: lastHail } = useQuery({
    queryKey: ["op-signals-last-hail"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("hail_events")
        .select("observed_time,forecast_time")
        .order("observed_time", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const signals = useMemo<OperationalSignal[]>(() => {
    const out: OperationalSignal[] = [];

    // Platforms degraded
    const degraded = (platforms ?? []).filter((p: any) => p.state === "degraded");
    if (degraded.length) {
      out.push({
        id: "platforms-degraded",
        level: "warn",
        title: `${degraded.length} plataforma(s) degradada(s)`,
        detail: degraded.map((p: any) => p.name).join(", "),
      });
    }

    // Radar PDR freshness
    const lastTs = lastHail?.observed_time || lastHail?.forecast_time;
    if (lastTs) {
      const ageH = (Date.now() - new Date(lastTs).getTime()) / 36e5;
      if (ageH > 4) {
        out.push({
          id: "radar-stale",
          level: "warn",
          title: "Radar PDR sem eventos recentes",
          detail: `Último evento há ${Math.round(ageH)}h`,
        });
      }
    } else {
      out.push({
        id: "radar-empty",
        level: "info",
        title: "Radar PDR vazio",
        detail: "Sem eventos ingeridos ainda",
      });
    }

    // Recent runtime errors (last 5 min)
    const cutoff = Date.now() - 5 * 60_000;
    const errs = recent.filter((e) => e.level === "error" && e.at > cutoff);
    if (errs.length) {
      out.push({
        id: "runtime-errors",
        level: "error",
        title: `${errs.length} erro(s) recente(s)`,
        detail: errs[errs.length - 1].title,
      });
    }

    if (!out.length) {
      out.push({
        id: "all-ok",
        level: "ok",
        title: "Sistema operacional estável",
      });
    }
    return out;
  }, [platforms, lastHail, recent]);

  const worst: SignalLevel = signals.some((s) => s.level === "error")
    ? "error"
    : signals.some((s) => s.level === "warn")
      ? "warn"
      : signals.some((s) => s.level === "info" && s.id !== "all-ok")
        ? "info"
        : "ok";

  return { signals, worst, recent };
}
