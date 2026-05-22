// QWork Operational Agent — LLM chat (streaming, read-only, safe).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface IncomingMsg { role: "user" | "assistant"; content: string }
interface AgentContext {
  route?: string;
  module?: string;
  online?: boolean;
  realtime?: string;
  signals?: Array<{ id: string; level: string; title: string; detail?: string }>;
  recentEvents?: Array<{ kind: string; level: string; title: string; detail?: string; at: number }>;
  consoleErrors?: number;
  renderCrashes?: number;
}

const SYSTEM_PROMPT = `Você é o QWork Agent — copiloto operacional do QWork Nexus.

Idioma: Português (PT-pt), tom técnico, breve, objetivo. Máximo ~6 linhas por resposta.

Função:
- Observador inteligente do sistema operacional.
- Explica falhas, interpreta erros, sugere próximos passos de diagnóstico ou navegação.
- Responde sobre o estado actual usando APENAS o contexto operacional injetado.

REGRAS DE SEGURANÇA (não negociáveis):
- NUNCA execute ações destrutivas.
- NUNCA prometa alterar base de dados, plataformas, OS, OP ou produção.
- NUNCA invente dados, métricas ou IDs que não estejam no contexto.
- Se não souber, diga "Não tenho esse dado no contexto actual."
- Toda alteração real requer aprovação explícita do utilizador na UI.

Estilo:
- Markdown leve (negrito, listas curtas).
- Sem floreios.
- Quando relevante, sugere uma ação textual: "Sugiro abrir o Radar PDR" ou "Ver fluxo operacional".`;

function buildContextMessage(ctx: AgentContext): string {
  const lines: string[] = ["[CONTEXTO OPERACIONAL]"];
  lines.push(`Rota: ${ctx.route ?? "?"} · Módulo: ${ctx.module ?? "?"}`);
  lines.push(`Online: ${ctx.online ? "sim" : "não"} · Realtime: ${ctx.realtime ?? "?"}`);
  if (typeof ctx.consoleErrors === "number" || typeof ctx.renderCrashes === "number") {
    lines.push(`Erros consola: ${ctx.consoleErrors ?? 0} · Render crashes: ${ctx.renderCrashes ?? 0}`);
  }
  if (ctx.signals?.length) {
    lines.push("Sinais activos:");
    ctx.signals.slice(0, 8).forEach((s) => {
      lines.push(`  - [${s.level}] ${s.title}${s.detail ? " — " + s.detail : ""}`);
    });
  }
  if (ctx.recentEvents?.length) {
    lines.push(`Eventos recentes (${Math.min(ctx.recentEvents.length, 10)}):`);
    ctx.recentEvents.slice(-10).forEach((e) => {
      lines.push(`  - [${e.level}] ${e.kind} · ${e.title}${e.detail ? " — " + e.detail : ""}`);
    });
  }
  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const messages: IncomingMsg[] = Array.isArray(body?.messages) ? body.messages : [];
    const context: AgentContext = body?.context ?? {};
    const model: string = typeof body?.model === "string" ? body.model : "google/gemini-3-flash-preview";

    // Cap conversation memory — keep last ~12 turns, trim content size
    const trimmed = messages
      .slice(-12)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? "").slice(0, 2000),
      }));

    const payload = {
      model,
      stream: true,
      max_tokens: 600,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: buildContextMessage(context) },
        ...trimmed,
      ],
    };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit excedido. Tenta novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos Lovable AI esgotados. Adiciona créditos em Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Falha no gateway de IA." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("agent-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
