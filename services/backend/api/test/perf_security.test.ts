// PERF_SECURITY: security headers on every response, br/gzip compression above 1 KiB (unit level, no DB).
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { COMPRESS_MIN_BYTES, SECURITY_HEADERS, pickEncoding, send, sendError, type Ctx } from "../src/http.ts";
import { ApiError } from "../src/errors.ts";

function fakeCtx(acceptEncoding?: string) {
  const out: { status?: number; headers: Record<string, string>; body?: Buffer } = { headers: {} };
  const res = {
    headersSent: false,
    writeHead(status: number, h: Record<string, string>) {
      out.status = status;
      out.headers = h;
      return res;
    },
    end(b?: string | Buffer) {
      out.body = b === undefined ? Buffer.alloc(0) : Buffer.isBuffer(b) ? b : Buffer.from(b);
    },
  };
  const ctx = {
    req: { headers: acceptEncoding ? { "accept-encoding": acceptEncoding } : {} },
    res,
    url: new URL("http://x/"),
    params: {},
    requestId: "req_test1234",
    lang: "en",
  } as unknown as Ctx;
  return { ctx, out };
}

describe("perf/security response plumbing", () => {
  test("security headers on success and error responses", () => {
    for (const write of [(c: Ctx) => send(c, 200, { ok: true }), (c: Ctx) => sendError(c, new ApiError("NOT_FOUND"))]) {
      const { ctx, out } = fakeCtx();
      write(ctx);
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(out.headers[k], v, k);
      assert.match(out.headers["Strict-Transport-Security"]!, /max-age=\d{8}/);
      assert.equal(out.headers["Cache-Control"], "no-store");
    }
  });

  test("Accept-Encoding negotiation prefers br, honours q=0", () => {
    assert.equal(pickEncoding("gzip, deflate, br"), "br");
    assert.equal(pickEncoding("gzip"), "gzip");
    assert.equal(pickEncoding("br;q=0, gzip;q=0.5"), "gzip");
    assert.equal(pickEncoding("identity"), null);
    assert.equal(pickEncoding(undefined), null);
  });

  test("large bodies are compressed (br / gzip) and round-trip; small ones are not", () => {
    const items = Array.from({ length: 200 }, (_, i) => ({ id: i, mint: "McWZrfqAAJXKzjKXDANWaVp52o7xBAfQCzjQHLhinBW", score: "0.5" }));
    for (const [enc, decode] of [["br", brotliDecompressSync], ["gzip", gunzipSync]] as const) {
      const { ctx, out } = fakeCtx(`${enc}`);
      send(ctx, 200, { items });
      assert.equal(out.headers["Content-Encoding"], enc);
      assert.equal(out.headers["Vary"], "Accept-Encoding");
      assert.equal(Number(out.headers["Content-Length"]), out.body!.length);
      const json = JSON.parse(decode(out.body!).toString("utf8"));
      assert.equal(json.items.length, 200);
      assert.ok(out.body!.length < JSON.stringify(json).length / 4, `${enc} ratio`);
    }
    const small = fakeCtx("br");
    send(small.ctx, 200, { ok: true });
    assert.equal(small.out.headers["Content-Encoding"], undefined);
    assert.ok(small.out.body!.length < COMPRESS_MIN_BYTES);
    const none = fakeCtx();
    send(none.ctx, 200, { items });
    assert.equal(none.out.headers["Content-Encoding"], undefined, "no Accept-Encoding, no compression");
  });
});
