import { test } from "node:test";
import assert from "node:assert/strict";
import { identicon, identiconSvg, isMint } from "../identicon";
import { coinLogoSrc, logoHintFromWire, logoSizeFor, LOGO_PATH, wireLogoUrl } from "../media";

const MINT = "SJYhFCVo3jBVUecH9w9gLsdUHLbtpL2xNLhHvRc2s3qQ";

test("identicon: deterministic per mint, symmetric, never empty; invalid input → neutral", () => {
  const a = identicon(MINT), b = identicon(MINT);
  assert.deepEqual(a, b);
  assert.notDeepEqual(identicon("So11111111111111111111111111111111111111112").cells.concat([]), undefined);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 2; c++) assert.equal(a.cells[r * 5 + c], a.cells[r * 5 + 4 - c]);
  assert.ok(a.cells.some(Boolean));
  assert.equal(identicon("<script>").valid, false);
  const svg = identiconSvg("<img onerror=x>");
  assert.doesNotMatch(svg, /onerror|<img|script/);
  assert.match(identiconSvg(MINT), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
});

test("logo src: only our same-origin BFF mirror (1.1.6 /v1/logos/{mint}/{size}.{ext}); null = proxy off", () => {
  assert.equal(coinLogoSrc(MINT), `${LOGO_PATH}${MINT}/64.webp`);
  assert.equal(coinLogoSrc(MINT, `/v1/logos/${MINT}/128.webp`, 32), `${LOGO_PATH}${MINT}/32.webp`);
  assert.equal(coinLogoSrc(MINT, `https://logos.example.com/v1/logos/${MINT}/128.png`), `${LOGO_PATH}${MINT}/64.webp`, "absolute host never used");
  assert.equal(coinLogoSrc(MINT, "https://evil.example/x.svg"), null, "not our proxy shape");
  assert.equal(coinLogoSrc(MINT, `/v1/logos/So11111111111111111111111111111111111111112/128.webp`), null, "other mint");
  assert.equal(coinLogoSrc(MINT, null), null);
  assert.equal(coinLogoSrc("../../etc/passwd"), null);
  assert.equal(isMint(MINT), true);
  assert.equal(logoHintFromWire(undefined), undefined);
  assert.equal(logoHintFromWire(null), null);
  assert.equal(logoHintFromWire("javascript:alert(1)"), null);
  assert.equal(logoHintFromWire("data:image/svg+xml,<svg/>"), null);
  assert.equal(logoHintFromWire(`/v1/logos/${MINT}/64.png`), `/v1/logos/${MINT}/64.png`);
  assert.deepEqual(wireLogoUrl(MINT), { logo_url: `/v1/logos/${MINT}/128.webp` });
  assert.deepEqual(wireLogoUrl(null), { logo_url: null });
  assert.deepEqual([logoSizeFor(16), logoSizeFor(20, 2), logoSizeFor(40, 2), logoSizeFor(200)], [32, 64, 128, 128]);
});
