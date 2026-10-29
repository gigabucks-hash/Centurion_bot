/**
 * HTTP adapter placeholder for the real backend (Phases 1–4).
 * Endpoint paths are GUESSES pending the Backend API Specialist's schema.
 */
import type { DashboardApi } from "./api";

const base = () => process.env.API_BASE_URL ?? "http://localhost:8080";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, { ...init, headers: { accept: "application/json", "content-type": "application/json", ...init?.headers } });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export const httpApi: DashboardApi = {
  getOverview: (mode) => req(`/v1/workspaces/${mode}/overview`),
  listStrategies: (mode) => req(`/v1/workspaces/${mode}/strategies`),
  getStrategy: (id) => req(`/v1/strategies/${encodeURIComponent(id)}`),
  publishStrategy: (id, settings) =>
    req(id ? `/v1/strategies/${encodeURIComponent(id)}/revisions` : "/v1/strategies", { method: "POST", body: JSON.stringify({ settings }) }),
  listRecentEvents: (mode, limit = 50) => req(`/v1/workspaces/${mode}/events?limit=${limit}`),
  listCoins: (mode) => req(`/v1/workspaces/${mode}/coins`),
  getCoinTrail: (mint) => req(`/v1/coins/${encodeURIComponent(mint)}/trail`),
  getExitStats: (f) => {
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
    return req(`/v1/stats/exits?${q}`);
  },
  listApprovals: (mode) => req(`/v1/workspaces/${mode}/approvals`),
  decideApproval: (id, decision) => req(`/v1/approvals/${encodeURIComponent(id)}/decisions`, { method: "POST", body: JSON.stringify(decision) }),
};
