/**
 * Agent Action Framework — light, dependency-free intent dispatcher.
 *
 * The agent emits intents; the dispatcher executes them via:
 *  - react-router navigation (window-level event)
 *  - DOM highlight pulse on data-agent-focus="<id>" elements
 *
 * No coupling to React internals; safe to call from anywhere.
 */
export type AgentAction =
  | { kind: "navigate"; to: string; focus?: string }
  | { kind: "highlight"; focus: string }
  | { kind: "show_errors" };

const NAV_EVENT = "qwork:agent:navigate";
const FOCUS_EVENT = "qwork:agent:focus";

export function dispatchAgentAction(action: AgentAction) {
  if (action.kind === "navigate") {
    window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: { to: action.to } }));
    if (action.focus) {
      // Pulse highlight shortly after navigation has settled
      setTimeout(() => highlightFocus(action.focus!), 350);
    }
  } else if (action.kind === "highlight") {
    highlightFocus(action.focus);
  } else if (action.kind === "show_errors") {
    window.dispatchEvent(new CustomEvent("qwork:agent:show-errors"));
  }
}

function highlightFocus(focus: string) {
  const el = document.querySelector<HTMLElement>(`[data-agent-focus="${focus}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("agent-highlight-pulse");
  setTimeout(() => el.classList.remove("agent-highlight-pulse"), 2400);
}

export const AGENT_NAV_EVENT = NAV_EVENT;
export const AGENT_FOCUS_EVENT = FOCUS_EVENT;
