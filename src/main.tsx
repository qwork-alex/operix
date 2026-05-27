import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// NOTE: RuntimeHealthMonitor used to boot here eagerly (Phase 1). That made
// observability part of the critical bootstrap path. It is now booted from
// `useObservabilityBoot` during Phase 4 (idle, post-paint, SAFE_BOOT aware).

createRoot(document.getElementById("root")!).render(<App />);
