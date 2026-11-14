import { timingSafeEqual } from "node:crypto";

/** Compare two strings without leaking the matching prefix through timing. */
export function tokenEquals(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  const n = Math.max(a.length, b.length, 1);
  const left = Buffer.alloc(n);
  const right = Buffer.alloc(n);
  a.copy(left);
  b.copy(right);
  return a.length === b.length && timingSafeEqual(left, right);
}

export function bearerMatches(header: string, token: string): boolean {
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    tokenEquals(header, `${prefix}${token}`);
    return false;
  }
  return tokenEquals(header.slice(prefix.length), token);
}

export function loopbackHost(hostHeader: string): boolean {
  const trimmed = hostHeader.trim().toLowerCase();
  const host = trimmed.startsWith("[")
    ? trimmed.slice(1, trimmed.indexOf("]"))
    : trimmed.replace(/:\d+$/, "");
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function loopbackOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "::1");
  } catch {
    return false;
  }
}

/**
 * A browser on another site must not call the local routes.
 * Node clients (the MCP process) send no Origin and no Sec-Fetch-Site.
 */
export function localWriteAllowed(req: Request): boolean {
  const host = req.headers.get("host") ?? "";
  if (!loopbackHost(host)) return false;
  const origin = req.headers.get("origin");
  if (origin && !loopbackOrigin(origin)) return false;
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  return true;
}
