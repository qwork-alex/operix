export { ConversationBubble } from "./ConversationBubble";
export { ConversationOrchestrator } from "./ConversationOrchestrator";
export { useConversationPrompt } from "./useConversationPrompt";
export type { ConversationPrompt } from "./ConversationOrchestrator";

/** Event the bubble dispatches when user accepts → FloatingAgent opens. */
export const AGENT_OPEN_REQUEST_EVENT = "qwork:agent:open-request";
