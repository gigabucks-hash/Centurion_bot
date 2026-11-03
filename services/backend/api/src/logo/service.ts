// Logo service: cache lookup, single-flight refresh per mint, bounded concurrency (fetch + transcode).
import { LogoCache, type MetaOk } from "./cache.ts";
import type { LogoConfig } from "./config.ts";
import { METAPLEX_PROGRAM, imageFromJson, jsonRpc, metadataPda, parseMetadataUri, rewriteUri, type RpcClient } from "./metadata.ts";
import { FetchError, safeFetch, type SafeFetchOptions } from "./ssrf.ts";
import { TranscodeError, candidates, transcode, type LogoFormat, type LogoSize } from "./transcode.ts";
import { MemoryLogoStore, type LogoStore } from "./store.ts";

export type LogoResult =
  | { ok: true; body: Buffer; etag: string; logoHash: string; file: string }
  | { ok: false; kind: "not_found" | "rejected"; reason: string };

/** Moderation hook point (no NSFW/ML classifier in the MVP): runs on the re-encoded outputs before they are
 *  cached; return a reason code to reject (422 LOGO_REJECTED {reason}). */
export type LogoModerationHook = (mint: string, files: ReadonlyMap<string, Buffer>) => Promise<string | null>;

/** Reasons answered 422 LOGO_REJECTED (size, format, SVG, decode, moderation); everything else is 404. */
export const REJECT_REASONS: ReadonlySet<string> = new Set([
  "svg_rejected", "unsupported_format", "too_large", "too_large_input", "too_large_dimensions", "output_too_large",
  "decode_failed", "empty", "blocked", "moderation",
]);

class Semaphore {
  private n: number;
  private q: (() => void)[] = [];
  constructor(n: number) {
    this.n = n;
  }
  async run<T>(f: () => Promise<T>): Promise<T> {
    if (this.n > 0) this.n--;
    else await new Promise<void>((r) => this.q.push(r));
    try {
      return await f();
    } finally {
      const next = this.q.shift();
      if (next) next();
      else this.n++;
    }
  }
}

/** Raster magic only (the transcoder re-checks); SVG/HTML/JSON are not images here. */
export function isRasterMagic(b: Buffer): boolean {
  return (
    b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ||
    (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
    b.subarray(0, 6).toString("latin1") === "GIF87a" ||
    b.subarray(0, 6).toString("latin1") === "GIF89a" ||
    (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP")
  );
}

const TRANSIENT = new Set(["rpc_unavailable", "timeout", "network", "dns_failed", "http_5xx", "transcoder_unavailable", "transcode_timeout"]);

export interface LogoServiceOptions {
  rpc?: RpcClient;
  store?: LogoStore;
  moderation?: LogoModerationHook;
  /** Tests only: extra safeFetch options (resolver, address policy, ports). */
  fetchOverrides?: Partial<SafeFetchOptions>;
  now?: () => number;
}

export class LogoService {
  readonly cfg: LogoConfig;
  readonly cache: LogoCache;
  private readonly rpc: RpcClient;
  readonly store: LogoStore;
  private readonly moderation: LogoModerationHook | null;
  private readonly sem: Semaphore;
  private readonly inflight = new Map<string, Promise<void>>();
  private readonly fetchOpts: Partial<SafeFetchOptions>;
  private readonly now: () => number;
  /** Counters (tests/metrics). */
  stats = { refreshes: 0, rpcCalls: 0, fetches: 0, transcodes: 0 };

  constructor(cfg: LogoConfig, o: LogoServiceOptions = {}) {
    this.cfg = cfg;
    this.cache = new LogoCache(cfg.cacheDir);
    this.rpc = o.rpc ?? jsonRpc(cfg.rpcUrl, cfg.totalTimeoutMs);
    this.store = o.store ?? new MemoryLogoStore();
    this.moderation = o.moderation ?? null;
    this.sem = new Semaphore(cfg.concurrency);
    this.fetchOpts = o.fetchOverrides ?? {};
    this.now = o.now ?? Date.now;
  }

  /**
   * Serve size `size` in `fmt` for `mint` (nearest available size when the exact one was dropped for size).
   * `cold` is awaited before any outbound work (rate limits for cache misses; it may throw).
   */
  async get(mint: string, size: LogoSize, fmt: LogoFormat, cold: () => Promise<void>): Promise<LogoResult> {
    const file = candidates(size, fmt);
    if (await this.store.isBlocked(mint)) return { ok: false, kind: "rejected", reason: "blocked" };
    const t = this.now();
    const meta = await this.cache.meta(mint);
    if (meta?.status === "ok" && t - meta.at < this.cfg.ttlS * 1000) return this.read(mint, file, meta);
    if (meta?.status === "miss" && meta.until > t) return { ok: false, kind: meta.kind ?? "not_found", reason: meta.reason };
    await cold();
    await this.refreshOnce(mint, meta?.status === "ok" ? meta : null);
    const m2 = await this.cache.meta(mint);
    if (m2?.status === "ok") return this.read(mint, file, m2);
    return { ok: false, kind: m2?.status === "miss" ? m2.kind : "not_found", reason: m2?.status === "miss" ? m2.reason : "internal" };
  }

  private async read(mint: string, files: string[], meta: MetaOk): Promise<LogoResult> {
    for (const file of files) {
      const etag = meta.etags[file];
      if (!etag) continue;
      const body = await this.cache.file(mint, file);
      if (body) return { ok: true, body, etag, logoHash: meta.logo_hash, file };
    }
    return { ok: false, kind: "not_found", reason: "no_file" };
  }

  private refreshOnce(mint: string, stale: MetaOk | null): Promise<void> {
    let p = this.inflight.get(mint);
    if (!p) {
      p = this.sem.run(() => this.refresh(mint, stale)).finally(() => this.inflight.delete(mint));
      this.inflight.set(mint, p);
    }
    return p;
  }

  private fo(maxBytes: number): SafeFetchOptions {
    return {
      maxBytes,
      connectTimeoutMs: this.cfg.connectTimeoutMs,
      totalTimeoutMs: this.cfg.totalTimeoutMs,
      maxRedirects: 3,
      ...this.fetchOpts,
    };
  }

  private async fetchFirst(urls: string[], maxBytes: number): Promise<Buffer> {
    let last: unknown = new FetchError("bad_url", "no candidates");
    for (const u of urls.slice(0, 4)) {
      try {
        this.stats.fetches++;
        return (await safeFetch(u, this.fo(maxBytes))).body;
      } catch (e) {
        last = e;
        // a blocked/invalid URL is not retried on another gateway; network errors are
        if (e instanceof FetchError && !["timeout", "network", "http_status", "dns_failed"].includes(e.code)) break;
      }
    }
    throw last;
  }

  private async refresh(mint: string, stale: MetaOk | null): Promise<void> {
    this.stats.refreshes++;
    let reason: string;
    try {
      const bytes = await this.resolveImageBytes(mint);
      const dir = await this.cache.scratch();
      try {
        this.stats.transcodes++;
        const files = await transcode(this.cfg.transcoderBin, bytes, dir, this.cfg.transcodeTimeoutMs);
        const verdict = this.moderation ? await this.moderation(mint, files) : null;
        if (verdict !== null) {
          console.warn(`logo ${mint.slice(0, 8)}…: moderation hook rejected (${String(verdict).slice(0, 40)})`);
          throw new Reason("moderation");
        }
        const meta = await this.cache.putOk(mint, dir, files, this.now());
        await this.store.record(mint, "ok", meta.logo_hash, null, null);
        return;
      } catch (e) {
        await this.cache.dropScratch(dir);
        throw e;
      }
    } catch (e) {
      reason = reasonOf(e);
    }
    const t = this.now();
    const ttl = TRANSIENT.has(reason) ? Math.min(this.cfg.negativeTtlS, 300) : this.cfg.negativeTtlS;
    const kind = REJECT_REASONS.has(reason) ? "rejected" : "not_found";
    if (stale && kind === "not_found") {
      await this.cache.extend(mint, stale, t, ttl, this.cfg.ttlS); // origin flaky: keep serving the old logo
    } else {
      await this.cache.putMiss(mint, kind, reason, t, ttl);
      await this.store.record(mint, kind, null, reason, new Date(t + ttl * 1000));
    }
    console.warn(`logo ${mint.slice(0, 8)}…: unavailable (${reason})`); // never the untrusted URL
  }

  private async resolveImageBytes(mint: string): Promise<Buffer> {
    let acct;
    try {
      this.stats.rpcCalls++;
      acct = await this.rpc.getAccount(metadataPda(mint));
    } catch {
      throw new Reason("rpc_unavailable");
    }
    if (!acct || acct.owner !== METAPLEX_PROGRAM) throw new Reason("no_metadata");
    const uri = parseMetadataUri(acct.data, mint);
    if (!uri) throw new Reason("no_uri");
    const first = rewriteUri(uri, this.cfg.ipfsGateways, this.cfg.arweaveGateways);
    if (first.length === 0) throw new Reason("bad_uri");
    // the metadata URI is usually JSON, sometimes the image itself
    const doc = await this.fetchFirst(first, this.cfg.maxBytes);
    if (isRasterMagic(doc)) return doc;
    if (doc.length > this.cfg.maxJsonBytes) throw new Reason("too_large");
    const image = imageFromJson(doc);
    if (!image) throw new Reason(looksSvg(doc) ? "svg_rejected" : "no_image");
    const second = rewriteUri(image, this.cfg.ipfsGateways, this.cfg.arweaveGateways);
    if (second.length === 0) throw new Reason("bad_image_uri");
    const img = await this.fetchFirst(second, this.cfg.maxBytes);
    if (!isRasterMagic(img)) throw new Reason(looksSvg(img) ? "svg_rejected" : "unsupported_format");
    return img;
  }
}

class Reason extends Error {}

function looksSvg(b: Buffer): boolean {
  return /<svg[\s>]/i.test(b.subarray(0, 4096).toString("latin1"));
}

function reasonOf(e: unknown): string {
  if (e instanceof Reason) return e.message;
  if (e instanceof TranscodeError) return e.code;
  if (e instanceof FetchError) {
    if (e.code === "http_status" && /: 5\d\d$/.test(e.message)) return "http_5xx";
    return e.code;
  }
  return "internal";
}
