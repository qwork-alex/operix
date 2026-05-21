// AI Orchestrator — central inference engine
// SAFE MODE: no tenancy/auth/RBAC mutations. Read-only context, workspace-scoped writes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPA_SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-3-flash-preview";

type TaskKind =
  | "interpret_os"
  | "suggest_assignment"
  | "detect_bottlenecks"
  | "predict_delay"
  | "fraud_score"
  | "productivity"
  | "costs"
  | "fuel"
  | "financial_behavior"
  | "score_technician"
  | "score_fleet"
  | "score_productivity"
  | "score_financial_risk";

interface Body {
  task: TaskKind;
  workspace_id: string;
  entity_id?: string;
  params?: Record<string, unknown>;
  force?: boolean;
  persist?: boolean;
}

async function sha256(str: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- Context gatherers (workspace-scoped, read-only) -----------------------
async function gatherContext(svc: any, task: TaskKind, workspace_id: string, entity_id?: string) {
  const ws = { workspace_id };
  switch (task) {
    case "interpret_os":
    case "suggest_assignment":
    case "predict_delay": {
      const [{ data: so }, { data: techs }] = await Promise.all([
        svc.from("service_orders").select("*").match({ ...ws, ...(entity_id ? { id: entity_id } : {}) }).limit(entity_id ? 1 : 25).order("created_at", { ascending: false }),
        svc.from("profiles").select("id,full_name,role").eq("workspace_id", workspace_id).limit(40),
      ]);
      return { service_orders: so ?? [], technicians: techs ?? [] };
    }
    case "detect_bottlenecks":
    case "productivity": {
      const { data } = await svc.from("service_orders").select("id,created_at,status,tecnico,placa,cliente,plataforma,grupo_id,valor").eq("workspace_id", workspace_id).order("created_at", { ascending: false }).limit(200);
      return { service_orders: data ?? [] };
    }
    case "costs":
    case "financial_behavior": {
      const [{ data: po }, { data: inv }] = await Promise.all([
        svc.from("payment_orders").select("id,created_at,status,valor_total,cliente,grupo_id").eq("workspace_id", workspace_id).order("created_at", { ascending: false }).limit(200),
        svc.from("invoices").select("id,created_at,status,amount,paid_at,due_at").eq("workspace_id", workspace_id).order("created_at", { ascending: false }).limit(100).maybeSingle().then(() => ({ data: [] })).catch(() => ({ data: [] })),
      ]);
      return { payment_orders: po ?? [], invoices: inv ?? [] };
    }
    case "fuel":
    case "score_fleet": {
      const { data } = await svc.from("fleet_fuel_logs").select("id,created_at,placa,litros,price_per_liter,valor_total,km").eq("workspace_id", workspace_id).order("created_at", { ascending: false }).limit(200);
      return { fuel_logs: data ?? [] };
    }
    case "fraud_score": {
      const [{ data: po }, { data: so }] = await Promise.all([
        svc.from("payment_orders").select("id,created_at,valor_total,cliente,grupo_id,status").eq("workspace_id", workspace_id).order("created_at", { ascending: false }).limit(150),
        svc.from("service_orders").select("id,created_at,valor,cliente,grupo_id,status").eq("workspace_id", workspace_id).order("created_at", { ascending: false }).limit(150),
      ]);
      return { payment_orders: po ?? [], service_orders: so ?? [] };
    }
    case "score_technician": {
      const { data: so } = await svc.from("service_orders").select("id,tecnico,status,created_at,valor,grupo_id").eq("workspace_id", workspace_id).order("created_at", { ascending: false }).limit(300);
      return { service_orders: so ?? [] };
    }
    case "score_productivity": {
      const { data } = await svc.from("service_orders").select("id,status,created_at,grupo_id").eq("workspace_id", workspace_id).order("created_at", { ascending: false }).limit(300);
      return { service_orders: data ?? [] };
    }
    case "score_financial_risk": {
      const { data } = await svc.from("payment_orders").select("id,status,created_at,valor_total,cliente").eq("workspace_id", workspace_id).order("created_at", { ascending: false }).limit(300);
      return { payment_orders: data ?? [] };
    }
    default:
      return {};
  }
}

// ---- Prompt + tool schema per task -----------------------------------------
function promptFor(task: TaskKind) {
  const base = `Você é o motor de IA operacional do QWork Nexus.
Trabalhe APENAS com os dados fornecidos (workspace isolado). NÃO invente entidades.
Toda saída DEVE ser via a tool 'emit_result' com campos explicáveis: reasoning, confidence (0-1), origem (quais dados usou).
Se não houver dados suficientes, retorne items vazios com explanation indicando o motivo.
Responda em português.`;
  const map: Record<TaskKind, string> = {
    interpret_os: "Interprete cada Ordem de Serviço, classifique tipo, urgência e risco. Liste insights ou riscos detectados.",
    suggest_assignment: "Para cada OS sem técnico ou com técnico sub-ótimo, sugira o técnico mais adequado com base no histórico (grupo_id, cliente, frequência).",
    detect_bottlenecks: "Detecte gargalos operacionais: técnicos sobrecarregados, status estagnados, clientes com atraso recorrente.",
    predict_delay: "Para OS recentes em aberto, estime probabilidade de atraso e justifique.",
    fraud_score: "Procure padrões suspeitos: valores fora do padrão, duplicidades, OPs sem OS correspondente, alterações rápidas de status.",
    productivity: "Calcule produtividade por técnico e por grupo nos últimos períodos.",
    costs: "Analise custos por cliente, plataforma e técnico. Aponte outliers.",
    fuel: "Analise consumo (€/L, L/100km estimado), eficiência por placa, anomalias de abastecimento.",
    financial_behavior: "Analise comportamento de pagamento: atrasos, ciclos, clientes problemáticos.",
    score_technician: "Atribua um score 0-100 a cada técnico com banda (excelente/bom/médio/baixo) e razões.",
    score_fleet: "Score 0-100 por placa com base em eficiência de combustível e disponibilidade.",
    score_productivity: "Score 0-100 global de produtividade da operação.",
    score_financial_risk: "Score 0-100 de risco financeiro do workspace.",
  };
  return `${base}\n\nTAREFA: ${map[task]}`;
}

const RESULT_TOOL = {
  type: "function",
  function: {
    name: "emit_result",
    description: "Emite o resultado estruturado e explicável.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
        confidence: { type: "number", description: "0 a 1" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", description: "recommendation | insight | alert | score" },
              title: { type: "string" },
              body: { type: "string" },
              entity_type: { type: "string" },
              entity_id: { type: "string" },
              severity: { type: "string", enum: ["info", "warn", "critical"] },
              score: { type: "number" },
              band: { type: "string" },
              metric: { type: "string" },
              subject_type: { type: "string" },
              subject_label: { type: "string" },
              reasoning: {
                type: "object",
                properties: {
                  why: { type: "string" },
                  origem: { type: "array", items: { type: "string" } },
                  contexto: { type: "string" },
                },
              },
              confidence: { type: "number" },
            },
            required: ["kind", "title"],
            additionalProperties: false,
          },
        },
        explanation: {
          type: "object",
          properties: {
            why: { type: "string" },
            origem: { type: "array", items: { type: "string" } },
            contexto: { type: "string" },
          },
        },
      },
      required: ["summary", "items", "confidence", "explanation"],
      additionalProperties: false,
    },
  },
};

// ---- AI Gateway call --------------------------------------------------------
async function callAI(system: string, userPayload: unknown) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload).slice(0, 60_000) },
      ],
      tools: [RESULT_TOOL],
      tool_choice: { type: "function", function: { name: "emit_result" } },
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI gateway ${res.status}: ${txt.slice(0, 300)}`);
  }
  const json = await res.json();
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  const args = call?.function?.arguments;
  if (!args) throw new Error("AI gateway returned no tool call");
  return {
    parsed: JSON.parse(args),
    usage: json.usage ?? {},
  };
}

// ---- Persistence (workspace-scoped) -----------------------------------------
async function persistItems(svc: any, task: TaskKind, workspace_id: string, model: string, parsed: any) {
  const reco: any[] = [], ins: any[] = [], alerts: any[] = [], scores: any[] = [];
  for (const it of parsed.items ?? []) {
    if (it.kind === "recommendation") {
      reco.push({
        workspace_id, model,
        category: task,
        entity_type: it.entity_type ?? null,
        entity_id: it.entity_id ?? null,
        title: it.title,
        body: it.body ?? null,
        reasoning: it.reasoning ?? null,
        confidence: it.confidence ?? parsed.confidence ?? null,
      });
    } else if (it.kind === "alert") {
      alerts.push({
        workspace_id, model,
        alert_type: task,
        severity: it.severity ?? "warn",
        entity_type: it.entity_type ?? null,
        entity_id: it.entity_id ?? null,
        title: it.title,
        message: it.body ?? null,
        reasoning: it.reasoning ?? null,
        confidence: it.confidence ?? parsed.confidence ?? null,
      });
    } else if (it.kind === "score") {
      scores.push({
        workspace_id, model,
        subject_type: it.subject_type ?? "global",
        subject_id: it.entity_id ?? null,
        subject_label: it.subject_label ?? it.title,
        metric: it.metric ?? task,
        score: it.score ?? 0,
        band: it.band ?? null,
        reasoning: it.reasoning ?? null,
        confidence: it.confidence ?? parsed.confidence ?? null,
      });
    } else {
      ins.push({
        workspace_id, model,
        kind: task,
        scope: it.entity_type ?? null,
        title: it.title,
        summary: it.body ?? null,
        data: { entity_id: it.entity_id ?? null },
        reasoning: it.reasoning ?? null,
        severity: it.severity ?? "info",
        confidence: it.confidence ?? parsed.confidence ?? null,
      });
    }
  }
  if (reco.length)   await svc.from("ai_recommendations").insert(reco);
  if (ins.length)    await svc.from("ai_insights").insert(ins);
  if (alerts.length) await svc.from("ai_alerts").insert(alerts);
  if (scores.length) await svc.from("ai_scores").insert(scores);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "missing auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // user-scoped client to validate workspace membership via RLS
    const userClient = createClient(SUPA_URL, SUPA_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json() as Body;
    if (!body?.task || !body?.workspace_id) {
      return new Response(JSON.stringify({ error: "task and workspace_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Workspace gate — uses RLS on memberships
    const { data: membership, error: mErr } = await userClient
      .from("memberships")
      .select("workspace_id")
      .eq("workspace_id", body.workspace_id)
      .maybeSingle();
    if (mErr || !membership) {
      return new Response(JSON.stringify({ error: "workspace_forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const svc = createClient(SUPA_URL, SUPA_SVC);

    const ctx = await gatherContext(svc, body.task, body.workspace_id, body.entity_id);
    const contextHash = await sha256(JSON.stringify({ t: body.task, e: body.entity_id ?? null, p: body.params ?? null, ctx }));

    // Cache lookup
    if (!body.force) {
      const { data: hit } = await svc
        .from("ai_cache")
        .select("*")
        .eq("workspace_id", body.workspace_id)
        .eq("task", body.task)
        .eq("context_hash", contextHash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (hit) {
        return new Response(JSON.stringify({ cached: true, result: hit.result, explanation: hit.explanation, confidence: hit.confidence }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const system = promptFor(body.task);
    const { parsed, usage } = await callAI(system, { task: body.task, params: body.params ?? null, context: ctx });

    // Cache
    await svc.from("ai_cache").upsert({
      workspace_id: body.workspace_id,
      task: body.task,
      context_hash: contextHash,
      model: MODEL,
      result: parsed,
      explanation: parsed.explanation ?? null,
      confidence: parsed.confidence ?? null,
      tokens_in: usage.prompt_tokens ?? null,
      tokens_out: usage.completion_tokens ?? null,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }, { onConflict: "workspace_id,task,context_hash" });

    if (body.persist !== false) {
      await persistItems(svc, body.task, body.workspace_id, MODEL, parsed);
    }

    return new Response(JSON.stringify({ cached: false, result: parsed, explanation: parsed.explanation, confidence: parsed.confidence }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ai-orchestrator]", msg);
    const status = msg.includes("429") ? 429 : msg.includes("402") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
