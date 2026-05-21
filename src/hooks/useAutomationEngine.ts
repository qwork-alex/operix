import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "sonner";

export interface AutomationRule {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: any;
  conditions: any[];
  actions: any[];
  delay_seconds: number;
  max_retries: number;
  retry_backoff_seconds: number;
  enabled: boolean;
  safe_mode: boolean;
  created_at: string;
  updated_at: string;
}

export interface AutomationExecution {
  id: string;
  workspace_id: string;
  rule_id: string | null;
  queue_id: string | null;
  started_at: string;
  finished_at: string | null;
  status: "success" | "failed" | "skipped" | "dry_run";
  attempt: number;
  actions_log: any[];
  error: string | null;
  dry_run: boolean;
  created_at: string;
}

export interface AutomationDeadLetter {
  id: string;
  workspace_id: string;
  queue_id: string | null;
  rule_id: string | null;
  last_error: string | null;
  attempts: number;
  payload: any;
  event_type: string | null;
  created_at: string;
}

const RULES_KEY = (ws: string | null) => ["automation-rules", ws];
const EXECS_KEY = (ws: string | null) => ["automation-executions", ws];
const DEAD_KEY = (ws: string | null) => ["automation-dead-letter", ws];
const STATS_KEY = (ws: string | null) => ["automation-stats", ws];

export function useAutomationRules() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: RULES_KEY(workspaceId),
    enabled: !!workspaceId,
    queryFn: async (): Promise<AutomationRule[]> => {
      const { data, error } = await (supabase as any)
        .from("automation_rules").select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (r: Partial<AutomationRule> & { id?: string }) => {
      if (!workspaceId) throw new Error("Workspace não disponível");
      const payload = {
        workspace_id: workspaceId,
        name: r.name ?? "Nova automação",
        description: r.description ?? null,
        trigger_type: r.trigger_type ?? "service_order.created",
        trigger_config: r.trigger_config ?? {},
        conditions: r.conditions ?? [],
        actions: r.actions ?? [],
        delay_seconds: r.delay_seconds ?? 0,
        max_retries: r.max_retries ?? 3,
        retry_backoff_seconds: r.retry_backoff_seconds ?? 30,
        enabled: r.enabled ?? true,
        safe_mode: r.safe_mode ?? false,
      };
      if (r.id) {
        const { error } = await (supabase as any).from("automation_rules").update(payload).eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("automation_rules").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Automação guardada"); qc.invalidateQueries({ queryKey: RULES_KEY(workspaceId) }); },
    onError: (e: any) => toast.error(e?.message || "Falha ao guardar"),
  });

  const toggle = useMutation({
    mutationFn: async (vars: { id: string; enabled: boolean }) => {
      const { error } = await (supabase as any).from("automation_rules")
        .update({ enabled: vars.enabled }).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RULES_KEY(workspaceId) }),
    onError: (e: any) => toast.error(e?.message || "Falha ao alternar"),
  });

  const duplicate = useMutation({
    mutationFn: async (rule: AutomationRule) => {
      const { id, created_at, updated_at, workspace_id, ...rest } = rule;
      const { error } = await (supabase as any).from("automation_rules").insert({
        ...rest, workspace_id: workspaceId!, name: `${rule.name} (cópia)`, enabled: false,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Regra duplicada"); qc.invalidateQueries({ queryKey: RULES_KEY(workspaceId) }); },
    onError: (e: any) => toast.error(e?.message || "Falha ao duplicar"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("automation_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Regra eliminada"); qc.invalidateQueries({ queryKey: RULES_KEY(workspaceId) }); },
    onError: (e: any) => toast.error(e?.message || "Falha ao eliminar"),
  });

  const importJson = useMutation({
    mutationFn: async (rules: Partial<AutomationRule>[]) => {
      if (!workspaceId) throw new Error("Workspace não disponível");
      const sanitized = rules.map((r) => ({
        workspace_id: workspaceId,
        name: r.name ?? "Importada",
        description: r.description ?? null,
        trigger_type: r.trigger_type ?? "service_order.created",
        trigger_config: r.trigger_config ?? {},
        conditions: r.conditions ?? [],
        actions: r.actions ?? [],
        delay_seconds: r.delay_seconds ?? 0,
        max_retries: r.max_retries ?? 3,
        retry_backoff_seconds: r.retry_backoff_seconds ?? 30,
        enabled: false,
        safe_mode: true,
      }));
      const { error } = await (supabase as any).from("automation_rules").insert(sanitized);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Regras importadas (desativadas em modo seguro)"); qc.invalidateQueries({ queryKey: RULES_KEY(workspaceId) }); },
    onError: (e: any) => toast.error(e?.message || "Falha ao importar"),
  });

  return { ...list, save, toggle, duplicate, remove, importJson };
}

export function useAutomationExecutions(limit = 100) {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: [...EXECS_KEY(workspaceId), limit],
    enabled: !!workspaceId,
    refetchInterval: 30_000,
    queryFn: async (): Promise<AutomationExecution[]> => {
      const { data, error } = await (supabase as any)
        .from("automation_executions").select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAutomationDeadLetter() {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: DEAD_KEY(workspaceId),
    enabled: !!workspaceId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AutomationDeadLetter[]> => {
      const { data, error } = await (supabase as any)
        .from("automation_dead_letter").select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAutomationStats() {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: STATS_KEY(workspaceId),
    enabled: !!workspaceId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const [execs, pending, dead] = await Promise.all([
        (supabase as any).from("automation_executions")
          .select("status", { count: "exact", head: false })
          .eq("workspace_id", workspaceId!).gte("created_at", since),
        (supabase as any).from("automation_queue")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!).in("status", ["pending", "failed"]),
        (supabase as any).from("automation_dead_letter")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!),
      ]);
      const rows = (execs.data ?? []) as { status: string }[];
      return {
        total24h: rows.length,
        success24h: rows.filter((r) => r.status === "success").length,
        failed24h: rows.filter((r) => r.status === "failed").length,
        dryRun24h: rows.filter((r) => r.status === "dry_run").length,
        pending: pending.count ?? 0,
        dead: dead.count ?? 0,
      };
    },
  });
}

export async function runAutomationEngineNow() {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-automation-engine`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ trigger: "manual" }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
