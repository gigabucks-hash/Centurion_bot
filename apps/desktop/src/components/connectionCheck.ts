/**
 * Validation for the paper API connection fields. Mirrors the Rust rules in
 * `src-tauri/src/config.rs` (which the command re-checks, so this is only inline feedback):
 * https anywhere, plain http only to loopback, no path on the API base.
 */

export type ConnectionFieldError =
  | "backend_scheme"
  | "backend_url"
  | "backend_loopback"
  | "backend_path"
  | "login_scheme"
  | "login_url"
  | "login_loopback";

export type Checked<T> = { ok: true; value: T } | { ok: false; error: ConnectionFieldError };

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

function schemeAndRest(url: string): { tls: boolean; rest: string } | null {
  if (url.startsWith("https://")) return { tls: true, rest: url.slice("https://".length) };
  if (url.startsWith("http://")) return { tls: false, rest: url.slice("http://".length) };
  return null;
}

function hostOf(rest: string): string {
  const hostPort = rest.split(/[/?#]/)[0] ?? "";
  const i = hostPort.lastIndexOf(":");
  if (i > 0 && /^\d+$/.test(hostPort.slice(i + 1))) return hostPort.slice(0, i);
  return hostPort;
}

/** `""` means "use the mock" and checks as ok/null. */
export function checkBackend(raw: string): Checked<string | null> {
  const v = raw.trim().replace(/\/+$/, "");
  if (!v) return { ok: true, value: null };
  const s = schemeAndRest(v);
  if (!s) return { ok: false, error: "backend_scheme" };
  if (!hostOf(s.rest) || v.length > 200 || s.rest.includes("@") || /\s/.test(s.rest)) {
    return { ok: false, error: "backend_url" };
  }
  if (!s.tls && !LOOPBACK.has(hostOf(s.rest))) return { ok: false, error: "backend_loopback" };
  if (s.rest.includes("/") || s.rest.includes("?") || s.rest.includes("#")) {
    return { ok: false, error: "backend_path" };
  }
  return { ok: true, value: v };
}

/** `""` means "use the built-in login page" and checks as ok/null. A path is allowed. */
export function checkLoginUrl(raw: string): Checked<string | null> {
  const v = raw.trim();
  if (!v) return { ok: true, value: null };
  const s = schemeAndRest(v);
  if (!s) return { ok: false, error: "login_scheme" };
  if (!hostOf(s.rest) || v.length > 300 || /\s/.test(v) || v.includes("#")) {
    return { ok: false, error: "login_url" };
  }
  if (!s.tls && !LOOPBACK.has(hostOf(s.rest))) return { ok: false, error: "login_loopback" };
  return { ok: true, value: v };
}

/** True when the saved API base differs from what this run actually uses (a restart is needed). */
export function needsRestart(activeBackend: string | null, nextBackend: string | null): boolean {
  return (activeBackend ?? null) !== (nextBackend ?? null);
}
