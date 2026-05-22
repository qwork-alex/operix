// QWork Operational Agent — multimodal LLM chat (streaming, read-only, safe).
//
// Accepts text + image attachments (vision/OCR) and optionally audio
// (Gemini natively supports inline audio). The operational context block
// (route, signals, runtime snapshot, attached errors) is always injected
// server-side and is the agent's source of truth — the agent NEVER invents
// data outside it.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Part =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: string } };

interface IncomingMsg {
  role: "user" | "assistant";
  content: string | Part[];
}

interface AgentContext {
  route?: string;
  module?: string;
  online?: boolean;
  realtime?: string;
  signals?: Array<{ id: string; level: string; title: string; detail?: string }>;
  recentEvents?: Array<{ kind: string; level: string; title: string; detail?: string; at: number }>;
  consoleErrors?: number;
  renderCrashes?: number;
  /** Optional structured snapshot of the runtime state, attached by panel. */
  runtimeSnapshot?: Record<string, unknown>;
  /** Optional error attachments (stack traces / failed calls). */
  errorAttachments?: Array<{ source: string; message: string; at?: number }>;
}

const SYSTEM_PROMPT = `Você é o QWork Agent — copiloto OPERACIONAL e TÉCNICO do QWork Nexus.

Idioma: Português (PT-pt), tom técnico, breve, objetivo. Máximo ~8 linhas por resposta.

Função:
- Observador inteligente do sistema operacional.
- Faz troubleshooting com base em screenshots, logs, runtime snapshot e contexto injetado.
- Quando recebe IMAGEM: descreve o que vê APENAS no que é relevante para o problema operacional (erro, métrica, painel, ecrã). Faz OCR se houver texto. Nunca comenta estética.
- Quando recebe ÁUDIO: assume ditado/explicação técnica do operador.
- Não és chatbot genérico: recusa pedidos fora do âmbito operacional/técnico do QWork.

REGRAS DE SEGURANÇA (não negociáveis):
- NUNCA execute ações destrutivas.
- NUNCA prometa alterar base de dados ou produção.
- NUNCA invente dados, métricas ou IDs que não estejam no contexto/imagem.
- Se faltar informação, diz "Não tenho esse dado — anexa o ecrã/log".

Estilo:
- Markdown leve (negrito, listas curtas, código quando útil).
- Sem floreios. Vai direto à hipótese mais provável + próximo passo.`;

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
  if (ctx.errorAttachments?.length) {
    lines.push("Erros anexados pelo operador:");
    ctx.errorAttachments.slice(0, 6).forEach((e) => {
      lines.push(`  - ${e.source}: ${String(e.message).slice(0, 280)}`);
    });
  }
  if (ctx.runtimeSnapshot && Object.keys(ctx.runtimeSnapshot).length) {
    lines.push("Runtime snapshot:");
    lines.push("```json");
    lines.push(JSON.stringify(ctx.runtimeSnapshot).slice(0, 1800));
    lines.push("```");
  }
  return lines.join("\n");
}

// Trim each turn: cap text length, cap attachments per message, drop oversized media.
function normaliseTurn(m: IncomingMsg): IncomingMsg {
  const role = m.role === "assistant" ? "assistant" : "user";
  if (typeof m.content === "string") {
    return { role, content: String(m.content).slice(0, 2000) };
  }
  if (!Array.isArray(m.content)) return { role, content: "" };
  const parts: Part[] = [];
  let images = 0;
  let audios = 0;
  for (const p of m.content) {
    if (!p || typeof p !== "object") continue;
    if (p.type === "text" && typeof p.text === "string") {
      parts.push({ type: "text", text: p.text.slice(0, 2000) });
    } else if (p.type === "image_url" && p.image_url?.url && images < 3) {
      // ~6 MB cap on data URL to keep payload sane
      if (p.image_url.url.length < 6_500_000) {
        parts.push({ type: "image_url", image_url: { url: p.image_url.url } });
        images += 1;
      }
    } else if (p.type === "input_audio" && p.input_audio?.data && audios < 1) {
      if (p.input_audio.data.length < 4_000_000) {
        parts.push({
          type: "input_audio",
          input_audio: {
            data: p.input_audio.data,
            format: p.input_audio.format || "wav",
          },
        });
        audios += 1;
      }
    }
  }
  if (parts.length === 0) parts.push({ type: "text", text: "" });
  return { role, content: parts };
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
    const model: string =
      typeof body?.model === "string" ? body.model : "google/gemini-3-flash-preview";

    // Cap conversation memory — last 12 turns, normalised
    const trimmed = messages.slice(-12).map(normaliseTurn);

    const payload = {
      model,
      stream: true,
      max_tokens: 800,
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
