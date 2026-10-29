/** DATA_SOURCE=http: forward auth calls to Backend (API_BASE_URL/v1/auth/...); otherwise null → mock. */
export function upstreamAuth(): string | null {
  return process.env.DATA_SOURCE === "http" && process.env.API_BASE_URL ? `${process.env.API_BASE_URL.replace(/\/$/, "")}/v1/auth` : null;
}

export async function forward(path: string, body: unknown, req: Request): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${upstreamAuth()}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json", ...(req.headers.get("origin") ? { origin: req.headers.get("origin")! } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}
