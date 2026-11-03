import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTH_FLAGS, anyLegacyMethod } from "../auth/flags";
import { isAllowedWallet, MOCK_OTHER_WALLET, MOCK_OWNER_WALLET } from "../auth/allowlist";
import { mockPhantom, WalletError } from "../auth/wallet";
import { siwsNonce, siwsVerify } from "../mock/auth";

test("legacy sign-in methods and onboarding are off by default", () => {
  assert.deepEqual(AUTH_FLAGS, { emailOtp: false, google: false, apple: false, telegram: false, onboarding: false });
  assert.equal(anyLegacyMethod(), false);
});

test("allowlist: owner wallet only by default; env override", () => {
  assert.equal(isAllowedWallet(MOCK_OWNER_WALLET), true);
  assert.equal(isAllowedWallet(MOCK_OTHER_WALLET), false);
  process.env.OWNER_WALLETS = ` ${MOCK_OTHER_WALLET} ,`;
  try {
    assert.equal(isAllowedWallet(MOCK_OTHER_WALLET), true);
    assert.equal(isAllowedWallet(MOCK_OWNER_WALLET), false);
  } finally {
    delete process.env.OWNER_WALLETS;
  }
});

test("mock Phantom adapter: connect → sign returns the mock signature, never a real wallet", async () => {
  const w = mockPhantom(MOCK_OWNER_WALLET);
  assert.equal((await w.connect()).address, MOCK_OWNER_WALLET);
  assert.equal(await w.signMessage("x"), "mock-signature");
  await assert.rejects(mockPhantom(MOCK_OWNER_WALLET, "connect_rejected").connect(), (e) => e instanceof WalletError && e.code === "connect_rejected");
  await assert.rejects(mockPhantom(MOCK_OWNER_WALLET, "sign_rejected").signMessage("x"), (e) => e instanceof WalletError && e.code === "sign_rejected");
});

test("SIWS mock: nonce message names the address; nonce is single-use", () => {
  const c = siwsNonce(MOCK_OWNER_WALLET, "localhost:3100", "http://localhost:3100");
  assert.ok(c.message.includes(MOCK_OWNER_WALLET));
  assert.ok(siwsVerify(MOCK_OWNER_WALLET, c.message, "mock-signature"));
  assert.throws(() => siwsVerify(MOCK_OWNER_WALLET, c.message, "mock-signature"));
});

test("desktop hand-off: allow-listed return URIs only, state required, no tokens in the return URL", async () => {
  const { parseHandoff, safeRedirect, successUrl, errorUrl, DESKTOP_AUTH_URI } = await import("../auth/handoff");
  const state = "abcdefghijklmnop1234";
  assert.equal(DESKTOP_AUTH_URI, "centurion://auth");
  assert.deepEqual(parseHandoff({ state }), { state, redirect: "centurion://auth" });
  assert.deepEqual(parseHandoff({ state, redirect_uri: "http://127.0.0.1:53111/siws/callback", client: "desktop" }), { state, redirect: "http://127.0.0.1:53111/siws/callback" });
  for (const bad of ["https://evil.example/cb", "centurion://auth/../x", "javascript:alert(1)", "http://127.0.0.1:80/siws/callback", "http://localhost:5000/siws/callback", "legacy-scheme://auth"]) {
    assert.equal(safeRedirect(bad), null, bad);
    assert.equal(parseHandoff({ state, redirect_uri: bad }), null, bad);
  }
  assert.equal(parseHandoff({}), null);
  assert.equal(parseHandoff({ state: "short" }), null);
  assert.equal(parseHandoff({ state: [state, state] }), null);
  const ok = new URL(successUrl("centurion://auth", state, { address: "Addr", message: "line1\nNonce: n", signature: "sig" }));
  assert.deepEqual([...ok.searchParams.keys()].sort(), ["address", "message", "signature", "state"]);
  assert.equal(ok.searchParams.get("message"), "line1\nNonce: n");
  assert.ok(!/token|access|refresh|srt_|mat_/i.test(ok.search), "no session material in the URL");
  assert.equal(new URL(errorUrl("centurion://auth", state, "wallet_not_allowed")).searchParams.get("error"), "wallet_not_allowed");
});

test("brand: Centurion Trade from @centurion/i18n app.name; mock SIWS statement = backend v2", async () => {
  const { APP_NAME, APP_SHORT_NAME } = await import("../brand");
  const { siwsNonce, SIWS_STATEMENT } = await import("../mock/auth");
  assert.equal(APP_NAME, "Centurion Trade");
  assert.equal(APP_SHORT_NAME, "Centurion");
  assert.equal(SIWS_STATEMENT, "Sign in to Centurion Trade");
  const n = siwsNonce("BossMockWa11et11111111111111111111111111111", "localhost:3100", "http://localhost:3100");
  assert.match(n.message, /\n\nSign in to Centurion Trade\n\nURI: /);
  assert.equal(n.statement_version, 2);
});

test("i18n: UX app.* (0.4.7 brand keys) resolves next to the app dictionary namespace", async () => {
  const { createT } = await import("../i18n");
  assert.equal(createT("en").ux("app.name" as never), "Centurion Trade");
  assert.equal(createT("id").ux("app.name" as never), "Centurion Trade");
  assert.equal(createT("en")("walletLogin.connect" as never), "Connect Phantom");
});
