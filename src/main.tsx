import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";
import { installAuthBreaker } from "./lib/authBreaker";

// Install auth circuit breaker BEFORE the Supabase client touches window.fetch.
// Survives GoTrue 504 storms without infinite spinners.
installAuthBreaker();

// Sentry: minimal error/runtime monitoring — initialized once at bootstrap.
const SENTRY_DSN_FALLBACK =
  "https://746d269b547c16ec650ebe86b9a6ac37@o4511469175504896.ingest.de.sentry.io/4511469204668496";
const sentryDsn = import.meta.env.VITE_SENTRY_DSN || SENTRY_DSN_FALLBACK;
if (sentryDsn && typeof sentryDsn === "string") {
  Sentry.init({
    dsn: sentryDsn,
    debug: true, // verbose console logs from Sentry transport
    environment: import.meta.env.MODE,
    release: `qwork-nexus@${import.meta.env.MODE}`,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event, hint) {
      // eslint-disable-next-line no-console
      console.info("[SENTRY] beforeSend", { event_id: event.event_id, message: event.message, type: event.type });
      return event;
    },
    transportOptions: {
      // Use fetch with keepalive — survives page unload, bypasses some interceptors
      fetchOptions: { keepalive: true },
    },
  });
  // Manual probe after bootstrap so we see in console whether transport works.
  // If you don't see "[SENTRY] transport ok", the ingest host is blocked (adblock/CSP).
  Sentry.getClient()
    ?.flush(2000)
    .then((ok) => console.info("[SENTRY] init flush =", ok));
  setTimeout(() => {
    try {
      const id = Sentry.captureMessage("QWORK_SENTRY_BOOT_PROBE", "info");
      // eslint-disable-next-line no-console
      console.info("[SENTRY] captureMessage id =", id);
      Sentry.getClient()
        ?.flush(3000)
        .then((ok) =>
          console.info(
            ok
              ? "[SENTRY] transport ok — event delivered to ingest"
              : "[SENTRY] transport FAILED — ingest host blocked (adblock/CORS/network). Use tunnel."
          )
        );
    } catch (e) {
      console.error("[SENTRY] probe error", e);
    }
  }, 1500);
  // Expose for manual testing from devtools: window.__qwSentry.test()
  (window as any).__qwSentry = {
    test: () => Sentry.captureException(new Error("TESTE_SENTRY_QWORK")),
    flush: (ms = 3000) => Sentry.getClient()?.flush(ms),
    dsn: sentryDsn,
  };
  console.info("[SENTRY] initialized. DSN host =", new URL(sentryDsn).host);
}

createRoot(document.getElementById("root")!).render(<App />);
