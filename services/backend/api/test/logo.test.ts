// Coin-logo proxy: SSRF policy, fetch limits, metadata resolution, transcoding, cache, route headers.
// Local fixtures (crates/logo/tests/fixtures) and a local HTTP server only: no internet.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { FetchError, isPublicIp, safeFetch, type SafeFetchOptions } from "../src/logo/ssrf.ts";
import { METAPLEX_PROGRAM, findProgramAddress, imageFromJson, isOnCurve, metadataPda, parseMetadataUri, rewriteUri, type RpcClient } from "../src/logo/metadata.ts";
import { LogoService, type LogoResult } from "../src/logo/service.ts";
import { MemoryLogoStore } from "../src/logo/store.ts";
import { startHarness, call, token, WS, POS, OWNER } from "./helpers.ts";
import { loadLogoConfig, logoUrl, setLogoWire, LogoConfigError, type LogoConfig } from "../src/logo/config.ts";
import { registerLogos, IMMUTABLE } from "../src/routes_logos.ts";
import { Router, makeCtx, sendError } from "../src/http.ts";
import { ApiError } from "../src/errors.ts";
import { b58decode, b58encode } from "../src/base58.ts";
import { RateLimiter } from "../src/ratelimit.ts";
import type { Deps } from "../src/deps.ts";

const backend = fileURLToPath(new URL("../..", import.meta.url));
const FX = `${backend}crates/logo/tests/fixtures/`;
const BIN = `${backend}target/release/centurion-logo`;
const fx = (n: string) => readFileSync(FX + n);
const MARK = Buffer.from("CENTURION_EXIF_MARKER_7f3a");

// ---- local origin server --------------------------------------------------------------------------------
let srv: Server;
let port = 0;
const hits: { path: string; host: string }[] = [];
const routes = new Map<string, (req: IncomingMessage, res: ServerResponse) => void>();
const img = (b: Buffer, type = "image/png") => (_q: IncomingMessage, s: ServerResponse) => {
  s.writeHead(200, { "Content-Type": type, "Content-Length": b.length });
  s.end(b);
};
const json = (o: unknown) => img(Buffer.from(JSON.stringify(o)), "application/json");
const redirect = (to: string, code = 302) => (_q: IncomingMessage, s: ServerResponse) => {
  s.writeHead(code, { Location: to });
  s.end();
};

before(async () => {
  if (!existsSync(BIN)) execFileSync("cargo", ["build", "--offline", "--release", "-p", "logo"], { cwd: backend, stdio: "ignore" });
  srv = createServer((req, res) => {
    hits.push({ path: req.url ?? "", host: req.headers.host ?? "" });
    const h = routes.get((req.url ?? "").split("?")[0]!);
    if (h) return h(req, res);
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  port = (srv.address() as AddressInfo).port;
});
after(() => {
  srv.closeAllConnections();
  srv.close();
});

// Test address policy: 127.0.0.1 plays the "public internet" origin; every real private/loopback range,
// including 127.0.0.2, stays blocked by the production isPublicIp().
const allowIp = (ip: string) => ip === "127.0.0.1" || isPublicIp(ip);
let rebindCalls = 0;
const resolve = async (host: string): Promise<string[]> => {
  switch (host) {
    case "good.test": return ["127.0.0.1"];
    case "evil.test": return ["10.0.0.5"];
    case "meta.test": return ["169.254.169.254"];
    case "mixed.test": return ["127.0.0.1", "192.168.1.10"];
    case "v6loop.test": return ["::1"];
    case "mapped.test": return ["::ffff:127.0.0.1"];
    case "rebind.test": return rebindCalls++ === 0 ? ["127.0.0.1"] : ["127.0.0.2"];
    default: throw new Error("NXDOMAIN");
  }
};
const opts = (o: Partial<SafeFetchOptions> = {}): SafeFetchOptions => ({
  maxBytes: 2 * 1024 * 1024, connectTimeoutMs: 1000, totalTimeoutMs: 2000, resolve, allowIp, ports: null, ...o,
});
const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "ok";
  } catch (e) {
    assert.ok(e instanceof FetchError, String(e));
    return e.code;
  }
};
const G = () => `http://good.test:${port}`;

// ---- address policy ---------------------------------------------------------------------------------------
test("isPublicIp blocks private, loopback, link-local, CGNAT, multicast, metadata (v4 + v6)", () => {
  const blocked = [
    "0.0.0.0", "10.1.2.3", "100.64.0.1", "100.127.255.254", "127.0.0.1", "127.9.9.9", "169.254.169.254", "169.254.0.1",
    "172.16.0.1", "172.31.255.255", "192.0.0.1", "192.0.2.1", "192.168.0.1", "198.18.0.1", "198.51.100.7", "203.0.113.9",
    "224.0.0.1", "239.255.255.250", "240.0.0.1", "255.255.255.255",
    "::", "::1", "fe80::1", "fe80::1%eth0", "fc00::1", "fd00:ec2::254", "ff02::1", "ff05::2", "::ffff:127.0.0.1",
    "::ffff:10.0.0.1", "::ffff:169.254.169.254", "64:ff9b::a9fe:a9fe", "2002:a9fe:a9fe::1", "2001::1", "2001:db8::1",
    "100::1", "fec0::1", "3fff::1",
    "localhost", "not-an-ip", "", "1.2.3", "01.2.3.4",
  ];
  for (const ip of blocked) assert.equal(isPublicIp(ip), false, ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "104.16.0.1", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "2a00:1450:4001::1"]) {
    assert.equal(isPublicIp(ip), true, ip);
  }
});

test("safeFetch: literal private / loopback targets are refused before connecting", async () => {
  const before = hits.length;
  const prod = { resolve, ports: null } as const; // production address policy
  assert.equal(await code(safeFetch(`http://127.0.0.1:${port}/x`, opts({ ...prod, allowIp: undefined }))), "blocked_ip");
  assert.equal(await code(safeFetch(`http://[::1]:${port}/x`, opts({ allowIp: undefined }))), "blocked_ip");
  assert.equal(await code(safeFetch(`http://169.254.169.254/latest/meta-data/`, opts())), "blocked_ip");
  assert.equal(await code(safeFetch(`http://[::ffff:7f00:1]:${port}/`, opts())), "blocked_ip");
  assert.equal(await code(safeFetch(`http://2130706433:${port}/`, opts({ allowIp: undefined }))), "blocked_ip"); // 127.0.0.1 as int
  assert.equal(hits.length, before, "no request reached the server");
});

test("safeFetch: hostnames resolving to private addresses (any answer) are refused", async () => {
  for (const h of ["evil.test", "meta.test", "mixed.test", "v6loop.test", "mapped.test"]) {
    assert.equal(await code(safeFetch(`http://${h}:${port}/x`, opts())), "blocked_ip", h);
  }
  assert.equal(await code(safeFetch(`http://nx.test/x`, opts())), "dns_failed");
});

test("safeFetch: scheme, userinfo and port rules", async () => {
  for (const u of ["file:///etc/passwd", "ftp://good.test/x", "gopher://good.test/", "data:image/png;base64,AA==", "ipfs://bafy", "javascript:alert(1)"]) {
    assert.equal(await code(safeFetch(u, opts())), "bad_scheme", u);
  }
  assert.equal(await code(safeFetch(`http://user:pw@good.test:${port}/`, opts())), "userinfo");
  assert.equal(await code(safeFetch(`http://good.test:22/`, opts({ ports: undefined }))), "bad_port");
  assert.equal(await code(safeFetch(`http://good.test:${port}/`, opts({ ports: undefined }))), "bad_port");
});

test("safeFetch: redirects re-checked per hop (private targets, max 3, non-http schemes)", async () => {
  routes.set("/png", img(fx("alpha_text.png")));
  routes.set("/r-meta", redirect("http://169.254.169.254/latest/meta-data/iam"));
  routes.set("/r-evil", redirect(`http://evil.test:${port}/png`, 307));
  routes.set("/r-loop6", redirect(`http://[::1]:${port}/png`, 301));
  routes.set("/r-file", redirect("file:///etc/passwd"));
  routes.set("/r1", redirect("/r2"));
  routes.set("/r2", redirect("/r3"));
  routes.set("/r3", redirect("/png"));
  routes.set("/r0", redirect("/r1"));
  for (const p of ["/r-meta", "/r-evil", "/r-loop6"]) {
    assert.equal(await code(safeFetch(`${G()}${p}`, opts())), "blocked_ip", p);
  }
  assert.equal(await code(safeFetch(`${G()}/r-file`, opts())), "bad_scheme");
  const ok = await safeFetch(`${G()}/r1`, opts()); // 3 redirects: allowed
  assert.deepEqual(ok.connected, ["127.0.0.1", "127.0.0.1", "127.0.0.1", "127.0.0.1"]);
  assert.equal(await code(safeFetch(`${G()}/r0`, opts())), "too_many_redirects"); // 4
  assert.equal(hits.some((h) => h.path.includes("meta-data")), false);
});

test("safeFetch: DNS rebinding cannot swap the address after the check", async () => {
  routes.set("/rb", (q, s) => {
    s.writeHead(200, { "Content-Type": "image/png" });
    s.end(fx("alpha_text.png"));
  });
  routes.set("/rb-again", redirect(`http://rebind.test:${port}/rb`));
  rebindCalls = 0;
  const r = await safeFetch(`http://rebind.test:${port}/rb`, opts());
  assert.equal(rebindCalls, 1, "resolved exactly once for the hop");
  assert.deepEqual(r.connected, ["127.0.0.1"]);
  assert.equal(hits.at(-1)!.host, `rebind.test:${port}`, "Host header keeps the name; socket used the vetted IP");
  // a redirect back to the same name is a new hop: re-resolved, now private -> refused
  rebindCalls = 0;
  assert.equal(await code(safeFetch(`${G()}/rb-again`, opts())), "ok"); // first answer still public
  assert.equal(await code(safeFetch(`${G()}/rb-again`, opts())), "blocked_ip"); // second answer private
});

test("safeFetch: size cap (declared and streamed), content-encoding, timeouts", async () => {
  routes.set("/big-declared", (_q, s) => {
    s.writeHead(200, { "Content-Length": String(3 * 1024 * 1024) });
    s.end();
  });
  routes.set("/big-chunked", (_q, s) => {
    s.writeHead(200, { "Content-Type": "image/png" });
    const chunk = Buffer.alloc(256 * 1024, 1);
    let n = 0;
    const w = () => {
      while (n < 12) {
        n++;
        if (!s.write(chunk)) return void s.once("drain", w);
      }
      s.end();
    };
    w();
  });
  routes.set("/gz", (_q, s) => {
    s.writeHead(200, { "Content-Encoding": "gzip" });
    s.end("x");
  });
  routes.set("/hang", () => {});
  routes.set("/500", (_q, s) => {
    s.writeHead(500);
    s.end();
  });
  assert.equal(await code(safeFetch(`${G()}/big-declared`, opts())), "too_large");
  assert.equal(await code(safeFetch(`${G()}/big-chunked`, opts())), "too_large");
  assert.equal(await code(safeFetch(`${G()}/gz`, opts())), "network");
  assert.equal(await code(safeFetch(`${G()}/500`, opts())), "http_status");
  const t0 = Date.now();
  assert.equal(await code(safeFetch(`${G()}/hang`, opts({ totalTimeoutMs: 300 }))), "timeout");
  assert.ok(Date.now() - t0 < 1500);
});

// ---- metadata -------------------------------------------------------------------------------------------
const MINT = "So11111111111111111111111111111111111111112";
const mintN = (i: number) => b58encode(Buffer.alloc(32, i + 7));

function metadataAccount(mint: string, uri: string): Buffer {
  const s = (v: string, pad: number) => {
    const b = Buffer.alloc(4 + pad);
    b.writeUInt32LE(pad, 0);
    Buffer.from(v).copy(b, 4);
    return b;
  };
  return Buffer.concat([Buffer.from([4]), Buffer.alloc(32, 9), b58decode(mint)!, s("Name", 32), s("SYM", 10), s(uri, 200), Buffer.alloc(30)]);
}

test("metadata PDA is off-curve and deterministic; account parsing", () => {
  const pda = metadataPda(MINT);
  assert.equal(pda, metadataPda(MINT));
  assert.equal(isOnCurve(b58decode(pda)!), false);
  assert.equal(isOnCurve(b58decode("11111111111111111111111111111111")!), true); // y=0 is a valid point
  const { bump } = findProgramAddress([Buffer.from("metadata")], b58decode(METAPLEX_PROGRAM)!);
  assert.ok(bump >= 0 && bump <= 255);
  const acc = metadataAccount(MINT, "https://x.test/m.json");
  assert.equal(parseMetadataUri(acc, MINT), "https://x.test/m.json");
  assert.equal(parseMetadataUri(acc, mintN(1)), null, "mint mismatch");
  assert.equal(parseMetadataUri(Buffer.concat([Buffer.from([5]), acc.subarray(1)]), MINT), null, "wrong key");
  assert.equal(parseMetadataUri(acc.subarray(0, 80), MINT), null, "truncated");
});

test("uri rewriting: pinned gateways only for ipfs/ar; other schemes dropped", () => {
  const ipfs = ["https://gw1.example/ipfs/", "https://gw2.example/ipfs/"];
  const ar = ["https://arweave.example/"];
  assert.deepEqual(rewriteUri("ipfs://bafkreiabcdefghij/img.png", ipfs, ar), ["https://gw1.example/ipfs/bafkreiabcdefghij/img.png", "https://gw2.example/ipfs/bafkreiabcdefghij/img.png"]);
  assert.deepEqual(rewriteUri("ipfs://ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG", ipfs, ar), ipfs.map((g) => g + "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"));
  assert.deepEqual(rewriteUri("ar://" + "a".repeat(43), ipfs, ar), ["https://arweave.example/" + "a".repeat(43)]);
  assert.deepEqual(rewriteUri("ipfs://bafkreiabcdefghij/../../etc", ipfs, ar), []);
  assert.deepEqual(rewriteUri("ipfs://bad cid", ipfs, ar), []);
  assert.deepEqual(rewriteUri("ipfs://bafkreiabcdefghij", [], ar), [], "no gateway configured");
  for (const u of ["data:image/svg+xml,<svg>", "javascript:alert(1)", "file:///x", "/relative.png", "", "x".repeat(3000)]) {
    assert.deepEqual(rewriteUri(u, ipfs, ar), [], u.slice(0, 20));
  }
  assert.deepEqual(rewriteUri(" https://cdn.example/a.png ", ipfs, ar), ["https://cdn.example/a.png"]);
  assert.equal(imageFromJson(Buffer.from('{"image":"ipfs://x"}')), "ipfs://x");
  assert.equal(imageFromJson(Buffer.from('{"image":7}')), null);
  assert.equal(imageFromJson(Buffer.from("[1]")), null);
});

// ---- service (cache, negative cache, transcoding) ---------------------------------------------------------
function cfgFor(dir: string, over: Partial<LogoConfig> = {}): LogoConfig {
  return {
    ...loadLogoConfig({}),
    enabled: true,
    rpcUrl: "http://unused.invalid",
    cacheDir: dir,
    transcoderBin: BIN,
    ipfsGateways: [`http://good.test:${port}/ipfs/`],
    arweaveGateways: [],
    connectTimeoutMs: 1000,
    totalTimeoutMs: 2000,
    ...over,
  };
}

class FakeRpc implements RpcClient {
  uris = new Map<string, string>();
  calls = 0;
  async getAccount(address: string) {
    this.calls++;
    for (const [mint, uri] of this.uris) if (metadataPda(mint) === address) return { owner: METAPLEX_PROGRAM, data: metadataAccount(mint, uri) };
    return null;
  }
}

function svc(over: Partial<LogoConfig> = {}, now?: () => number, moderation?: (m: string, f: ReadonlyMap<string, Buffer>) => Promise<string | null>) {
  const dir = mkdtempSync(`${tmpdir()}/logo-test-`);
  const rpc = new FakeRpc();
  const store = new MemoryLogoStore();
  const s = new LogoService(cfgFor(dir, over), { rpc, store, moderation, fetchOverrides: { resolve, allowIp, ports: null }, now });
  return { s, rpc, dir, store };
}
const free = async () => {};
const has = (b: Buffer, n: Buffer) => b.indexOf(n) >= 0;
function okOf(r: LogoResult) {
  assert.ok(r.ok, JSON.stringify(r));
  return r;
}
function failOf(r: LogoResult) {
  assert.ok(!r.ok, "expected failure");
  return r;
}

test("service: metadata JSON -> image, 48/64/96 WebP <= 8 KB, EXIF stripped, store + cache hit", async () => {
  routes.set("/m/jpeg.json", json({ name: "x", image: `${G()}/i/photo.jpg` }));
  routes.set("/i/photo.jpg", img(fx("photo_exif.jpg"), "image/jpeg"));
  const { s, rpc, dir, store } = svc();
  const mint = mintN(1);
  rpc.uris.set(mint, `${G()}/m/jpeg.json`);
  let hash = "";
  for (const n of [48, 64, 96]) {
    const h = okOf(await s.get(mint, n as 48, "webp", free));
    assert.ok(!has(h.body, MARK) && !has(h.body, Buffer.from("Exif")), `${n} metadata stripped`);
    assert.equal(h.body.subarray(8, 12).toString(), "WEBP");
    assert.ok(h.body.length <= 8 * 1024, `${n}: ${h.body.length} bytes`);
    // VP8L header: 14-bit width-1 / height-1 after the signature byte at offset 20
    const bits = h.body.readUInt32LE(21);
    assert.equal((bits & 0x3fff) + 1, n);
    assert.equal(((bits >> 14) & 0x3fff) + 1, n);
    assert.match(h.etag, /^"[A-Za-z0-9_-]{22}"$/);
    hash ||= h.logoHash;
    assert.equal(h.logoHash, hash, "one logo_hash across sizes");
  }
  assert.match(hash, /^[A-Za-z0-9_-]{16}$/);
  assert.deepEqual(store.rows.get(mint), { status: "ok", logoHash: hash, reason: null });
  assert.equal(s.stats.refreshes, 1, "one refresh, then cache hits");
  assert.equal(rpc.calls, 1);
  assert.equal(s.stats.transcodes, 1);
  assert.equal(okOf(await s.get(mint, 128, "webp", free)).file, "128.webp", "1.1.6 size");
  rmSync(dir, { recursive: true, force: true });
});

test("service: ipfs:// metadata and image go through the pinned gateway; single-flight", async () => {
  routes.set("/ipfs/bafkreimetadata0001", json({ image: "ipfs://bafkreiimage00001/logo.png" }));
  routes.set("/ipfs/bafkreiimage00001/logo.png", img(fx("alpha_text.png")));
  const { s, rpc, dir } = svc();
  const mint = mintN(2);
  rpc.uris.set(mint, "ipfs://bafkreimetadata0001");
  const rs = await Promise.all(Array.from({ length: 6 }, () => s.get(mint, 64, "webp", free)));
  assert.ok(rs.every((r) => r.ok && r.body.length > 0));
  assert.equal(s.stats.refreshes, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("service: SVG rejected (never served) and negative-cached; expiry refetches", async () => {
  routes.set("/m/svg.json", json({ image: `${G()}/i/logo.svg` }));
  routes.set("/i/logo.svg", img(fx("logo.svg"), "image/png")); // lies about its type
  let t = 1_000_000;
  const { s, rpc, dir, store } = svc({ negativeTtlS: 60 }, () => t);
  const mint = mintN(3);
  rpc.uris.set(mint, `${G()}/m/svg.json`);
  assert.deepEqual(await s.get(mint, 96, "webp", free), { ok: false, kind: "rejected", reason: "svg_rejected" });
  assert.equal(store.rows.get(mint)?.status, "rejected");
  let colds = 0;
  assert.equal(failOf(await s.get(mint, 96, "webp", async () => void colds++)).reason, "svg_rejected");
  assert.equal(colds, 0, "negative cache hit: no outbound work");
  assert.equal(s.stats.refreshes, 1);
  t += 61_000;
  failOf(await s.get(mint, 96, "webp", async () => void colds++));
  assert.equal(colds, 1);
  assert.equal(s.stats.refreshes, 2, "expired negative entry refetches");
  rmSync(dir, { recursive: true, force: true });
});

test("service: oversize, decompression bomb, private redirect, html, no metadata -> 422 / 404 kinds", async () => {
  routes.set("/i/huge.png", img(Buffer.concat([fx("alpha_text.png"), Buffer.alloc(2 * 1024 * 1024)])));
  routes.set("/i/bomb.png", img(fx("bomb_30000.png")));
  routes.set("/i/bomb.gif", img(fx("bomb_screen.gif"), "image/gif"));
  routes.set("/i/to-private", redirect("http://10.0.0.1/logo.png"));
  routes.set("/i/page.html", img(fx("not_image.html"), "text/html"));
  const cases: [string, string, string][] = [
    ["/i/huge.png", "too_large", "rejected"], ["/i/bomb.png", "too_large_dimensions", "rejected"],
    ["/i/bomb.gif", "too_large_dimensions", "rejected"], ["/i/to-private", "blocked_ip", "not_found"],
    ["/i/page.html", "unsupported_format", "rejected"],
  ];
  const { s, rpc, dir } = svc();
  for (const [i, [path, reason, kind]] of cases.entries()) {
    const mint = mintN(10 + i);
    routes.set(`/m/case${i}.json`, json({ image: `${G()}${path}` }));
    rpc.uris.set(mint, `${G()}/m/case${i}.json`);
    assert.deepEqual(await s.get(mint, 64, "webp", free), { ok: false, kind, reason }, path);
  }
  assert.deepEqual(await s.get(mintN(30), 64, "webp", free), { ok: false, kind: "not_found", reason: "no_metadata" });
  rmSync(dir, { recursive: true, force: true });
});

test("service: blocklist and moderation hook", async () => {
  routes.set("/i/ok.png", img(fx("alpha_text.png")));
  const seen: string[] = [];
  const { s, rpc, dir, store } = svc({}, undefined, async (mint, files) => {
    seen.push(...files.keys());
    return mint === mintN(61) ? "nsfw" : null;
  });
  for (const i of [60, 61, 62]) rpc.uris.set(mintN(i), `${G()}/i/ok.png`);
  okOf(await s.get(mintN(60), 48, "webp", free));
  assert.deepEqual(seen.sort(), ["128.png", "128.webp", "192.png", "192.webp", "48.png", "48.webp", "64.png", "64.webp", "96.png", "96.webp"]);
  assert.deepEqual(await s.get(mintN(61), 48, "webp", free), { ok: false, kind: "rejected", reason: "moderation" });
  store.blocked.add(mintN(60)); // manual blocklist wins over a cached logo
  assert.deepEqual(await s.get(mintN(60), 48, "webp", free), { ok: false, kind: "rejected", reason: "blocked" });
  store.blocked.add(mintN(62));
  const before = s.stats.refreshes;
  assert.equal(failOf(await s.get(mintN(62), 48, "webp", free)).reason, "blocked");
  assert.equal(s.stats.refreshes, before, "blocked mint: no outbound work");
  rmSync(dir, { recursive: true, force: true });
});

test("service: metadata URI that is itself an image; animated GIF; stale kept on failed refresh", async () => {
  routes.set("/i/anim.gif", img(fx("anim.gif"), "image/gif"));
  let t = 5_000_000;
  const { s, rpc, dir } = svc({ ttlS: 60 }, () => t);
  const mint = mintN(40);
  rpc.uris.set(mint, `${G()}/i/anim.gif`);
  const h1 = okOf(await s.get(mint, 48, "webp", free));
  t += 120_000; // positive entry expired, origin now gone
  routes.delete("/i/anim.gif");
  const h2 = okOf(await s.get(mint, 48, "webp", free));
  assert.equal(h2.etag, h1.etag, "stale logo still served");
  assert.equal(s.stats.refreshes, 2);
  okOf(await s.get(mint, 48, "webp", free));
  assert.equal(s.stats.refreshes, 2, "extended entry is fresh again for the negative TTL");
  rmSync(dir, { recursive: true, force: true });
});

// ---- route -----------------------------------------------------------------------------------------------
async function routeServer(service: LogoService | null, cfg: LogoConfig, limiter = new RateLimiter()) {
  const r = new Router();
  const deps = { cfg: { trustProxy: false } } as unknown as Deps;
  registerLogos(r, deps, service ? { service, limiter } : { cfg, limiter });
  const server = createServer(async (req, res) => {
    const ctx = makeCtx(req, res);
    try {
      const m = r.match(req.method ?? "GET", ctx.url.pathname);
      if (!m || m === "method") throw new ApiError("NOT_FOUND");
      ctx.params = m.params;
      await m.handler(ctx);
    } catch (e) {
      sendError(ctx, e instanceof ApiError ? e : new ApiError("INTERNAL"));
    }
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

test("GET /v1/img/coin/{mint}?s=&v=: strict headers, immutable only for current v, ETag/304, errors, rate limit", async () => {
  routes.set("/m/route.json", json({ image: `${G()}/i/still.webp` }));
  routes.set("/i/still.webp", img(fx("still.webp"), "image/webp"));
  routes.set("/m/svg2.json", json({ image: `${G()}/i/logo.svg` }));
  routes.set("/i/logo.svg", img(fx("logo.svg"), "image/svg+xml"));
  const { s, rpc, dir } = svc({ ratePerIpPerMin: 40, coldPerIpPerMin: 3 });
  const mint = mintN(50);
  rpc.uris.set(mint, `${G()}/m/route.json`);
  rpc.uris.set(mintN(53), `${G()}/m/svg2.json`);
  const { base, server } = await routeServer(s, s.cfg);
  const U = (m: string, q: string) => `${base}/v1/img/coin/${m}${q}`;
  try {
    const r = await fetch(U(mint, "?s=64"));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/webp");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("content-security-policy"), "default-src 'none'");
    assert.equal(r.headers.get("cache-control"), "public, max-age=300", "no v: short");
    const hash = r.headers.get("x-logo-hash")!;
    const etag = r.headers.get("etag")!;
    const body = Buffer.from(await r.arrayBuffer());
    assert.equal(body.subarray(8, 12).toString(), "WEBP");
    assert.ok(!has(body, MARK) && body.length <= 8 * 1024);
    const im = await fetch(U(mint, `?s=64&v=${hash}`));
    assert.equal(im.headers.get("cache-control"), IMMUTABLE, "current v: immutable");
    assert.equal(im.headers.get("etag"), etag);
    assert.equal((await fetch(U(mint, "?s=64&v=staleHash123"))).headers.get("cache-control"), "public, max-age=300", "stale v: short");
    assert.notEqual((await fetch(U(mint, `?s=96&v=${hash}`))).headers.get("etag"), etag);
    const c = await fetch(U(mint, "?s=64"), { headers: { "If-None-Match": etag } });
    assert.equal(c.status, 304);
    // PNG fallback: explicit fmt=png, or an Accept without image/webp; 1.1.6 sizes 128/192
    const p1 = await fetch(U(mint, "?s=192&fmt=png"));
    assert.equal(p1.headers.get("content-type"), "image/png");
    assert.equal(p1.headers.get("vary"), null);
    assert.ok(Buffer.from(await p1.arrayBuffer()).subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")));
    const p2 = await fetch(U(mint, "?s=128"), { headers: { Accept: "image/png,image/*;q=0.8" } });
    assert.equal(p2.headers.get("content-type"), "image/png");
    assert.equal(p2.headers.get("vary"), "Accept");
    assert.equal(p2.headers.get("x-logo-size"), "128");
    const w2 = await fetch(U(mint, "?s=128"), { headers: { Accept: "image/avif,image/webp,*/*" } });
    assert.equal(w2.headers.get("content-type"), "image/webp");
    // 128/192 accepted for both formats (desktop report): 200 with the exact size when the variant exists
    for (const q of ["?s=128", "?s=192", "?s=128&fmt=png", "?s=192&fmt=png"]) {
      const x = await fetch(U(mint, q));
      assert.equal(x.status, 200, q);
      assert.equal(x.headers.get("x-logo-size"), q.slice(3, 6), q);
      await x.arrayBuffer();
    }
    // a variant omitted by the transcoder (over HARD_MAX_BYTES 16 KiB) -> next smaller size of that format, never 422
    const metaFile = `${dir}/${mint.slice(0, 2)}/${mint}/meta.json`;
    const meta = JSON.parse(readFileSync(metaFile, "utf8"));
    for (const f of ["128.webp", "192.webp"]) {
      delete meta.etags[f];
      rmSync(`${dir}/${mint.slice(0, 2)}/${mint}/${f}`, { force: true });
    }
    writeFileSync(metaFile, JSON.stringify(meta));
    for (const q of ["?s=192", "?s=128"]) {
      const x = await fetch(U(mint, q));
      assert.equal(x.status, 200, `fallback ${q}`);
      assert.equal(x.headers.get("x-logo-size"), "96", `fallback ${q}`);
      assert.equal(x.headers.get("content-type"), "image/webp");
      await x.arrayBuffer();
    }
    const pngStill = await fetch(U(mint, "?s=192&fmt=png"));
    assert.equal(pngStill.headers.get("x-logo-size"), "192", "other format unaffected");
    await pngStill.arrayBuffer();
    for (const q of ["", "?s=32", "?s=100", "?s=64&fmt=svg", "?s=64.svg", "?s=abc"]) {
      const x = await fetch(U(mint, q));
      assert.equal(x.status, 422, q);
      assert.equal((await x.json()).error.code, "VALIDATION_FAILED");
    }
    for (const m of ["not-a-mint", "1".repeat(44)]) {
      const x = await fetch(U(m, "?s=64"));
      assert.equal(x.status, 404, m);
      assert.equal((await x.json()).error.code, "LOGO_NOT_FOUND");
    }
    const miss = await fetch(U(mintN(51), "?s=64")); // no metadata -> 404 LOGO_NOT_FOUND, short cache
    assert.equal(miss.status, 404);
    assert.equal(miss.headers.get("x-content-type-options"), "nosniff");
    assert.match(miss.headers.get("cache-control")!, /^public, max-age=\d+$/);
    const mj = await miss.json();
    assert.equal(mj.error.code, "LOGO_NOT_FOUND");
    assert.equal(mj.error.reason, "no_metadata");
    const rej = await fetch(U(mintN(53), "?s=48")); // SVG -> 422 LOGO_REJECTED
    assert.equal(rej.status, 422);
    assert.equal(rej.headers.get("content-type")?.startsWith("application/json"), true, "never image/svg+xml");
    const rj = await rej.json();
    assert.equal(rj.error.code, "LOGO_REJECTED");
    assert.equal(rj.error.reason, "svg_rejected");
    // cold limit: 3 cache misses per IP per minute (mint 50, 51, 53 used them)
    assert.equal((await fetch(U(mintN(52), "?s=64"))).status, 429);
    let last = 200;
    for (let i = 0; i < 60; i++) last = (await fetch(U(mint, "?s=48"))).status;
    assert.equal(last, 429, "per-IP limit");
  } finally {
    server.closeAllConnections();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("disabled proxy: route 404 LOGO_NOT_FOUND and logo_url null; enabled: proxy URL with v", async () => {
  const off = loadLogoConfig({});
  assert.equal(off.enabled, false);
  const { base, server } = await routeServer(null, off);
  try {
    const r = await fetch(`${base}/v1/img/coin/${MINT}?s=64`);
    assert.equal(r.status, 404);
    assert.equal((await r.json()).error.code, "LOGO_NOT_FOUND");
    assert.equal(logoUrl(MINT), null);
  } finally {
    server.closeAllConnections();
    server.close();
  }
  setLogoWire(true, "");
  assert.equal(logoUrl(MINT), `/v1/img/coin/${MINT}?s=96`);
  assert.equal(logoUrl(MINT, "AbCdEfGh12345678"), `/v1/img/coin/${MINT}?s=96&v=AbCdEfGh12345678`);
  assert.equal(logoUrl(MINT, "bad hash"), `/v1/img/coin/${MINT}?s=96`);
  assert.equal(logoUrl("bad"), null);
  assert.equal(logoUrl(null), null);
  setLogoWire(true, "https://api.example");
  assert.equal(logoUrl(MINT), `https://api.example/v1/img/coin/${MINT}?s=96`);
  setLogoWire(false, "");
});

test("config fails closed when enabled without RPC / cache dir; gateways must be https", () => {
  assert.throws(() => loadLogoConfig({ LOGO_PROXY_ENABLED: "true", LOGO_CACHE_DIR: "/tmp/x" }), LogoConfigError);
  assert.throws(() => loadLogoConfig({ LOGO_PROXY_ENABLED: "true", LOGO_RPC_URL: "https://rpc.example" }), LogoConfigError);
  assert.throws(() => loadLogoConfig({ LOGO_IPFS_GATEWAYS: "http://gw.example/ipfs/" }), LogoConfigError);
  assert.throws(() => loadLogoConfig({ LOGO_PROXY_ENABLED: "yes" }), LogoConfigError);
  const c = loadLogoConfig({ LOGO_PROXY_ENABLED: "true", LOGO_RPC_URL: "https://rpc.example/?api-key=k", LOGO_CACHE_DIR: "/var/cache/logos", LOGO_IPFS_GATEWAYS: "https://gw.example/ipfs" });
  assert.deepEqual(c.ipfsGateways, ["https://gw.example/ipfs/"]);
  assert.equal(c.maxBytes, 2 * 1024 * 1024);
});

test("REST wires (DB): coin, pick and position carry logo_hash + logo_url; blocklist table exists", async () => {
  const h = await startHarness();
  try {
    const COIN = "Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump";
    const t = token(OWNER);
    setLogoWire(true, "");
    let c = await call(h.base, "GET", `/v1/workspaces/${WS}/coins/${COIN}`, { token: t });
    assert.equal(c.status, 200);
    assert.equal(c.body.data.logo_hash, null);
    assert.equal(c.body.data.logo_url, `/v1/img/coin/${COIN}?s=96`);
    await h.db.query("insert into public.coin_logos (mint, status, logo_hash) values ($1, 'ok', 'HashHashHash0001')", [COIN]);
    c = await call(h.base, "GET", `/v1/workspaces/${WS}/coins/${COIN}`, { token: t });
    assert.equal(c.body.data.logo_hash, "HashHashHash0001");
    assert.equal(c.body.data.logo_url, `/v1/img/coin/${COIN}?s=96&v=HashHashHash0001`);
    const p = await call(h.base, "GET", `/v1/workspaces/${WS}/positions/${POS}`, { token: t });
    assert.equal(p.status, 200);
    assert.equal(p.body.data.logo_hash, p.body.data.mint === COIN ? "HashHashHash0001" : null);
    assert.equal(p.body.data.logo_url?.startsWith(`/v1/img/coin/${p.body.data.mint}?s=96`), true);
    const list = await call(h.base, "GET", `/v1/workspaces/${WS}/positions?mode=practice`, { token: t });
    assert.ok(list.body.items.every((x: Record<string, unknown>) => "logo_hash" in x && "logo_url" in x));
    // 1.1.6 (desktop): approvals and event envelopes carry logo_hash next to logo_url
    const AP = "30000000-0000-0000-0000-000000000090";
    await h.db.query(
      "insert into public.approvals (id, workspace_id, strategy_id, kind, subject, mint, amount_lamports, is_first_buy, expires_at) values ($1, $2, '20000000-0000-0000-0000-0000000000a1', 'buy_pick', 'logopick', $3, 250000000, false, now() + interval '10 minutes')",
      [AP, WS, COIN],
    );
    const ap = await call(h.base, "GET", `/v1/workspaces/${WS}/approvals/${AP}`, { token: t });
    assert.equal(ap.status, 200, JSON.stringify(ap.body));
    assert.equal(ap.body.data.logo_hash, "HashHashHash0001");
    assert.equal(ap.body.data.logo_url, `/v1/img/coin/${COIN}?s=96&v=HashHashHash0001`);
    const aps = await call(h.base, "GET", `/v1/workspaces/${WS}/approvals`, { token: t });
    assert.ok(aps.body.items.every((x: Record<string, unknown>) => "logo_hash" in x && (x.mint === null ? x.logo_hash === null : true)));
    await h.db.query(
      "insert into public.events (id, workspace_id, mint, ts, type, actor, payload) values ('logoev1:1:coin.detected', $1, $2, now(), 'coin.detected', 'ingest', '{}'::jsonb), ('logoev2:2:coin.detected', $1, null, now(), 'coin.detected', 'ingest', '{}'::jsonb)",
      [WS, COIN],
    );
    const ev = await call(h.base, "GET", `/v1/workspaces/${WS}/events?limit=100`, { token: t });
    assert.equal(ev.status, 200, JSON.stringify(ev.body));
    const e1 = ev.body.items.find((x: Record<string, unknown>) => x.id === "logoev1:1:coin.detected");
    const e2 = ev.body.items.find((x: Record<string, unknown>) => x.id === "logoev2:2:coin.detected");
    assert.ok(e1 && e2, "both events listed");
    assert.equal(e1.logo_hash, "HashHashHash0001");
    assert.equal(e1.logo_url, `/v1/img/coin/${COIN}?s=96&v=HashHashHash0001`);
    assert.equal(e2.logo_hash, null);
    assert.equal(e2.logo_url, null);
    await h.db.query("insert into public.coin_logo_blocklist (mint, reason) values ($1, 'nsfw')", [COIN]);
    await assert.rejects(h.db.query("insert into public.coin_logos (mint, status, logo_hash) values ($1, 'ok', null)", ["So11111111111111111111111111111111111111112"]), /check/);
    setLogoWire(false, "");
    c = await call(h.base, "GET", `/v1/workspaces/${WS}/coins/${COIN}`, { token: t });
    assert.equal(c.body.data.logo_url, null, "proxy disabled");
  } finally {
    setLogoWire(false, "");
    await h.stop();
  }
});
