type AIProviderName = "gemini" | "openai" | "lovable";

type AIModelMap = Partial<Record<AIProviderName, string>>;

interface AIProviderConfig {
  name: AIProviderName;
  apiKey: string;
  endpoint: string;
  defaultModel: string;
}

interface ChatPayload {
  model?: string;
  [key: string]: unknown;
}

interface ResolveOptions {
  modelByProvider?: AIModelMap;
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function getProviderConfig(): AIProviderConfig {
  const geminiKey = firstNonEmpty(Deno.env.get("GEMINI_API_KEY"));
  if (geminiKey) {
    return {
      name: "gemini",
      apiKey: geminiKey,
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      defaultModel: "gemini-2.5-flash",
    };
  }

  const openaiKey = firstNonEmpty(Deno.env.get("OPENAI_API_KEY"));
  if (openaiKey) {
    return {
      name: "openai",
      apiKey: openaiKey,
      endpoint: "https://api.openai.com/v1/chat/completions",
      defaultModel: "gpt-4o-mini",
    };
  }

  const lovableKey = firstNonEmpty(Deno.env.get("LOVABLE_API_KEY"));
  if (lovableKey) {
    return {
      name: "lovable",
      apiKey: lovableKey,
      endpoint: "https://ai.gateway.lovable.dev/v1/chat/completions",
      defaultModel: "google/gemini-2.5-flash",
    };
  }

  throw new Error("No AI provider configured. Set GEMINI_API_KEY, OPENAI_API_KEY, or LOVABLE_API_KEY.");
}

function normalizeModel(provider: AIProviderConfig, requested: string | undefined, modelByProvider?: AIModelMap) {
  const explicit = modelByProvider?.[provider.name];
  if (explicit) return explicit;

  if (!requested) return provider.defaultModel;

  const lower = requested.toLowerCase();
  if (provider.name === "gemini" && lower.startsWith("gpt-")) {
    return provider.defaultModel;
  }
  if (provider.name === "openai" && (lower.includes("gemini") || lower.startsWith("google/"))) {
    return provider.defaultModel;
  }

  return requested;
}

export function resolveAIProvider(options: ResolveOptions = {}) {
  const provider = getProviderConfig();
  return {
    ...provider,
    model: normalizeModel(provider, undefined, options.modelByProvider),
  };
}

export async function fetchAIChatCompletions(payload: ChatPayload, options: ResolveOptions = {}) {
  const provider = getProviderConfig();
  const body = {
    ...payload,
    model: normalizeModel(provider, typeof payload.model === "string" ? payload.model : undefined, options.modelByProvider),
  };

  const response = await fetch(provider.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return { provider, response, body };
}
