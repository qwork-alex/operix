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
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const tunnelUrl = projectId
    ? `https://${projectId}.supabase.co/functions/v1/sentry-tunnel`
    : "/api/sentry-tunnel";
  const isDev = import.meta.env.DEV;
  Sentry.init({
    dsn: sentryDsn,
    tunnel: tunnelUrl,
    debug: isDev,
    environment: import.meta.env.MODE,
    release: `qwork-nexus@${import.meta.env.MODE}`,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: isDev ? 1.0 : 0.1,
    replaysSessionSampleRate: isDev ? 0.1 : 0,
    replaysOnErrorSampleRate: isDev ? 1.0 : 0.2,
    transportOptions: { fetchOptions: { keepalive: true } },
  });
  if (isDev) {
    (window as any).__qwSentry = {
      test: () => Sentry.captureException(new Error("TESTE_SENTRY_QWORK")),
      flush: (ms = 3000) => Sentry.getClient()?.flush(ms),
      dsn: sentryDsn,
      tunnel: tunnelUrl,
    };
  }
}

createRoot(document.getElementById("root")!).render(<App />);
