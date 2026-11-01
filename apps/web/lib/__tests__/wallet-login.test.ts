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
