# Coin-logo proxy (contracts 1.1.6)

Status: built, **off by default** (`LOGO_PROXY_ENABLED=false`). Wire contract: `packages/contracts/API_ENDPOINTS.md`
§4.12 and `src/wire/events.ts` (`LogoUrl`, `LOGO_SIZES`, `logoSizeFor`, `logoUrlFor`). Read-only: the proxy only reads
public on-chain metadata (`getAccountInfo` on the Metaplex metadata PDA) and public images. No keys, no transactions.

## 1. Flow
`GET /v1/img/coin/{mint}?s=48|64|96|128|192[&fmt=webp|png]&v={logo_hash}` (unauthenticated: public data for any
valid mint, nothing per-user; `<img>` cannot send bearer tokens).
1. Validate mint (base58, 32-44), `s`, `fmt` (else `422 VALIDATION_FAILED {field, allowed}`); per-IP rate limit.
2. Blocklist (`public.coin_logo_blocklist`, cached in memory) -> `422 LOGO_REJECTED {reason: "blocked"}`.
3. Disk cache `LOGO_CACHE_DIR/<mint[0:2]>/<mint>/{size}.{fmt}` + `meta.json` (atomic tmp-dir + rename). Hit -> serve.
4. Miss (single-flight per mint, `LOGO_CONCURRENCY` cap, cold-fetch limits per IP and global): RPC `getAccountInfo`
   (`LOGO_RPC_URL`, falls back to `HELIUS_RPC_URL`; key never logged) -> metadata `uri` -> JSON `image` (or the URI is
   itself an image). `ipfs://` / `ar://` are rewritten to the pinned gateways only (`LOGO_IPFS_GATEWAYS`,
   `LOGO_ARWEAVE_GATEWAYS`); other schemes are dropped.
5. Transcode in a child process (`centurion-logo`, crate `crates/logo`), empty env, stdin = bytes, files out.
6. Store files + `logo_hash` (content hash over all outputs) in `public.coin_logos` (migration 0019); failures are
   negative-cached (`LOGO_NEGATIVE_TTL_S`, 1 h). Positive TTL `LOGO_CACHE_TTL_S` (30 d); a failed refresh keeps the stale
   copy.

Responses: WebP by default; PNG when `fmt=png`, or when `Accept` names `image/png` but not `image/webp` (or refuses
`image/webp;q=0`); negotiated answers carry `Vary: Accept`. Never SVG. Headers `X-Content-Type-Options: nosniff`,
`Content-Security-Policy: default-src 'none'`, `Cross-Origin-Resource-Policy: cross-origin`, `Referrer-Policy:
no-referrer`, `ETag` (+ `304` on `If-None-Match`). `Cache-Control: public, max-age=31536000, immutable` only when `v`
equals the current `logo_hash`, otherwise `public, max-age=LOGO_SHORT_MAX_AGE_S` (300). `404 LOGO_NOT_FOUND` = no logo
or proxy disabled; `422 LOGO_REJECTED {reason}` = svg_rejected, unsupported_format, too_large*, output_too_large,
decode_failed, empty, blocked, moderation. Clients show the identicon and do not retry that mint+v.

Wires: `logo_hash` + `logo_url` (`s=96`) on coin/pick/position; `logo_url` on approvals/proposals and on events with a
mint (`api/src/logo/config.ts` `logoUrl()`; null when disabled).

## 2. SSRF (`api/src/logo/ssrf.ts`)
http/https only, ports 80/443, no userinfo. DNS resolved once; **every** answer must be public (blocks private,
loopback, link-local, CGNAT, multicast, documentation, metadata ranges, v4 + v6), then the socket connects to that
vetted IP (Host/SNI keep the hostname), so DNS rebinding cannot swap the target. Redirects followed manually (max 3),
each hop re-validated. `Accept-Encoding: identity`, byte caps while streaming (`LOGO_MAX_BYTES` 2 MiB image,
`LOGO_MAX_JSON_BYTES` 256 KiB), connect/total timeouts (3 s / 8 s). Tests: `api/test/logo.test.ts`.

## 3. Transcoder (`crates/logo`, bin `centurion-logo`)
Format sniffed by magic bytes (declared Content-Type ignored): PNG, JPEG, GIF (first frame), WebP. Bomb guard before
any pixel buffer: `MAX_SIDE` 4096, `MAX_PIXELS` 4096², input `MAX_INPUT` 2 MiB, per-decoder memory cap 96 MiB.
Output: fresh lossless WebP + PNG at 48/64/96/128/192, square, letterboxed on transparency; only pixels survive (no
EXIF/XMP/ICC/text, no extra frames, no trailing data). Byte budget per variant (each size x format): target 8 KiB, **hard cap 16 KiB** (`HARD_MAX_BYTES`;
posterized 7..3 bits before giving up). A variant above the cap is omitted; the API serves the next smaller size of
that format, then a larger one. The logo is rejected (`output_too_large`) only when 48 px WebP cannot fit. Tests: `crates/logo/tests/transcode.rs` (+ fixtures).

## 4. Dependency review (approved for P1, 2026-11-01/03)
Direct deps, exact pins, default features off:

| Crate | Version | Features | License | Why |
|---|---|---|---|---|
| png | =0.18.1 | none | MIT OR Apache-2.0 | PNG decode + encode |
| gif | =0.14.2 | std | MIT OR Apache-2.0 | GIF first frame |
| image-webp | =0.2.4 | none | MIT OR Apache-2.0 | WebP decode + lossless encode |
| zune-jpeg | =0.5.15 | std (default-features off) | MIT OR Apache-2.0 OR Zlib | JPEG decode |

Full normal-dependency tree of `logo` = **18 crates** incl. the 4 above (`cargo tree -p logo -e normal`): adler2 2.0.1,
bitflags 2.13.2, byteorder-lite 0.1.0, cfg-if 1.0.5, crc32fast 1.5.3, fdeflate 0.3.7, flate2 1.1.10, miniz_oxide 0.8.9
and 0.9.1, quick-error 2.0.1, simd-adler32 0.3.10, weezl 0.1.12, zune-core 0.5.1 (all MIT/Apache/Zlib/0BSD/Unlicense
permissive). Pure Rust, no build scripts that fetch, no network, no C libraries (no libwebp/libjpeg/ImageMagick).
Mature, widely used image-rs / zune ecosystem crates. Residual risk (decoder bugs on hostile input) is contained by the
child-process isolation, the pre-allocation bomb guard, memory caps and the transcode timeout
(`LOGO_TRANSCODE_TIMEOUT_MS`, 5 s). **Open:** `cargo-audit` is not installed (install needs its own review), so no
RUSTSEC scan has been run on this tree yet.

## 5. Moderation
No ML/NSFW classifier in the MVP. Manual per-mint blocklist (service role):
`insert into public.coin_logo_blocklist (mint, reason) values ('<mint>', 'nsfw');` plus a `LogoModerationHook` seam in
`api/src/logo/service.ts`.

## 6. Config (env)
`LOGO_PROXY_ENABLED`, `LOGO_RPC_URL` (or `HELIUS_RPC_URL`), `LOGO_CACHE_DIR` (absolute; required when enabled; boot fails
closed otherwise), `LOGO_IPFS_GATEWAYS`, `LOGO_ARWEAVE_GATEWAYS` (plain https), `LOGO_TRANSCODER_BIN` (default
`target/release/centurion-logo`), `LOGO_PUBLIC_BASE_URL` (unset = `logo_url` is API-relative `/v1/img/coin/...`, resolved against the API origin; set
= absolute `logo_url` with that origin, e.g. a CDN in front of the API), `LOGO_CACHE_TTL_S`, `LOGO_NEGATIVE_TTL_S`, `LOGO_MAX_BYTES`,
`LOGO_MAX_JSON_BYTES`, `LOGO_CONNECT_TIMEOUT_MS`, `LOGO_TOTAL_TIMEOUT_MS`, `LOGO_TRANSCODE_TIMEOUT_MS`,
`LOGO_CONCURRENCY`, `LOGO_SHORT_MAX_AGE_S`, `LOGO_RATE_IP_PER_MIN`, `LOGO_COLD_IP_PER_MIN`, `LOGO_COLD_GLOBAL_PER_MIN`.
Cost: one `getAccountInfo` per mint per 30 days (cache miss only) on the existing Helius plan.
