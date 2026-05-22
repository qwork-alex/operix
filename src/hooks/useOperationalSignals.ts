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

  // ── Operational Intelligence ────────────────────────────────────────
  // Lightweight, low-frequency probes. All bounded, all read-only, all
  // silent until they hit a threshold. Never spammy: each insight gets at
  // most one row in `signals` and is announced at most once per session
  // by AgentPanel.

  const ACTIVE_STATUSES = ["pending", "draft", "open", "in_progress", "em_andamento", "aguardando", "aberto"];
  const PAID_STATUSES = ["pago", "paid", "settled", "liquidado"];

  // Stalled service orders — active SO not touched in > 18h
  const { data: stalledSO } = useQuery({
    queryKey: ["op-intel-stalled-so", workspaceId],
    enabled: !!workspaceId,
    staleTime: 120_000,
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 18 * 3600_000).toISOString();
      const { data } = await supabase
        .from("service_orders")
        .select("id, updated_at, status", { count: "exact", head: false })
        .eq("workspace_id", workspaceId!)
        .is("deleted_at", null)
        .lt("updated_at", cutoff)
        .in("status", ACTIVE_STATUSES)
        .order("updated_at", { ascending: true })
        .limit(5);
      return data ?? [];
    },
  });

  // Production volume — today vs yesterday SO count
  const { data: prodTrend } = useQuery({
    queryKey: ["op-intel-prod-trend", workspaceId],
    enabled: !!workspaceId,
    staleTime: 300_000,
    queryFn: async () => {
      const now = Date.now();
      const startToday = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      const startYesterday = new Date(now - 24 * 3600_000);
      startYesterday.setHours(0, 0, 0, 0);
      const startY = startYesterday.toISOString();
      const [{ count: today }, { count: yesterday }] = await Promise.all([
        supabase.from("service_orders").select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!).is("deleted_at", null).gte("created_at", startToday),
        supabase.from("service_orders").select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!).is("deleted_at", null).gte("created_at", startY).lt("created_at", startToday),
      ]);
      return { today: today ?? 0, yesterday: yesterday ?? 0 };
    },
  });

  // Overdue payments — unpaid PO older than 30 days
  const { data: overduePO } = useQuery({
    queryKey: ["op-intel-overdue-po", workspaceId],
    enabled: !!workspaceId,
    staleTime: 300_000,
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
      const { count } = await supabase
        .from("payment_orders")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId!)
        .is("deleted_at", null)
        .lt("created_at", cutoff)
        .not("status", "in", `(${PAID_STATUSES.map((s) => `"${s}"`).join(",")})`);
      return count ?? 0;
    },
  });

  // Inactive technicians — members(role=tecnico) with no SO in 14d
  const { data: inactiveTechs } = useQuery({
    queryKey: ["op-intel-inactive-techs", workspaceId],
    enabled: !!workspaceId,
    staleTime: 600_000,
    queryFn: async () => {
      const [{ data: techs }, { data: recentSO }] = await Promise.all([
        supabase.from("memberships")
          .select("user_id")
          .eq("workspace_id", workspaceId!).eq("role", "tecnico").eq("status", "active"),
        supabase.from("service_orders")
          .select("technician_id")
          .eq("workspace_id", workspaceId!).is("deleted_at", null)
          .gte("created_at", new Date(Date.now() - 14 * 24 * 3600_000).toISOString()),
      ]);
      const active = new Set((recentSO ?? []).map((r: any) => r.technician_id).filter(Boolean));
      const total = (techs ?? []).length;
      const inactive = (techs ?? []).filter((t: any) => !active.has(t.user_id)).length;
      return { total, inactive };
    },
  });

  // Inactive workspace — zero SO created in last 7d (but workspace has techs)
  const { data: workspaceActivity } = useQuery({
    queryKey: ["op-intel-ws-activity", workspaceId],
    enabled: !!workspaceId,
    staleTime: 600_000,
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const { count } = await supabase.from("service_orders")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId!).is("deleted_at", null)
        .gte("created_at", cutoff);
      return count ?? 0;
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
          title: "Ingestão em tempo real parece atrasada",
          detail: `Último evento de radar há ${Math.round(ageH)}h`,
        });
      }
    } else {
      out.push({
        id: "radar-empty",
        level: "info",
        title: "Radar PDR sem dados",
        detail: "Sem eventos ingeridos ainda",
      });
    }

    // Stalled service orders
    if (stalledSO && stalledSO.length) {
      const oldest = stalledSO[0];
      const hours = Math.round((Date.now() - new Date(oldest.updated_at as string).getTime()) / 36e5);
      out.push({
        id: "so-stalled",
        level: "info",
        title: stalledSO.length === 1
          ? `Esta ordem de serviço está inativa há ${hours}h`
          : `${stalledSO.length} ordens de serviço inativas`,
        detail: stalledSO.length > 1 ? `A mais antiga há ${hours}h sem atualização` : undefined,
      });
    }

    // Production drop — needs meaningful yesterday baseline
    if (prodTrend && prodTrend.yesterday >= 3 && prodTrend.today < prodTrend.yesterday * 0.5) {
      const pct = Math.round((1 - prodTrend.today / prodTrend.yesterday) * 100);
      out.push({
        id: "production-drop",
        level: "info",
        title: "Volume de produção em queda",
        detail: `Hoje ${prodTrend.today} vs ontem ${prodTrend.yesterday} (-${pct}%)`,
      });
    }

    // Overdue payments
    if (overduePO && overduePO > 0) {
      out.push({
        id: "payments-overdue",
        level: "warn",
        title: `${overduePO} pagamento(s) em atraso há mais de 30 dias`,
      });
    }

    // Inactive technicians
    if (inactiveTechs && inactiveTechs.total >= 3 && inactiveTechs.inactive > 0) {
      out.push({
        id: "techs-inactive",
        level: "info",
        title: `${inactiveTechs.inactive} de ${inactiveTechs.total} técnicos sem atividade recente`,
        detail: "Sem ordens de serviço nos últimos 14 dias",
      });
    }

    // Inactive workspace
    if (workspaceActivity === 0 && (inactiveTechs?.total ?? 0) > 0) {
      out.push({
        id: "workspace-idle",
        level: "info",
        title: "Workspace sem nova atividade esta semana",
        detail: "Zero ordens criadas nos últimos 7 dias",
      });
    }

    // Recent runtime errors (last 5 min)
    const cutoff = Date.now() - 5 * 60_000;
    const errs = recent.filter((e) => e.level === "error" && e.at > cutoff);
    if (errs.length >= 3) {
      out.push({
        id: "alert-spike",
        level: "error",
        title: `Pico de alertas — ${errs.length} erros recentes`,
        detail: errs[errs.length - 1].title,
      });
    } else if (errs.length) {
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
  }, [platforms, lastHail, recent, stalledSO, prodTrend, overduePO, inactiveTechs, workspaceActivity]);

  const worst: SignalLevel = signals.some((s) => s.level === "error")
    ? "error"
    : signals.some((s) => s.level === "warn")
      ? "warn"
      : signals.some((s) => s.level === "info" && s.id !== "all-ok")
        ? "info"
        : "ok";

  return { signals, worst, recent };
}
