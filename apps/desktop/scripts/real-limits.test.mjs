import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_KNOBS,
  admitBuy,
  admitSell,
  diffKnobs,
  enableMessage,
  lamportsToSolInput,
  limitsMessage,
  rpcUrlOk,
  solToLamports,
  validateKnobs,
} from "../src/real/limits.ts";

const blank = {
  enabled: true,
  buysPaused: false,
  guardVerdict: "pass",
  riskVeto: null,
  openPositions: 0,
  spentTodayLamports: "0",
  capitalUsedLamports: "0",
  tradeLamports: "50000000",
  slippageBps: 100,
  mcapUsd: 20_000,
  liquidityUsd: 10_000,
  volume24hUsd: 5_000,
  top10Pct: 20,
  holders: 50,
  ageMinutes: 30,
  lpBurnPct: 100,
};

test("defaults are 0.05 / 0.5 / 2 SOL and 3 positions, with no upper policy cap", () => {
  assert.equal(lamportsToSolInput(DEFAULT_KNOBS.tradeLamports), "0.05");
  assert.equal(lamportsToSolInput(DEFAULT_KNOBS.dailyLamports), "0.5");
  assert.equal(lamportsToSolInput(DEFAULT_KNOBS.capLamports), "2");
  assert.equal(DEFAULT_KNOBS.maxPositions, 3);
  const raised = { ...DEFAULT_KNOBS, tradeLamports: solToLamports("25"), maxPositions: 40 };
  assert.equal(validateKnobs(raised), null);
  assert.equal(solToLamports("-1"), null);
  assert.equal(solToLamports("1.1234567891"), null);
});

test("tightening applies with no signature; loosening is classified and signed", () => {
  const tighter = { ...DEFAULT_KNOBS, tradeLamports: solToLamports("0.02"), maxPositions: 1, slippageBps: 50 };
  const t = diffKnobs(DEFAULT_KNOBS, tighter);
  assert.equal(t.kind, "tighten");
  assert.ok(t.fields.every((f) => f.kind === "tighten"));

  const looser = { ...DEFAULT_KNOBS, tradeLamports: solToLamports("1"), dailyLamports: solToLamports("3") };
  const l = diffKnobs(DEFAULT_KNOBS, looser);
  assert.equal(l.kind, "loosen");
  const msg = limitsMessage("Wallet111", "global", DEFAULT_KNOBS, looser);
  assert.match(msg, /^Centurion Trade\naction: set-real-limits\n/);
  assert.match(msg, /trade_lamports: 50000000 -> 1000000000/);
  assert.match(msg, /kind: loosen/);
  assert.equal(enableMessage("Wallet111"), "Centurion Trade\naction: enable-real\nwallet: Wallet111\n");
  assert.doesNotMatch(msg, /private|secret key/i);
});

test("turning a stop off is loosening; adding one is tightening", () => {
  assert.equal(diffKnobs(DEFAULT_KNOBS, { ...DEFAULT_KNOBS, stopLossPct: 0 }).kind, "loosen");
  assert.equal(diffKnobs({ ...DEFAULT_KNOBS, stopLossPct: 0 }, DEFAULT_KNOBS).kind, "tighten");
  assert.equal(diffKnobs(DEFAULT_KNOBS, { ...DEFAULT_KNOBS, trailPct: 10 }).kind, "tighten");
});

test("buys obey guard, risk, stop and the owner's limits; sells ignore the buy pause", () => {
  assert.equal(admitBuy(DEFAULT_KNOBS, blank), null);
  assert.equal(admitBuy(DEFAULT_KNOBS, { ...blank, enabled: false }), "real_off");
  assert.equal(admitBuy(DEFAULT_KNOBS, { ...blank, buysPaused: true }), "buys_paused");
  assert.equal(admitBuy(DEFAULT_KNOBS, { ...blank, guardVerdict: "block" }), "guard");
  assert.equal(admitBuy(DEFAULT_KNOBS, { ...blank, guardVerdict: null }), "guard");
  assert.equal(admitBuy(DEFAULT_KNOBS, { ...blank, riskVeto: "loss_velocity" }), "risk");
  assert.equal(admitBuy(DEFAULT_KNOBS, { ...blank, tradeLamports: "50000001" }), "per_trade");
  assert.equal(admitBuy(DEFAULT_KNOBS, { ...blank, spentTodayLamports: "460000000" }), "daily");
  assert.equal(admitBuy(DEFAULT_KNOBS, { ...blank, capitalUsedLamports: "1960000000" }), "cap");
  assert.equal(admitBuy(DEFAULT_KNOBS, { ...blank, openPositions: 3 }), "positions");
  assert.equal(admitBuy(DEFAULT_KNOBS, { ...blank, slippageBps: 301 }), "slippage");
  assert.equal(admitBuy(DEFAULT_KNOBS, { ...blank, mcapUsd: -1 }), "filter");
  assert.equal(admitSell(true), null);
  assert.equal(admitSell(false), "real_off");
});

test("rpc url is https or this machine only", () => {
  assert.equal(rpcUrlOk("https://api.mainnet-beta.solana.com"), true);
  assert.equal(rpcUrlOk("http://127.0.0.1:8899"), true);
  assert.equal(rpcUrlOk("http://localhost:8899"), true);
  assert.equal(rpcUrlOk("http://10.0.0.5:8899"), false);
  assert.equal(rpcUrlOk("https://user:pw@rpc.example"), false);
  assert.equal(rpcUrlOk("https://rpc.example/v1"), false);
});
