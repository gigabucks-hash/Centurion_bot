"use client";
/**
 * Browser side of the session: never sees a token. It only knows `expires_at` and asks the route handlers to
 * refresh (rotation happens server-side via the httpOnly refresh cookie) or to log out.
 */
import { useEffect } from "react";

const REFRESH_EARLY_MS = 60_000;
let inflight: Promise<boolean> | null = null;

/** Single-flight silent refresh. Resolves true when a new access cookie was set. */
export function refreshSession(): Promise<boolean> {
  inflight ??= fetch("/api/v1/auth/session/refresh", { method: "POST", cache: "no-store" })
    .then(async (r) => {
      if (r.ok) {
        const j = (await r.json()) as { data: { expires_at: string } };
        scheduleFrom(j.data.expires_at);
      }
      return r.ok;
    })
    .catch(() => false)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function logout() {
  clearTimer();
  await fetch("/api/v1/auth/session/logout", { method: "POST", cache: "no-store" }).catch(() => null);
  // Full reload on purpose: drops every in-memory cache/stream of the signed-out session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login");
}

export function toLogin() {
  const next = window.location.pathname + window.location.search;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- same reason as logout()
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

let timer: ReturnType<typeof setTimeout> | null = null;
const clearTimer = () => {
  if (timer) clearTimeout(timer);
  timer = null;
};
function scheduleFrom(expiresAt: string) {
  clearTimer();
  const wait = Math.max(5_000, Date.parse(expiresAt) - Date.now() - REFRESH_EARLY_MS);
  timer = setTimeout(async () => {
    if (!(await refreshSession())) toLogin();
  }, wait);
}

async function check() {
  const r = await fetch("/api/v1/auth/session/current", { cache: "no-store" }).catch(() => null);
  if (!r) return; // offline: try again on the next focus
  if (r.ok) scheduleFrom(((await r.json()) as { data: { expires_at: string } }).data.expires_at);
  else if (r.status === 401 && !(await refreshSession())) toLogin();
}

/** Mount once in the app shell: schedules the silent refresh and re-checks when the tab becomes visible. */
export function useSessionKeeper(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    check();
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearTimer();
    };
  }, [enabled]);
}
