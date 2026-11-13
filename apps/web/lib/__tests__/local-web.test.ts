import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { b58encode } from "../auth/wallet";
import { verifySolanaMessage } from "../local/ed25519";
import { heroKind } from "../local/hero-kind";
import { loopbackRequest } from "../local/paths";
import { applyKnobs, defaultBook, disableReal, enableReal, readBook, writeBook } from "../local/real-book";
import { DEFAULT_KNOBS, enableMessage, limitsMessage, solToLamports } from "../local/real-limits";
import { resolveTheme } from "../i18n/core";
import { messagesFor } from "../i18n/index";
import { THEME_INIT } from "../security/theme-init";

function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const raw = new Uint8Array(der.subarray(der.length - 32));
  const address = b58encode(raw);
  const signText = (message: string) => b58encode(new Uint8Array(sign(null, Buffer.from(message), privateKey)));
  return { address, signText };
}

test("theme follows the system unless the owner picked dark or light", () => {
  assert.equal(resolveTheme(null, false), "light");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("light", true), "light");
  assert.match(THEME_INIT, /prefers-color-scheme: dark/);
});

test("page heroes cover the main menus", () => {
  assert.equal(heroKind("/"), "desk");
  assert.equal(heroKind("/positions"), "positions");
  assert.equal(heroKind("/strategies/new"), "strategies");
  assert.equal(heroKind("/pnl"), "stats");
  assert.equal(heroKind("/settings"), "settings");
});

test("user-facing copy does not say Tauri", () => {
  const walk = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (!value || typeof value !== "object") return [];
    return Object.values(value as Record<string, unknown>).flatMap(walk);
  };
  for (const locale of ["en", "id"] as const) {
    const hits = walk(messagesFor(locale)).filter((line) => /tauri/i.test(line));
    assert.deepEqual(hits, [], locale);
  }
});

test("local real defaults, tighten now, loosen only with a Phantom signature, no private key", () => {
  const { address, signText } = wallet();
  assert.equal(solToLamports("0.05"), "50000000");
  assert.equal(DEFAULT_KNOBS.tradeLamports, "50000000");
  assert.equal(DEFAULT_KNOBS.dailyLamports, "500000000");
  assert.equal(DEFAULT_KNOBS.capLamports, "2000000000");
  assert.equal(DEFAULT_KNOBS.maxPositions, 3);
  const message = enableMessage(address);
  const signature = signText(message);
  assert.equal(verifySolanaMessage(address, message, signature), true);
  assert.equal(verifySolanaMessage(address, message, signText("other")), false);

  const off = defaultBook();
  assert.equal(off.enabled, false);
  const enabled = enableReal(off, address, signature);
  assert.ok(!("error" in enabled));
  if ("error" in enabled) return;
  const tighter = { ...enabled.book.global, tradeLamports: "40000000" };
  const tight = applyKnobs(enabled.book, "global", tighter, null);
  assert.ok(!("error" in tight));
  const looser = { ...enabled.book.global, tradeLamports: "60000000", capLamports: "9000000000" };
  const blocked = applyKnobs(enabled.book, "global", looser, null);
  assert.deepEqual(blocked, { error: "needs_signature" });
  const bad = applyKnobs(enabled.book, "global", looser, signature);
  assert.deepEqual(bad, { error: "bad_signature" });
  const signed = applyKnobs(enabled.book, "global", looser, signText(limitsMessage(address, "global", enabled.book.global, looser)));
  assert.ok(!("error" in signed));
  if ("error" in signed) return;
  assert.equal(signed.book.global.capLamports, "9000000000");
  assert.equal(disableReal(signed.book).enabled, false);
  assert.equal(JSON.stringify(signed.book).includes("private"), false);

  const dir = mkdtempSync(path.join(tmpdir(), "centurion-local-"));
  const prevLocal = process.env.CENTURION_LOCAL;
  const prevDir = process.env.CENTURION_LOCAL_DIR;
  const prevData = process.env.DATA_SOURCE;
  process.env.CENTURION_LOCAL = "1";
  process.env.CENTURION_LOCAL_DIR = dir;
  delete process.env.DATA_SOURCE;
  try {
    writeFileSync(path.join(dir, "real.json"), JSON.stringify({ privateKey: "nope", enabled: true }));
    assert.equal(readBook().enabled, false);
    writeBook(signed.book);
    const disk = readFileSync(path.join(dir, "real.json"), "utf8");
    assert.equal(disk.includes("privateKey"), false);
    assert.equal(readBook().global.capLamports, "9000000000");
    assert.equal(loopbackRequest(new Request("http://127.0.0.1:3100/api/local/real")), true);
    assert.equal(loopbackRequest(new Request("http://example.com/api/local/real")), false);
    process.env.HOSTNAME = "0.0.0.0";
    assert.equal(loopbackRequest(new Request("http://127.0.0.1:3100/api/local/real")), false);
  } finally {
    delete process.env.HOSTNAME;
    if (prevLocal === undefined) delete process.env.CENTURION_LOCAL;
    else process.env.CENTURION_LOCAL = prevLocal;
    if (prevDir === undefined) delete process.env.CENTURION_LOCAL_DIR;
    else process.env.CENTURION_LOCAL_DIR = prevDir;
    if (prevData === undefined) delete process.env.DATA_SOURCE;
    else process.env.DATA_SOURCE = prevData;
    rmSync(dir, { recursive: true, force: true });
  }
});
