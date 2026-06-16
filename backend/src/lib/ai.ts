import { env } from "../config/env.js";

interface AIConfig {
  apiKey: string;
  endpoint: string;
  defaultModel: string;
}

function getAIConfigs(): AIConfig[] {
  const configs: AIConfig[] = [];
  if (env.GEMINI_API_KEY) {
    configs.push({
      apiKey: env.GEMINI_API_KEY,
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      defaultModel: "gemini-2.5-flash",
    });
  }
  if (env.OPENAI_API_KEY) {
    configs.push({
      apiKey: env.OPENAI_API_KEY,
      endpoint: "https://api.openai.com/v1/chat/completions",
      defaultModel: "gpt-4o-mini",
    });
  }
  if (configs.length === 0) {
    throw new Error("No AI provider configured. Set GEMINI_API_KEY or OPENAI_API_KEY.");
  }
  return configs;
}

async function callProvider(config: AIConfig, payload: Record<string, unknown>): Promise<Response> {
  return fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: config.defaultModel, ...payload }),
  });
}

export async function fetchAICompletion(payload: Record<string, unknown>): Promise<Response> {
  const configs = getAIConfigs();
  let lastResponse: Response | null = null;

  for (const config of configs) {
    const res = await callProvider(config, payload);
    // Retry with next provider on rate limit or auth failure
    if ((res.status === 429 || res.status === 401 || res.status === 403) && configs.indexOf(config) < configs.length - 1) {
      console.warn(`[ai] Provider ${config.endpoint} returned ${res.status}, trying fallback...`);
      lastResponse = res;
      continue;
    }
    return res;
  }

  return lastResponse!;
}

export function parseToolCall(data: any): unknown {
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("No structured data returned from AI");
  return JSON.parse(toolCall.function.arguments);
}
