import { test } from "node:test";
import assert from "node:assert/strict";
import { coinSummaryFromWire, envelopeToTradeEvent, type CoinWire } from "../contracts.ts";

const envelope = (type: string, payload: unknown, extra: Record<string, unknown> = {}) => ({
  id: `ev:${type}`, seq: "101", type, version: 1, workspace_id: "ws", strategy_id: "s1", ck: null, mint: "Mint111",
  ts: "2026-11-06T03:00:00.000Z", actor: "exit", mode: "practice", payload,
  untrusted: { symbol: "QUILL" }, server_now: "2026-11-06T03:00:01.000Z", ...extra,
});

test("position.opened reads the SOL spent from fill.sol_lamports", () => {
  const e = envelopeToTradeEvent(envelope("position.opened", { position_id: "p1", fill: { sol_lamports: "250000000", exec_price_sol: "0.0001" } }) as never);
  assert.ok(e);
  assert.equal(e.kind, "bought");
  assert.equal(e.solAmount, 0.25);
  assert.equal(e.message, "Bought");
});

test("position.closed reads pnl/exit price/exit reason from the contract payload", () => {
  const e = envelopeToTradeEvent(envelope("position.closed", {
    position_id: "p1", exit_reason: "loss_guard", exit_price_sol: "0.000086", sol_out_lamports: "86000000",
    pnl_lamports: "-14000000", pnl_pct: -14, hold_seconds: 3600,
  }) as never);
  assert.ok(e);
  assert.equal(e.kind, "sold");
  assert.equal(e.pnlSol, -0.014);
  assert.equal(e.pctChange, -14);
  assert.equal(e.exitReason, "loss_guard");
  assert.equal(e.solAmount, undefined, "a close has no new SOL spend");
});

test("exit.triggered decodes rule + sell portion; a partial trigger is a take-profit leg", () => {
  const e = envelopeToTradeEvent(envelope("exit.triggered", { position_key: "k.0", rule: "profit_target", sell_portion_pct: 50, trigger_price_sol: "0.0002" }) as never);
  assert.ok(e);
  assert.equal(e.kind, "sold");
  assert.equal(e.exitReason, "profit_target");
  assert.equal(e.partial, true);
  const full = envelopeToTradeEvent(envelope("exit.triggered", { rule: "peak_trail", sell_portion_pct: 100 }) as never);
  assert.equal(full?.partial, false);
});

test("screener.scored: tradeable:false + skip_reason becomes the Not-tradeable reason code", () => {
  const e = envelopeToTradeEvent(envelope("screener.scored", {
    passed: false, tradeable: false, skip_reason: "UNSUPPORTED_QUOTE_MINT", quote_mint: "Quote111",
    summary: "QUILL pays out in another token", result: { score: 12, score_threshold: 60, checks: [{ id: "liquidity", class: "hard", passed: false, measured: 1200, points: 0, reason: "thin" }] },
  }, { actor: "screener" }) as never);
  assert.ok(e);
  assert.equal(e.reasonCode, "UNSUPPORTED_QUOTE_MINT");
  assert.equal(e.message, "QUILL pays out in another token");
  assert.equal(e.checks?.[0].name, "liquidity");
  assert.equal(e.checks?.[0].passed, false);
  assert.equal(e.checks?.[0].hard, true);
});

test("guard.result checks map PASS/FAIL and keep their measured value", () => {
  const e = envelopeToTradeEvent(envelope("guard.result", { verdict: "FAIL", checks: [{ name: "lp_safety", status: "FAIL", measured: 0, reason: "LP unlocked" }] }, { actor: "guard" }) as never);
  assert.ok(e);
  assert.equal(e.kind, "blocked");
  assert.equal(e.reason, undefined);
  assert.equal(e.checks?.[0].passed, false);
  assert.equal(e.checks?.[0].measured, "0");
});

test("coin rows pass the wire tradeable flag through; a missing flag stays tradeable", () => {
  const base = {
    mint: "Mint111", venue: "pumpfun", launchpad: "pumpfun", decimals: 6, token_program: "spl_token", quote_mint: null,
    untrusted: { symbol: "QUILL" }, strategy_id: "s1", strategy_name: "Scalper", mode: "practice", status: "watching",
    last_event_at: "2026-11-06T03:00:00.000Z", pnl_lamports: null, market_cap_lamports: null, mcap_usd: null,
    mcap_as_of: null, mcap_source: "unavailable", logo_hash: null,
  } as unknown as CoinWire;
  assert.equal(coinSummaryFromWire({ ...base, tradeable: false, skip_reason: "UNSUPPORTED_QUOTE_MINT" }).screenerState, "UNSUPPORTED_QUOTE_MINT");
  assert.equal(coinSummaryFromWire({ ...base, tradeable: true, skip_reason: null }).screenerState, undefined);
});
