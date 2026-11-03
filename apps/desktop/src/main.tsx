import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./design/centurion-tokens.css";
import "./design/app.css";
import { TerminalView } from "./views/TerminalView";
import { ChartView } from "./views/ChartView";
import { ActivityView } from "./views/ActivityView";
import { ApprovalView } from "./views/ApprovalView";
import { AuthGate } from "./views/AuthGate";
import { useCoreEvents, useDocumentAttributes } from "./hooks/useCoreEvents";
import { useTerm } from "./state/store";

// Defaults before the snapshot arrives (desktop: dark + compact + practice).
Object.assign(document.documentElement.dataset, { theme: "dark", mode: "practice", density: "compact" });

// Surface uncaught errors in the status bar (no devtools in release builds).
window.addEventListener("error", (e) => useTerm.getState().reportError(e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => useTerm.getState().reportError(e.reason));

/** One bundle, many windows: the route comes from the URL hash set by Rust's WebviewWindowBuilder. */
function parseRoute() {
  const [path, qs] = location.hash.replace(/^#/, "").split("?");
  return { path: path || "/", params: new URLSearchParams(qs ?? "") };
}

function Root() {
  useCoreEvents();
  useDocumentAttributes();
  const { path, params } = parseRoute();
  // SIWS builds: every window waits for a session (Rust holds it; the webview only sees the state).
  if (path === "/chart" && params.get("mint")) return <AuthGate><ChartView mint={params.get("mint")!} /></AuthGate>;
  if (path === "/activity") return <AuthGate><ActivityView /></AuthGate>;
  if (path === "/popup" || path === "/approval") return <AuthGate><ApprovalView /></AuthGate>;
  return <AuthGate><TerminalView /></AuthGate>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
