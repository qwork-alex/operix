/**
 * Auth Circuit Breaker
 * --------------------
 * Sobrevive a degradação do Supabase GoTrue (HTTP 504 em
 * /auth/v1/token?grant_type=refresh_token) sem prender a UI.
 *
 * Estratégia:
 *  - Intercepta fetch APENAS do endpoint de refresh token.
 *  - Conta 504 / network failures consecutivos.
 *  - Após THRESHOLD: dispara modo DEGRADED → limpa tokens locais,
 *    notifica AuthProvider para liberar UI em estado deslogado.
 *  - Modo SAFE_AUTH (degraded) é resetado quando há sucesso (200).
 *
 * NÃO altera providers, runtime, realtime ou QueryClient.
 */

const THRESHOLD = 3;
const REFRESH_PATH = "/auth/v1/token";

type Listener = (degraded: boolean) => void;

const state = {
  consecutive504s: 0,
  degraded: false,
  installed: false,
};

const listeners = new Set<Listener>();

export function onAuthBreaker(l: Listener): () => void {
  listeners.add(l);
  l(state.degraded);
  return () => listeners.delete(l);
}

export function isAuthDegraded(): boolean {
  return state.degraded;
}

function emit() {
  listeners.forEach((l) => {
    try { l(state.degraded); } catch (e) { console.error("[AUTH_BREAKER] listener error", e); }
  });
}

export function clearLocalAuthTokens() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith("sb-") && k.endsWith("-auth-token")) keys.push(k);
      if (k.startsWith("supabase.auth.")) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && (k.startsWith("sb-") || k.startsWith("supabase.auth."))) sessionStorage.removeItem(k);
    }
    console.warn("[AUTH_RECOVERY] cleared local auth tokens:", keys);
  } catch (e) {
    console.error("[AUTH_RECOVERY] failed to clear tokens", e);
  }
}

function trip(reason: string) {
  if (state.degraded) return;
  state.degraded = true;
  console.warn(`[AUTH_BREAKER] tripped (${reason}) — entering SAFE_AUTH_MODE`);
  clearLocalAuthTokens();
  emit();
}

export function resetAuthBreaker() {
  state.consecutive504s = 0;
  if (state.degraded) {
    state.degraded = false;
    console.log("[AUTH_RESTORED] breaker reset");
    emit();
  }
}

/** Install once. Wraps window.fetch to observe refresh-token calls. */
export function installAuthBreaker() {
  if (state.installed || typeof window === "undefined") return;
  state.installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const input = args[0];
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;

    const isRefresh =
      typeof url === "string" &&
      url.includes(REFRESH_PATH) &&
      url.includes("grant_type=refresh_token");

    if (!isRefresh) return originalFetch(...args);

    try {
      const res = await originalFetch(...args);
      if (res.status === 504 || res.status === 502 || res.status === 503) {
        state.consecutive504s += 1;
        console.warn(
          `[AUTH_504] refresh token HTTP ${res.status} (${state.consecutive504s}/${THRESHOLD})`,
        );
        if (state.consecutive504s >= THRESHOLD) trip(`${state.consecutive504s} consecutive ${res.status}`);
      } else if (res.ok) {
        if (state.consecutive504s > 0) console.log("[AUTH_RESTORED] refresh succeeded");
        state.consecutive504s = 0;
      }
      return res;
    } catch (err) {
      state.consecutive504s += 1;
      console.warn(
        `[AUTH_DEGRADED] refresh network failure (${state.consecutive504s}/${THRESHOLD})`,
        err,
      );
      if (state.consecutive504s >= THRESHOLD) trip("network failure");
      throw err;
    }
  };

  console.log("[AUTH] circuit breaker installed");
}
