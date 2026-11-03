// CoinAvatar (COIN_LOGO Rev 6.0): identicon test vectors (§4), proxy URL building (§2), session cache.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fnv1a32, identiconIndex, identiconInitials } from "../src/components/identicon.ts";
import { logoSrc, proxySize, recordLogo, logoStatus, cacheKey, MOCK_ORIGIN, _cacheSizeForTests } from "../src/components/coinLogo.ts";

test("identicon matches the COIN_LOGO §4 test vectors", () => {
  const vectors = [
    ["tUS1YuHKJDnzQddko3sTDKq1F7v58ZPsvkwRHBTGN844", "$TESSA", 0xeeb2707f, 7, "TE"],
    ["dYrhdkDmtC88oyRfDMCPgQbxc2y8p5fhc95zgjSYZo2d", "$z3phy", 0x70e7f8fb, 11, "Z3"],
    ["HnYTsD1BUDsPCBFXnbgxn8bYfejYYxJUgLVaHFPunvLy", "🚀🚀", 0xa810ce07, 7, "\u2022"],
    ["CTvec4mint1111111111111111111111111111111111", "$_9lives", 0x1580013a, 10, "9L"],
  ];
  for (const [mint, sym, h, idx, ini] of vectors) {
    assert.equal(fnv1a32(mint), h, mint);
    assert.equal(identiconIndex(` ${mint} `), idx, "trimmed");
    assert.equal(identiconInitials(sym), ini, sym);
  }
  assert.equal(identiconInitials(""), "\u2022");
  assert.equal(identiconInitials("$$a"), "A");
});

test("proxy URL: only our origin, smallest size ≥ px×dpr (dpr ≤ 2, ≤ 96 until 128/192 ship), v = logo_hash", () => {
  const M = "tUS1YuHKJDnzQddko3sTDKq1F7v58ZPsvkwRHBTGN844";
  assert.deepEqual([proxySize(20, 1), proxySize(24, 2), proxySize(32, 2), proxySize(32, 3)], [48, 48, 64, 64]);
  assert.equal(logoSrc("http://127.0.0.1:8787", M, "abcDEF12", 32, 2), `http://127.0.0.1:8787/v1/img/coin/${M}?s=64&v=abcDEF12`);
  assert.equal(logoSrc(MOCK_ORIGIN, M, "mocklogo3", 24), "/mock-logo/mocklogo3.webp");
  assert.equal(logoSrc("http://127.0.0.1:8787", M, null, 24), null, "logo_hash null → identicon, no request");
  assert.equal(logoSrc(null, M, "abcDEF12", 24), null, "no origin → identicon");
  assert.equal(logoSrc("http://127.0.0.1:8787", M, "../../x", 24), null, "bad hash");
  assert.equal(logoSrc("http://127.0.0.1:8787/evil?", M, "abcDEF12", 24), null, "origin must be bare");
  assert.equal(logoSrc("javascript:alert(1)", M, "abcDEF12", 24), null);
  assert.equal(logoSrc("http://127.0.0.1:8787", "not a mint", "abcDEF12", 24), null);
});

test("session cache: failure is final, a timeout gets one retry, LRU capped at 200", () => {
  const k = cacheKey("m1", "abcDEF12");
  assert.equal(recordLogo(k, "network"), "retry");
  assert.equal(recordLogo(k, "network"), "failed");
  assert.equal(logoStatus(k), "failed");
  const k2 = cacheKey("m2", "abcDEF12");
  assert.equal(recordLogo(k2, "failed"), "failed");
  assert.equal(recordLogo(k2, "network"), "failed", "no retry after a definitive failure");
  for (let i = 0; i < 300; i++) recordLogo(cacheKey(`x${i}`, "abcDEF12"), "ok");
  assert.equal(_cacheSizeForTests(), 200);
  assert.equal(logoStatus(k), undefined, "oldest evicted");
});
