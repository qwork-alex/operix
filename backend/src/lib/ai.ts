import { env } from "../config/env.js";

function getAIConfig() {
  if (env.GEMINI_API_KEY) {
    return {
      apiKey: env.GEMINI_API_KEY,
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      defaultModel: "gemini-2.5-flash",
    };
  }
  if (env.OPENAI_API_KEY) {
    return {
      apiKey: env.OPENAI_API_KEY,
      endpoint: "https://api.openai.com/v1/chat/completions",
      defaultModel: "gpt-4o-mini",
    };
  }
  throw new Error("No AI provider configured. Set GEMINI_API_KEY or OPENAI_API_KEY.");
}

export async function fetchAICompletion(payload: Record<string, unknown>): Promise<Response> {
  const config = getAIConfig();
  return fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: config.defaultModel, ...payload }),
  });
}

export function parseToolCall(data: any): unknown {
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("No structured data returned from AI");
  return JSON.parse(toolCall.function.arguments);
}
