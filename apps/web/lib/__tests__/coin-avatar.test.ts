import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LOGO_SIZES as WIRE_SIZES, logoSizeFor as wireLogoSizeFor } from "@centurion/contracts/wire";
import { fnv1a32, identicon, IDENTICON_PALETTE, initials, isMint, paletteIndex } from "../identicon";
import { coinLogoSrc, LOGO_BUDGET_BYTES, LOGO_PATH, LOGO_SIZES, logoHashFromUrl, logoHashFromWire, logoHashOf, logoSizeFor, mockLogoHash, wireLogo } from "../media";

const MINT = "SJYhFCVo3jBVUecH9w9gLsdUHLbtpL2xNLhHvRc2s3qQ";
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** UX COIN_LOGO.md §4 test vectors (verified Python + Node by UX). */
const VECTORS = [
  { mint: "tUS1YuHKJDnzQddko3sTDKq1F7v58ZPsvkwRHBTGN844", symbol: "$TESSA", hash: "0xeeb2707f", index: 7, initials: "TE" },
  { mint: "dYrhdkDmtC88oyRfDMCPgQbxc2y8p5fhc95zgjSYZo2d", symbol: "$z3phy", hash: "0x70e7f8fb", index: 11, initials: "Z3" },
  { mint: "HnYTsD1BUDsPCBFXnbgxn8bYfejYYxJUgLVaHFPunvLy", symbol: "🚀🚀", hash: "0xa810ce07", index: 7, initials: "\u2022" },
  { mint: "CTvec4mint1111111111111111111111111111111111", symbol: "$_9lives", hash: "0x1580013a", index: 10, initials: "9L" },
];

test("identicon = COIN_LOGO §4 vectors: FNV-1a 32 (UTF-8) % 12 + initials", () => {
  for (const v of VECTORS) {
    assert.equal("0x" + fnv1a32(v.mint).toString(16).padStart(8, "0"), v.hash, v.mint);
    assert.equal(paletteIndex(v.mint), v.index);
    assert.equal(paletteIndex(`  ${v.mint} `), v.index, "mint is trimmed");
    assert.equal(initials(v.symbol), v.initials);
    const i = identicon(v.mint, v.symbol);
    assert.equal(i.bg, IDENTICON_PALETTE[v.index]);
    assert.equal(i.bgVar, `var(--color-identicon-${v.index}, ${IDENTICON_PALETTE[v.index]})`);
    assert.equal(i.fontPct, v.initials.length === 2 ? 42 : 50);
  }
  assert.equal(initials(""), "\u2022");
  assert.equal(initials(null), "\u2022");
  assert.equal(initials("$$a"), "A");
  assert.equal(initials("<b>x"), "BX", "markup characters are skipped");
});

test("identicon matches the UX reference script ux-solbot/visual/src/vectors.mjs (when present)", (t) => {
  const ref = "/workspace/ux-solbot/visual/src/vectors.mjs";
  let out: string;
  try {
    out = execFileSync(process.execPath, [ref, JSON.stringify(VECTORS.map((v) => [v.mint, v.symbol]))], { encoding: "utf8" });
  } catch {
    return t.skip("UX reference script not available");
  }
  const rows = out.trim().split("\n").map((l) => JSON.parse(l) as { hash: string; index: number; initials: string });
  rows.forEach((r, k) => assert.deepEqual([r.hash, r.index, r.initials], [VECTORS[k].hash, VECTORS[k].index, VECTORS[k].initials]));
});

test("identicon font: self-hosted Inter 700 subset from design-tokens Inter-Bold.ttf (sha256 2883160…947f)", () => {
  const src = readFileSync(here("../../../../packages/design-tokens/fonts/Inter-Bold.ttf"));
  const sha = createHash("sha256").update(src).digest("hex");
  assert.ok(sha.startsWith("2883160") && sha.endsWith("947f"), sha);
  const woff = readFileSync(here("../../app/fonts/inter-bold-initials.woff"));
  assert.equal(woff.subarray(0, 4).toString("latin1"), "wOFF");
  assert.ok(woff.byteLength < 16 * 1024, "subset stays small");
});

test("logo size bucket: smallest of 48/64/96/128/192 >= px × dpr, capped at 192 (= contracts logoSizeFor)", () => {
  assert.deepEqual([...LOGO_SIZES], [48, 64, 96, 128, 192]);
  assert.deepEqual([...LOGO_SIZES], [...WIRE_SIZES]);
  // COIN_LOGO §2 table
  const table: [number, number, number][] = [
    [20, 1, 48], [20, 2, 48], [20, 3, 64],
    [24, 1, 48], [24, 2, 48], [24, 3, 96],
    [32, 1, 48], [32, 2, 64], [32, 3, 96],
    [48, 1, 48], [48, 2, 96], [48, 3, 192],
    [64, 1, 64], [64, 2, 128], [64, 3, 192],
  ];
  for (const [px, dpr, s] of table) {
    assert.equal(logoSizeFor(px, dpr), s, `${px}px @${dpr}x`);
    assert.equal(wireLogoSizeFor(px, dpr), s);
  }
  assert.equal(logoSizeFor(200), 192);
  assert.equal(logoSizeFor(97), 128);
  assert.equal(logoSizeFor(16), 48);
  assert.equal(LOGO_BUDGET_BYTES, 8192);
});

test("logo src: same-origin /api/v1/img/coin/{mint}?s=&v=; logo_hash null/absent → identicon, no request", () => {
  assert.equal(coinLogoSrc(MINT, "abc123", 96), `${LOGO_PATH}${MINT}?s=96&v=abc123`);
  assert.equal(coinLogoSrc(MINT, "abc123"), `${LOGO_PATH}${MINT}?s=64&v=abc123`);
  assert.equal(coinLogoSrc(MINT, null), null);
  assert.equal(coinLogoSrc(MINT, undefined), null, "never guess a URL without v");
  assert.equal(coinLogoSrc(MINT, "a b&x"), null);
  assert.equal(coinLogoSrc("../../etc/passwd", "abc"), null);
  assert.equal(isMint(MINT), true);
  assert.equal(logoHashFromWire(undefined), undefined);
  assert.equal(logoHashFromWire(null), null);
  assert.equal(logoHashFromWire("javascript:alert(1)"), null);
  assert.equal(logoHashFromWire("k3J9x"), "k3J9x");
  // logo_url is a hint only: v recovered from our proxy shape for the same mint, any host ignored
  assert.equal(logoHashFromUrl(`/v1/img/coin/${MINT}?s=96&v=k3J9x`, MINT), "k3J9x");
  assert.equal(logoHashFromUrl(`https://img.example/v1/img/coin/${MINT}?s=96&fmt=png&v=k3J9x`, MINT), "k3J9x");
  assert.equal(logoHashFromUrl(`/v1/img/coin/So11111111111111111111111111111111111111112?s=96&v=k3J9x`, MINT), null, "other mint");
  assert.equal(logoHashFromUrl("https://evil.example/x.svg", MINT), null);
  assert.equal(logoHashFromUrl(undefined, MINT), undefined);
  assert.equal(logoHashOf({ logo_hash: "abc", logo_url: null }, MINT), "abc");
  assert.equal(logoHashOf({ logo_url: `/v1/img/coin/${MINT}?s=96&v=zz` }, MINT), "zz");
  const w = wireLogo(MINT);
  const h = mockLogoHash(MINT);
  assert.deepEqual(w, { logo_hash: h, logo_url: h ? `/v1/img/coin/${MINT}?s=96&v=${h}` : null });
  assert.deepEqual(wireLogo(null), { logo_hash: null, logo_url: null });
});
