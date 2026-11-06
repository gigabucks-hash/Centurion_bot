/**
 * Reverse proxy for the browser-side BFF calls when DATA_SOURCE=http.
 *
 * The web app's client components already speak the contract under `/api/v1/workspaces/{ws}/…`; in mock mode those
 * paths are answered in-process. In http mode the proxy.ts rewrite sends the same calls here, and this route forwards
 * them to the paper backend with:
 *  - the session JWT from the httpOnly `centurion_at` cookie (the browser never sees or sends it),
 *  - the workspace id from `centurion_ws` (the backend created it at first sign-in), not the URL's placeholder,
 *  - only the headers the contract uses (If-Match, Idempotency-Key, Content-Type).
 *
 * Response bodies stream through unchanged, so `/events/stream` stays a live SSE response.
 */
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, WORKSPACE_COOKIE } from "@/lib/auth/cookies";

const base = () => (process.env.API_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");

/** The web app has no challenge endpoint of its own; practice decisions only record hold_duration_ms. */
function localChallenge() {
  const ts = new Date();
  return Response.json({
    data: { challenge_id: randomUUID(), challenge: `local-${randomUUID()}`, expires_at: new Date(ts.getTime() + 120_000).toISOString() },
    server_now: ts.toISOString(),
  });
}

async function forward(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const jar = await cookies();
  const { path } = await ctx.params;
  const segments = [...path];
  if (segments[0] === "api") segments.shift();

  // /api/backend/v1/workspaces/<placeholder>/<rest>
  if (segments[0] === "v1" && segments[1] === "workspaces") segments[2] = jar.get(WORKSPACE_COOKIE)?.value ?? segments[2];
  let rest = segments.slice(3).join("/");
  if (rest === "overview") rest = "portfolio/overview";
  if (rest === "confirmations/challenge") return localChallenge();

  const target = new URL(`${base()}/${segments.join("/")}`);
  for (const [k, v] of new URL(req.url).searchParams) target.searchParams.append(k, v);

  const token = jar.get(ACCESS_COOKIE)?.value;
  const headers: Record<string, string> = { accept: req.headers.get("accept") ?? "application/json" };
  for (const h of ["content-type", "if-match", "idempotency-key", "if-none-match", "last-event-id"]) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  if (token) headers.authorization = `Bearer ${token}`;

  const method = req.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer();
  const res = await fetch(target, { method, headers, body, cache: "no-store" });

  const out = new Headers();
  for (const h of ["content-type", "etag", "idempotent-replayed", "retry-after"]) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("cache-control", "no-store");
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) out.set("x-accel-buffering", "no");
  return new Response(res.body, { status: res.status, headers: out });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
export const PUT = forward;
export const dynamic = "force-dynamic";