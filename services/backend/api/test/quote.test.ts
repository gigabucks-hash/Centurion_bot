// The TS quote port must match papersim (shared vectors, also asserted by the Rust tests).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateBuy, estimateSell } from "../src/quote.ts";
import { ApiError } from "../src/errors.ts";

const v = JSON.parse(readFileSync(new URL("../../crates/papersim/tests/quote_vectors.json", import.meta.url), "utf8"));

test("buy vectors match papersim", () => {
  for (const c of v.buy) {
    const q = estimateBuy({ sol_reserve: c.sol_reserve, token_reserve: c.token_reserve, quote_mint: null },
      BigInt(c.amount_lamports), c.decimals, c.max_slippage_bps, c.ata_exists, 0);
    assert.equal(q.min_out_raw, c.min_out_raw);
    assert.equal(q.total_max_lamports, c.total_max_lamports);
    assert.equal(q.est_ata_rent_lamports, c.ata_exists ? "0" : "2039280");
    assert.equal(q.est_network_fee_lamports, "25000");
    assert.equal(q.quote_expires_at, "1970-01-01T00:00:15.000Z");
  }
});

test("sell vectors match papersim", () => {
  for (const c of v.sell) {
    const q = estimateSell({ sol_reserve: c.sol_reserve, token_reserve: c.token_reserve, quote_mint: null },
      BigInt(c.qty_raw), c.decimals, c.max_slippage_bps, 0);
    assert.equal(q.expected_out_lamports, c.expected_out_lamports);
    assert.equal(q.min_out_lamports, c.min_out_lamports);
    assert.equal(q.total_max_lamports, "25000");
  }
});

test("non-SOL quote and empty pools are refused", () => {
  assert.throws(() => estimateBuy({ sol_reserve: 1, token_reserve: 1, quote_mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }, 1n, 6, 0, true),
    (e: unknown) => e instanceof ApiError && e.code === "UNSUPPORTED_QUOTE_MINT");
  assert.throws(() => estimateSell({ sol_reserve: 0, token_reserve: 1, quote_mint: null }, 1n, 6, 0),
    (e: unknown) => e instanceof ApiError && e.code === "POOL_STALE");
});
