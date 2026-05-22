import type { BaseProvider } from "../registry";

export type AICapability = "chat" | "ocr" | "embedding" | "vision" | "reasoning";

export interface AIChatMessage { role: "system" | "user" | "assistant"; content: string }

export interface AIProvider extends BaseProvider {
  capabilities: AICapability[];
  chat?(args: { messages: AIChatMessage[]; model?: string; maxTokens?: number }): Promise<string>;
}
