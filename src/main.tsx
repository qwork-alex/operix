import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";
import { installAuthBreaker } from "./lib/authBreaker";

// Install auth circuit breaker BEFORE the Supabase client touches window.fetch.
// Survives GoTrue 504 storms without infinite spinners.
installAuthBreaker();

// Sentry: minimal error/runtime monitoring — initialized once at bootstrap.
// Set VITE_SENTRY_DSN in your environment to activate.
// Sentry DSNs are designed to be public (client-side). Fallback embedded so
// observability is always active even when the build-time env var is absent.
const SENTRY_DSN_FALLBACK =
  "https://746d269b547c16ec650ebe86b9a6ac37@o4511469175504896.ingest.de.sentry.io/4511469204668496";
const sentryDsn = import.meta.env.VITE_SENTRY_DSN || SENTRY_DSN_FALLBACK;
if (sentryDsn && typeof sentryDsn === "string") {
  Sentry.init({
    dsn: sentryDsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

createRoot(document.getElementById("root")!).render(<App />);
