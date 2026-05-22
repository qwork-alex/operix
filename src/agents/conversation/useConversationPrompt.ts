import { useEffect, useState } from "react";
import { ConversationOrchestrator, type ConversationPrompt } from "./ConversationOrchestrator";

export function useConversationPrompt(): {
  prompt: ConversationPrompt | null;
  dismiss: () => void;
  mute: () => void;
  consume: () => void;
} {
  const [prompt, setPrompt] = useState<ConversationPrompt | null>(null);

  useEffect(() => {
    ConversationOrchestrator.start();
    return ConversationOrchestrator.subscribe(setPrompt);
  }, []);

  return {
    prompt,
    dismiss: () => prompt && ConversationOrchestrator.dismiss(prompt.id),
    mute: () => prompt && ConversationOrchestrator.mute(prompt.id),
    consume: () => prompt && ConversationOrchestrator.consume(prompt.id),
  };
}
