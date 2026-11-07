"use client";
/**
 * Workspace-wide buy switch (Stop buying / Resume buying). Talks only to this app's BFF, which proxies the
 * contract in http mode. Every write is followed by a GET /trading because the GET is the source of truth
 * (another device may have changed the rev in between).
 */
import { observeServerNow } from "./clock";
import { ApiError, toApiError } from "./errors";
import { tradingFromWire, type TradingWire } from "./trading";
import type { TradingState } from "./types";

const WS = "ws_mock";
const base = `/api/v1/workspaces/${WS}/trading`;

async function read<T>(path: string, init: RequestInit = {}): Promise<{ data: T; raw: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, cache: "no-store", headers: { accept: "application/json", "content-type": "application/json", ...init.headers } });
  } catch {
    throw new ApiError("OFFLINE", 0);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  observeServerNow(json.server_now as string | undefined);
  if (!res.ok) throw toApiError(res.status, json);
  return { data: (json.data ?? json) as T, raw: json };
}

/** Current state, straight from the API (never the mock module directly). */
export async function fetchTradingClient(): Promise<TradingState> {
  return tradingFromWire((await read<TradingWire>(base)).data);
}

/** Pause/resume buys with optimistic `If-Match`, then re-read. A 409 VERSION_CONFLICT surfaces as ApiError. */
export async function setBuysPausedClient(paused: boolean, rev: number, reason?: string): Promise<TradingState> {
  await read<TradingWire>(`${base}/${paused ? "pause-buys" : "resume-buys"}`, {
    method: "POST",
    headers: { "if-match": `"${rev}"`, "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify(reason ? { reason } : {}),
  });
  return fetchTradingClient();
}