// SSRF-hardened fetch for untrusted token-metadata URLs (docs/LOGO_PROXY.md §SSRF).
// - http/https only (ipfs:// and ar:// are rewritten to pinned gateways before this), no userinfo, ports 80/443.
// - DNS is resolved here; EVERY returned address must be public (strict), then the socket connects to that
//   vetted IP (Host header / TLS SNI + certificate check keep the hostname). No second lookup can happen, so
//   DNS rebinding between check and connect is impossible.
// - Redirects are followed manually (max 3), each hop re-validated from scratch.
// - No compression (Accept-Encoding: identity), byte cap while streaming, connect + total timeouts.
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { lookup } from "node:dns/promises";

export type FetchErrorCode =
  | "bad_url" | "bad_scheme" | "bad_port" | "userinfo" | "blocked_ip" | "dns_failed" | "too_many_redirects"
  | "http_status" | "too_large" | "timeout" | "network";

export class FetchError extends Error {
  readonly code: FetchErrorCode;
  constructor(code: FetchErrorCode, msg?: string) {
    super(msg ? `${code}: ${msg}` : code);
    this.code = code;
  }
}

// ---- address policy ---------------------------------------------------------------------------------------
const V4_BLOCK: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];
// IPv6: only global unicast 2000::/3 is allowed at all (this excludes ::, ::1, ::ffff:0:0/96 mapped v4,
// 64:ff9b::/96 NAT64, fc00::/7 ULA incl. fd00:ec2::254, fe80::/10, fec0::/10, ff00::/8 multicast, 100::/64),
// minus these special ranges inside 2000::/3:
const V6_BLOCK_IN_GLOBAL: [string, number][] = [
  ["2001::", 32], // Teredo (embeds v4)
  ["2001:2::", 48], // benchmarking
  ["2001:10::", 28], // ORCHID
  ["2001:20::", 28], // ORCHIDv2
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 (embeds v4)
  ["3fff::", 20], // documentation (RFC 9637)
];

const v4Block = new BlockList();
for (const [a, p] of V4_BLOCK) v4Block.addSubnet(a, p, "ipv4");
v4Block.addAddress("255.255.255.255", "ipv4");
const v6Global = new BlockList();
v6Global.addSubnet("2000::", 3, "ipv6");
const v6Block = new BlockList();
for (const [a, p] of V6_BLOCK_IN_GLOBAL) v6Block.addSubnet(a, p, "ipv6");

/** True when `ip` is a public unicast address we may connect to. Anything unparsable is blocked. */
export function isPublicIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return !v4Block.check(ip, "ipv4");
  if (fam === 6) {
    const bare = ip.replace(/^\[|\]$/g, "").split("%")[0]!; // zone ids are link-local anyway
    if (isIP(bare) !== 6) return false;
    return v6Global.check(bare, "ipv6") && !v6Block.check(bare, "ipv6");
  }
  return false;
}

// ---- fetch ------------------------------------------------------------------------------------------------
export interface SafeFetchOptions {
  maxBytes: number;
  connectTimeoutMs: number;
  totalTimeoutMs: number;
  maxRedirects?: number;
  accept?: string;
  /** Tests only: resolver (default: OS lookup, all addresses). */
  resolve?: (host: string) => Promise<string[]>;
  /** Tests only: address policy (default isPublicIp). */
  allowIp?: (ip: string) => boolean;
  /** Tests only: allowed ports (default 80/443); null = any. */
  ports?: ReadonlySet<number> | null;
}

export interface SafeResponse {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
  /** Every connected address, in hop order (for audit/tests). */
  connected: string[];
}

const DEFAULT_PORTS: ReadonlySet<number> = new Set([80, 443]);
const UA = "CenturionTrade-LogoProxy/1 (+no-cookies)";

async function osResolve(host: string): Promise<string[]> {
  const rs = await lookup(host, { all: true, verbatim: true });
  return rs.map((r) => r.address);
}

interface Vetted {
  url: URL;
  ip: string;
  port: number;
}

async function vet(raw: string, o: SafeFetchOptions): Promise<Vetted> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError("bad_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchError("bad_scheme", url.protocol);
  if (url.username || url.password) throw new FetchError("userinfo");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  const ports = o.ports === undefined ? DEFAULT_PORTS : o.ports;
  if (ports !== null && !ports.has(port)) throw new FetchError("bad_port", String(port));
  const allow = o.allowIp ?? isPublicIp;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addrs: string[];
  if (isIP(host)) {
    addrs = [host];
  } else {
    if (!/^[A-Za-z0-9.-]{1,253}$/.test(host) || host.endsWith(".") && host.length === 1) throw new FetchError("bad_url", "host");
    try {
      addrs = await (o.resolve ?? osResolve)(host);
    } catch {
      throw new FetchError("dns_failed");
    }
    if (addrs.length === 0) throw new FetchError("dns_failed");
  }
  // strict: one private answer poisons the whole set (no "pick the public one" games)
  for (const a of addrs) if (!allow(a)) throw new FetchError("blocked_ip", a);
  return { url, ip: addrs[0]!, port };
}

function once(v: Vetted, o: SafeFetchOptions, deadline: number): Promise<{ status: number; location: string | null; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const isHttps = v.url.protocol === "https:";
    const hostHeader = v.url.port ? `${v.url.hostname}:${v.url.port}` : v.url.hostname;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new FetchError("timeout", "total"));
    const opts: https.RequestOptions = {
      host: v.ip, // connect to the vetted address only
      family: isIP(v.ip),
      port: v.port,
      method: "GET",
      path: (v.url.pathname || "/") + v.url.search,
      agent: false,
      headers: {
        Host: hostHeader,
        "User-Agent": UA,
        Accept: o.accept ?? "image/png,image/jpeg,image/gif,image/webp,application/json;q=0.9",
        "Accept-Encoding": "identity",
        Connection: "close",
      },
      // never resolve again (belt and braces: host is already an IP literal)
      lookup: (_h: string, lo: { all?: boolean }, cb: (...a: unknown[]) => void) => {
        if (lo?.all) cb(null, [{ address: v.ip, family: isIP(v.ip) }]);
        else cb(null, v.ip, isIP(v.ip));
      },
    } as https.RequestOptions;
    if (isHttps) {
      const name = v.url.hostname.replace(/^\[|\]$/g, "");
      if (!isIP(name)) opts.servername = name; // SNI + certificate hostname check against the URL host
    }
    let done = false;
    const fail = (e: FetchError) => {
      if (done) return;
      done = true;
      clearTimeout(total);
      clearTimeout(connect);
      req.destroy();
      reject(e);
    };
    const total = setTimeout(() => fail(new FetchError("timeout", "total")), remaining);
    const connect = setTimeout(() => fail(new FetchError("timeout", "connect")), Math.min(o.connectTimeoutMs, remaining));
    const req = (isHttps ? https : http).request(opts, (res) => {
      const status = res.statusCode ?? 0;
      const location = typeof res.headers.location === "string" ? res.headers.location : null;
      const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
      if (status >= 300 && status < 400) {
        res.resume();
        done = true;
        clearTimeout(total);
        req.destroy();
        return resolve({ status, location, contentType, body: Buffer.alloc(0) });
      }
      if (status !== 200) return fail(new FetchError("http_status", String(status)));
      const declared = Number(res.headers["content-length"] ?? NaN);
      if (Number.isFinite(declared) && declared > o.maxBytes) return fail(new FetchError("too_large", "content-length"));
      const enc = String(res.headers["content-encoding"] ?? "identity").toLowerCase();
      if (enc !== "identity" && enc !== "") return fail(new FetchError("network", "content-encoding"));
      const chunks: Buffer[] = [];
      let n = 0;
      res.on("data", (c: Buffer) => {
        n += c.length;
        if (n > o.maxBytes) return fail(new FetchError("too_large", "body"));
        chunks.push(c);
      });
      res.on("end", () => {
        if (done) return;
        done = true;
        clearTimeout(total);
        resolve({ status, location, contentType, body: Buffer.concat(chunks) });
      });
      res.on("error", () => fail(new FetchError("network")));
    });
    req.on("socket", (s) => {
      s.once(isHttps ? "secureConnect" : "connect", () => clearTimeout(connect));
    });
    req.on("error", (e) => fail(new FetchError("network", (e as NodeJS.ErrnoException).code ?? "error")));
    req.end();
  });
}

/** GET `raw` with the policy above. Returns only a 200 body. */
export async function safeFetch(raw: string, o: SafeFetchOptions): Promise<SafeResponse> {
  const max = o.maxRedirects ?? 3;
  const deadline = Date.now() + o.totalTimeoutMs;
  const connected: string[] = [];
  let current = raw;
  for (let hop = 0; ; hop++) {
    const v = await vet(current, o);
    connected.push(v.ip);
    const r = await once(v, o, deadline);
    if (r.status >= 300 && r.status < 400) {
      if (![301, 302, 303, 307, 308].includes(r.status) || !r.location) throw new FetchError("http_status", String(r.status));
      if (hop >= max) throw new FetchError("too_many_redirects");
      let next: URL;
      try {
        next = new URL(r.location, v.url);
      } catch {
        throw new FetchError("bad_url", "location");
      }
      if (v.url.protocol === "https:" && next.protocol === "http:") throw new FetchError("bad_scheme", "https->http downgrade");
      current = next.href;
      continue;
    }
    return { url: v.url.href, status: r.status, contentType: r.contentType, body: r.body, connected };
  }
}
