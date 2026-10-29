"use client";
/**
 * Browser-side data helpers. They only talk to this app's own route handlers
 * (/api/*). No wallet, RPC or chain access anywhere in this build.
 */
import type { Approval, ApprovalDecision, ConnectionState, PublishResult, StrategySettings, TradeEvent, TradingMode } from "@/lib/types";

/** Window event fired after an approval change so other UI (nav badge) can refresh. */
export const APPROVALS_CHANGED = "sentra:approvals-changed";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

export async function decideApprovalClient(id: string, decision: ApprovalDecision): Promise<Approval> {
  const a = await post<Approval>("/api/approvals", { id, decision });
  window.dispatchEvent(new Event(APPROVALS_CHANGED));
  return a;
}

export async function fetchApprovals(): Promise<Approval[]> {
  const res = await fetch("/api/approvals", { cache: "no-store" });
  return res.json();
}

export function switchMode(mode: TradingMode, holdMs: number) {
  return post<{ mode: TradingMode }>("/api/mode", { mode, holdMs });
}

export function publishStrategyClient(id: string | null, settings: StrategySettings) {
  return post<PublishResult>("/api/strategies", { id, settings });
}

/**
 * Subscribe to the realtime activity stream (SSE) for one workspace mode.
 * Returns an unsubscribe function. Transport can be swapped (WS / Supabase).
 */
export function subscribeActivity(mode: TradingMode, onEvent: (e: TradeEvent) => void, onStatus: (s: ConnectionState) => void): () => void {
  onStatus("connecting");
  const es = new EventSource(`/api/stream?mode=${mode}`);
  es.onopen = () => onStatus("connected");
  es.onerror = () => onStatus(es.readyState === EventSource.CLOSED ? "disconnected" : "connecting");
  es.addEventListener("trade", (msg) => {
    try {
      onEvent(JSON.parse((msg as MessageEvent).data) as TradeEvent);
    } catch {
      /* ignore malformed */
    }
  });
  return () => es.close();
}
