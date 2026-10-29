// Paper quotes for the review sheet and the close preview (contracts 1.1.5). A line-for-line port of
// crates/papersim/src/quote.rs (same f64 operations, same SimConfig defaults); both are checked against
// crates/papersim/tests/quote_vectors.json. Estimates only: nothing is signed or sent.
import { ApiError } from "./errors.ts";

export const QUOTE_TTL_MS = 15_000;
/** Rent-exempt minimum for a 165-byte SPL token account (the owner's ATA). */
export const ATA_RENT_LAMPORTS = 2_039_280n;
/** papersim SimConfig::default(). */
export const SIM = { swapFeeBps: 125, baseFeeLamports: 5_000n, cuLimit: 200_000n, cuPriceMicroLamports: 100_000n } as const;

export interface Pool { sol_reserve: number; token_reserve: number; quote_mint: string | null }
const WSOL = "So11111111111111111111111111111111111111112";

function checkPool(p: Pool): void {
  if (p.quote_mint !== null && p.quote_mint !== WSOL) throw new ApiError("UNSUPPORTED_QUOTE_MINT", { quote_mint: p.quote_mint });
  if (!(p.sol_reserve > 0 && p.token_reserve > 0)) throw new ApiError("POOL_STALE", { reason: "empty_pool" });
}
function fees(): { priority: bigint; network: bigint } {
  const priority = (SIM.cuLimit * SIM.cuPriceMicroLamports) / 1_000_000n;
  return { priority, network: SIM.baseFeeLamports + priority };
}
const isoMs = (ms: number) => new Date(ms).toISOString();
/** Same as Rust `x.floor().max(0.0) as u128` for finite x: BigInt(number) is exact for integral doubles. */
const floorBig = (x: number): bigint => (Number.isFinite(x) && x > 0 ? BigInt(Math.floor(x)) : 0n);

export interface BuyQuoteWire {
  est_network_fee_lamports: string; priority_fee_lamports: string; swap_fee_bps: number; max_slippage_bps: number;
  min_out_raw: string; est_ata_rent_lamports: string; total_max_lamports: string; quote_ts: string; quote_expires_at: string;
}
export interface SellQuoteWire {
  est_network_fee_lamports: string; priority_fee_lamports: string; swap_fee_bps: number; max_slippage_bps: number;
  expected_out_lamports: string; min_out_lamports: string; total_max_lamports: string; quote_ts: string; quote_expires_at: string;
}

export function estimateBuy(p: Pool, amountLamports: bigint, decimals: number, maxSlippageBps: number, ataExists: boolean,
                            now = Date.now(), ttlMs = QUOTE_TTL_MS): BuyQuoteWire {
  checkPool(p);
  if (amountLamports <= 0n || maxSlippageBps < 0 || maxSlippageBps > 10_000 || decimals < 0 || decimals > 18 || ttlMs <= 0) {
    throw new ApiError("VALIDATION_FAILED", { hint: "amount > 0, slippage 0..10000 bps, decimals 0..18" });
  }
  const { priority, network } = fees();
  const rent = ataExists ? 0n : ATA_RENT_LAMPORTS;
  const solIn = Number(amountLamports) / 1e9;
  const afterFee = solIn * (1.0 - SIM.swapFeeBps / 10_000.0);
  const outTokens = (p.token_reserve * afterFee) / (p.sol_reserve + afterFee);
  const minTokens = outTokens * (1.0 - maxSlippageBps / 10_000.0);
  return {
    est_network_fee_lamports: network.toString(), priority_fee_lamports: priority.toString(),
    swap_fee_bps: SIM.swapFeeBps, max_slippage_bps: maxSlippageBps,
    min_out_raw: floorBig(minTokens * 10 ** decimals).toString(), est_ata_rent_lamports: rent.toString(),
    total_max_lamports: (amountLamports + network + rent).toString(),
    quote_ts: isoMs(now), quote_expires_at: isoMs(now + ttlMs),
  };
}

export function estimateSell(p: Pool, qtyRaw: bigint, decimals: number, maxSlippageBps: number,
                             now = Date.now(), ttlMs = QUOTE_TTL_MS): SellQuoteWire {
  checkPool(p);
  if (qtyRaw <= 0n || maxSlippageBps < 0 || maxSlippageBps > 10_000 || decimals < 0 || decimals > 18 || ttlMs <= 0) {
    throw new ApiError("VALIDATION_FAILED", { hint: "qty > 0, slippage 0..10000 bps, decimals 0..18" });
  }
  const { priority, network } = fees();
  const tokens = Number(qtyRaw) / 10 ** decimals;
  const gross = (p.sol_reserve * tokens) / (p.token_reserve + tokens);
  const net = gross * (1.0 - SIM.swapFeeBps / 10_000.0);
  const expected = floorBig(net * 1e9);
  const minOut = floorBig(Number(expected) * (1.0 - maxSlippageBps / 10_000.0));
  return {
    est_network_fee_lamports: network.toString(), priority_fee_lamports: priority.toString(),
    swap_fee_bps: SIM.swapFeeBps, max_slippage_bps: maxSlippageBps,
    expected_out_lamports: expected.toString(), min_out_lamports: minOut.toString(),
    total_max_lamports: network.toString(), quote_ts: isoMs(now), quote_expires_at: isoMs(now + ttlMs),
  };
}
