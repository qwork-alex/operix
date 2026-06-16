// QWork Operational Agent — multimodal LLM chat (streaming, read-only, safe).
//
// Accepts text + image attachments (vision/OCR) and optionally audio
// (Gemini natively supports inline audio). The operational context block
// (route, signals, runtime snapshot, attached errors) is always injected
// server-side and is the agent's source of truth — the agent NEVER invents
// data outside it.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchAIChatCompletions } from "../_shared/ai.ts";

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
  workspace_id?: string;
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

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("JWT_SECRET")?.trim() || "";
const RATE_LIMIT_PER_MINUTE = 12;
const RATE_LIMIT_PER_DAY = 120;

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function safeJsonParse<T>(text: string): T {
  return JSON.parse(text) as T;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function verifyBackendJwt(token: string) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET ausente no ambiente da função");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("token_malformed");
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = safeJsonParse<Record<string, unknown>>(new TextDecoder().decode(decodeBase64Url(headerPart)));
  if (header.alg !== "HS256") throw new Error("token_alg_unsupported");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${headerPart}.${payloadPart}`));
  const expected = bytesToBase64Url(new Uint8Array(signed));
  if (expected !== signaturePart) throw new Error("token_signature_invalid");
  const payload = safeJsonParse<Record<string, unknown>>(new TextDecoder().decode(decodeBase64Url(payloadPart)));
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < now) throw new Error("token_expired");
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("token_subject_missing");
  return payload;
}

async function countStreamBytes(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value?.byteLength ?? 0;
    }
  } finally {
    reader.releaseLock();
  }
  return total;
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const messages: IncomingMsg[] = Array.isArray(body?.messages) ? body.messages : [];
    const context: AgentContext = body?.context ?? {};
    const workspaceId: string | null =
      typeof body?.workspace_id === "string" && body.workspace_id.trim()
        ? body.workspace_id.trim()
        : typeof context.workspace_id === "string" && context.workspace_id.trim()
          ? context.workspace_id.trim()
          : null;
    const model: string =
      typeof body?.model === "string" ? body.model : "google/gemini-3-flash-preview";

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "workspace_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claims = await verifyBackendJwt(authHeader.slice(7));
    const userId = String(claims.sub);
    const svc = createClient(SUPA_URL, SUPA_SVC);
    const { data: appUser } = await svc
      .from("app_users")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!appUser?.id) {
      return new Response(JSON.stringify({ error: "user_not_found" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: membership } = await svc
      .from("memberships")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", appUser.id)
      .eq("status", "active")
      .maybeSingle();
    if (!membership) {
      await svc.from("ai_action_log").insert({
        workspace_id: workspaceId,
        user_id: userId,
        action: "agent_chat",
        status: "forbidden",
        payload: {
          route: context.route ?? null,
          module: context.module ?? null,
        },
        error: "workspace_forbidden",
      });
      return new Response(JSON.stringify({ error: "workspace_forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const minuteAgo = new Date(now.getTime() - 60_000).toISOString();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const [{ count: minuteCount }, { count: dayCount }] = await Promise.all([
      svc.from("ai_action_log").select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .eq("action", "agent_chat")
        .gte("created_at", minuteAgo),
      svc.from("ai_action_log").select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .eq("action", "agent_chat")
        .gte("created_at", dayAgo),
    ]);

    if ((minuteCount ?? 0) >= RATE_LIMIT_PER_MINUTE || (dayCount ?? 0) >= RATE_LIMIT_PER_DAY) {
      await svc.from("ai_action_log").insert({
        workspace_id: workspaceId,
        user_id: userId,
        action: "agent_chat",
        status: "throttled",
        payload: {
          route: context.route ?? null,
          module: context.module ?? null,
          minute_count: minuteCount ?? 0,
          day_count: dayCount ?? 0,
        },
        error: "rate_limit_exceeded",
      });
      return new Response(JSON.stringify({ error: "Rate limit excedido. Tenta novamente em instantes." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: createdLog } = await svc.from("ai_action_log").insert({
      workspace_id: workspaceId,
      user_id: userId,
      action: "agent_chat",
      status: "started",
      payload: {
        route: context.route ?? null,
        module: context.module ?? null,
        model,
        prompt_turns: messages.length,
        images: messages.reduce((acc, msg) => acc + (Array.isArray(msg.content) ? msg.content.filter((p) => p.type === "image_url").length : 0), 0),
        audios: messages.reduce((acc, msg) => acc + (Array.isArray(msg.content) ? msg.content.filter((p) => p.type === "input_audio").length : 0), 0),
      },
    }).select("id").single();
    const logId = createdLog?.id ?? null;

    // Cap conversation memory — last 12 turns, normalised
    const trimmed = messages.slice(-12).map(normaliseTurn);

    const payload = {
      model,
      stream: true,
      max_tokens: 800,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: buildContextMessage({ ...context, workspace_id: workspaceId }) },
        ...trimmed,
      ],
    };

    const { response } = await fetchAIChatCompletions(payload, {
      modelByProvider: {
        gemini: "gemini-2.5-flash",
        openai: "gpt-4o-mini",
        lovable: "google/gemini-3-flash-preview",
      },
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
      if (logId) {
        await svc.from("ai_action_log").update({
          status: "error",
          error: `gateway_${response.status}`,
          result: { body: t.slice(0, 500) },
        }).eq("id", logId);
      }
      return new Response(JSON.stringify({ error: "Falha no gateway de IA." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!response.body) {
      if (logId) {
        await svc.from("ai_action_log").update({
          status: "error",
          error: "empty_stream",
        }).eq("id", logId);
      }
      return new Response(JSON.stringify({ error: "Resposta vazia do agente." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [clientStream, auditStream] = response.body.tee();
    if (logId) {
      void countStreamBytes(auditStream)
        .then((bytes) =>
          svc.from("ai_action_log").update({
            status: "ok",
            result: { streamed_bytes: bytes, model, completed_at: new Date().toISOString() },
          }).eq("id", logId),
        )
        .catch((err) =>
          svc.from("ai_action_log").update({
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          }).eq("id", logId),
        );
    }

    return new Response(clientStream, {
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
