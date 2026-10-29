//! Paper estimates for the transaction review sheet (UX WF-22): the quote fields on an approval
//! (`ApprovalWire` / `proposal.created` / `proposal.updated`). Practice only: these are estimates
//! from the simulator's fee model and the pool state, never a signed or sent transaction.
//!
//! * `est_network_fee_lamports` = base fee + priority fee; `priority_fee_lamports` = CU limit x CU price.
//! * `swap_fee_bps` = the simulator's swap fee; `max_slippage_bps` = the order's slippage cap.
//! * `min_out_raw` = expected tokens out (after swap fee, CPMM) x (1 - max slippage), raw units, floored.
//! * `est_ata_rent_lamports` (1.1.5) = rent for the owner's token account when it does not exist yet
//!   ([`ATA_RENT_LAMPORTS`]), else 0.
//! * `total_max_lamports` = SOL in + `est_network_fee_lamports` + `est_ata_rent_lamports` (the most the buy can
//!   cost). The network fee already includes the priority fee; the swap fee is taken out of SOL in, so it is not
//!   added again.
//! * Sell (1.1.5, [`estimate_sell`]): `expected_out_lamports` = CPMM SOL out for the tokens, minus the swap fee
//!   (taken from SOL out); `min_out_lamports` = expected x (1 - max slippage), floored; `total_max_lamports` = the
//!   network fee (the most the sell costs).
//! * `quote_ts` / `quote_expires_at` = when estimated, and `quote_ts + ttl`.

use serde::Serialize;

use crate::{PoolState, SimConfig};
use common::{TsMs, LAMPORTS_PER_SOL};

/// Default validity of a paper quote.
pub const QUOTE_TTL_MS: i64 = 15_000;
/// Rent-exempt minimum for a 165-byte SPL token account (the owner's ATA), in lamports.
pub const ATA_RENT_LAMPORTS: u64 = 2_039_280;

/// Wire shape (integer strings for lamports/raw amounts, numbers for bps, ISO timestamps).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct QuoteWire {
    pub est_network_fee_lamports: String,
    pub priority_fee_lamports: String,
    pub swap_fee_bps: u32,
    pub max_slippage_bps: u32,
    pub min_out_raw: String,
    pub est_ata_rent_lamports: String,
    pub total_max_lamports: String,
    pub quote_ts: String,
    pub quote_expires_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BuyQuote {
    pub est_network_fee_lamports: u64,
    pub priority_fee_lamports: u64,
    pub swap_fee_bps: u32,
    pub max_slippage_bps: u32,
    pub min_out_raw: u128,
    pub est_ata_rent_lamports: u64,
    pub total_max_lamports: u64,
    pub quote_ts: TsMs,
    pub quote_expires_at: TsMs,
}

/// 1.1.5 sell quote (manual close preview, sell proposals).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SellQuote {
    pub est_network_fee_lamports: u64,
    pub priority_fee_lamports: u64,
    pub swap_fee_bps: u32,
    pub max_slippage_bps: u32,
    pub expected_out_lamports: u64,
    pub min_out_lamports: u64,
    pub total_max_lamports: u64,
    pub quote_ts: TsMs,
    pub quote_expires_at: TsMs,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SellQuoteWire {
    pub est_network_fee_lamports: String,
    pub priority_fee_lamports: String,
    pub swap_fee_bps: u32,
    pub max_slippage_bps: u32,
    pub expected_out_lamports: String,
    pub min_out_lamports: String,
    pub total_max_lamports: String,
    pub quote_ts: String,
    pub quote_expires_at: String,
}

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum QuoteError {
    #[error("UNSUPPORTED_QUOTE_MINT: only SOL-quoted pools are estimated")]
    UnsupportedQuote,
    #[error("pool has no liquidity")]
    EmptyPool,
    #[error("invalid input: {0}")]
    Invalid(&'static str),
}

fn check_pool(pool: &PoolState) -> Result<(), QuoteError> {
    if !pool.quote.is_sol() {
        return Err(QuoteError::UnsupportedQuote);
    }
    if !(pool.sol_reserve > 0.0 && pool.token_reserve > 0.0) {
        return Err(QuoteError::EmptyPool);
    }
    Ok(())
}

/// (priority fee, network fee incl. priority) from the simulator's fee model.
fn fees(cfg: &SimConfig) -> (u64, u64) {
    let priority = cfg.cu_limit.saturating_mul(cfg.cu_price_micro_lamports) / 1_000_000;
    (priority, cfg.base_fee_lamports.saturating_add(priority))
}

/// Estimate a buy of `amount_lamports` on `pool` (token reserve in whole tokens of `decimals`).
/// `ata_exists`: whether the owner's token account for the mint already exists (else its rent is added).
#[allow(clippy::too_many_arguments)]
pub fn estimate_buy(
    pool: &PoolState,
    amount_lamports: u64,
    decimals: u8,
    max_slippage_bps: u32,
    ata_exists: bool,
    cfg: &SimConfig,
    now: TsMs,
    ttl_ms: i64,
) -> Result<BuyQuote, QuoteError> {
    check_pool(pool)?;
    if amount_lamports == 0 || max_slippage_bps > 10_000 || decimals > 18 || ttl_ms <= 0 {
        return Err(QuoteError::Invalid(
            "amount > 0, slippage <= 10000 bps, decimals <= 18, ttl > 0",
        ));
    }
    let (priority, network) = fees(cfg);
    let rent = if ata_exists { 0 } else { ATA_RENT_LAMPORTS };
    let sol_in = amount_lamports as f64 / LAMPORTS_PER_SOL as f64;
    let after_fee = sol_in * (1.0 - f64::from(cfg.swap_fee_bps) / 10_000.0);
    let out_tokens = pool.token_reserve * after_fee / (pool.sol_reserve + after_fee);
    let min_tokens = out_tokens * (1.0 - f64::from(max_slippage_bps) / 10_000.0);
    let min_out_raw = (min_tokens * 10f64.powi(i32::from(decimals)))
        .floor()
        .max(0.0) as u128;
    Ok(BuyQuote {
        est_network_fee_lamports: network,
        priority_fee_lamports: priority,
        swap_fee_bps: cfg.swap_fee_bps,
        max_slippage_bps,
        min_out_raw,
        est_ata_rent_lamports: rent,
        total_max_lamports: amount_lamports.saturating_add(network).saturating_add(rent),
        quote_ts: now,
        quote_expires_at: now + ttl_ms,
    })
}

/// Estimate selling `qty_raw` (raw units of `decimals`) on `pool`. The swap fee is taken from SOL out.
pub fn estimate_sell(
    pool: &PoolState,
    qty_raw: u128,
    decimals: u8,
    max_slippage_bps: u32,
    cfg: &SimConfig,
    now: TsMs,
    ttl_ms: i64,
) -> Result<SellQuote, QuoteError> {
    check_pool(pool)?;
    if qty_raw == 0 || max_slippage_bps > 10_000 || decimals > 18 || ttl_ms <= 0 {
        return Err(QuoteError::Invalid(
            "qty > 0, slippage <= 10000 bps, decimals <= 18, ttl > 0",
        ));
    }
    let (priority, network) = fees(cfg);
    let tokens = qty_raw as f64 / 10f64.powi(i32::from(decimals));
    let gross_sol = pool.sol_reserve * tokens / (pool.token_reserve + tokens);
    let net_sol = gross_sol * (1.0 - f64::from(cfg.swap_fee_bps) / 10_000.0);
    let expected = (net_sol * LAMPORTS_PER_SOL as f64).floor().max(0.0) as u64;
    let min_out = (expected as f64 * (1.0 - f64::from(max_slippage_bps) / 10_000.0))
        .floor()
        .max(0.0) as u64;
    Ok(SellQuote {
        est_network_fee_lamports: network,
        priority_fee_lamports: priority,
        swap_fee_bps: cfg.swap_fee_bps,
        max_slippage_bps,
        expected_out_lamports: expected,
        min_out_lamports: min_out,
        total_max_lamports: network,
        quote_ts: now,
        quote_expires_at: now + ttl_ms,
    })
}

impl SellQuote {
    pub fn wire(&self) -> SellQuoteWire {
        SellQuoteWire {
            est_network_fee_lamports: self.est_network_fee_lamports.to_string(),
            priority_fee_lamports: self.priority_fee_lamports.to_string(),
            swap_fee_bps: self.swap_fee_bps,
            max_slippage_bps: self.max_slippage_bps,
            expected_out_lamports: self.expected_out_lamports.to_string(),
            min_out_lamports: self.min_out_lamports.to_string(),
            total_max_lamports: self.total_max_lamports.to_string(),
            quote_ts: iso(self.quote_ts),
            quote_expires_at: iso(self.quote_expires_at),
        }
    }
}

fn iso(ts: TsMs) -> String {
    let secs = ts.div_euclid(1000);
    let ms = ts.rem_euclid(1000);
    let days = secs.div_euclid(86_400);
    let sod = secs.rem_euclid(86_400);
    // civil-from-days (proleptic Gregorian), UTC
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{ms:03}Z",
        sod / 3600,
        sod % 3600 / 60,
        sod % 60
    )
}

impl BuyQuote {
    pub fn wire(&self) -> QuoteWire {
        QuoteWire {
            est_network_fee_lamports: self.est_network_fee_lamports.to_string(),
            priority_fee_lamports: self.priority_fee_lamports.to_string(),
            swap_fee_bps: self.swap_fee_bps,
            max_slippage_bps: self.max_slippage_bps,
            min_out_raw: self.min_out_raw.to_string(),
            est_ata_rent_lamports: self.est_ata_rent_lamports.to_string(),
            total_max_lamports: self.total_max_lamports.to_string(),
            quote_ts: iso(self.quote_ts),
            quote_expires_at: iso(self.quote_expires_at),
        }
    }

    /// Same rule as SQL `approval_quote_check` for Real: usable only while `now < quote_expires_at`.
    pub fn is_fresh(&self, now: TsMs) -> bool {
        self.quote_expires_at > now
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use common::QuoteAsset;

    fn pool() -> PoolState {
        PoolState {
            sol_reserve: 30.0,
            token_reserve: 1_073_000_000.0,
            quote: QuoteAsset::Sol,
        }
    }

    #[test]
    fn buy_estimate_fields() {
        let q = estimate_buy(
            &pool(),
            250_000_000,
            6,
            300,
            true,
            &SimConfig::default(),
            1_761_700_000_000,
            QUOTE_TTL_MS,
        )
        .expect("quote");
        assert_eq!(q.priority_fee_lamports, 20_000);
        assert_eq!(q.est_network_fee_lamports, 25_000);
        assert_eq!(q.total_max_lamports, 250_025_000);
        assert_eq!(q.swap_fee_bps, 125);
        // 0.246875 SOL after fee -> 1_073e6 * 0.246875 / 30.246875 tokens, minus 3 %
        let out = 1_073_000_000.0 * 0.246875 / 30.246875;
        let want = (out * 0.97 * 1e6_f64).floor() as u128;
        assert_eq!(q.min_out_raw, want);
        let w = q.wire();
        assert_eq!(w.total_max_lamports, "250025000");
        assert_eq!(w.quote_ts, "2025-10-29T01:06:40.000Z");
        assert_eq!(w.quote_expires_at, "2025-10-29T01:06:55.000Z");
        let j = serde_json::to_value(&w).expect("json");
        assert!(j["swap_fee_bps"].is_number() && j["min_out_raw"].is_string());
        assert!(q.is_fresh(1_761_700_014_999) && !q.is_fresh(1_761_700_015_000));
    }

    #[test]
    fn rejects_bad_inputs() {
        let cfg = SimConfig::default();
        assert_eq!(
            estimate_buy(&pool(), 0, 6, 100, true, &cfg, 0, 1),
            Err(QuoteError::Invalid(
                "amount > 0, slippage <= 10000 bps, decimals <= 18, ttl > 0"
            ))
        );
        assert!(estimate_buy(&pool(), 1, 6, 10_001, true, &cfg, 0, 1).is_err());
        let mut p = pool();
        p.token_reserve = 0.0;
        assert_eq!(
            estimate_buy(&p, 1, 6, 100, true, &cfg, 0, 1),
            Err(QuoteError::EmptyPool)
        );
        p = pool();
        p.quote = QuoteAsset::Other([7u8; 32]);
        assert_eq!(
            estimate_buy(&p, 1, 6, 100, true, &cfg, 0, 1),
            Err(QuoteError::UnsupportedQuote)
        );
    }

    #[test]
    fn ata_rent_is_in_total_max() {
        let cfg = SimConfig::default();
        let q = estimate_buy(&pool(), 50_000_000, 6, 500, false, &cfg, 0, 1).expect("quote");
        assert_eq!(q.est_ata_rent_lamports, ATA_RENT_LAMPORTS);
        assert_eq!(q.total_max_lamports, 50_000_000 + 25_000 + 2_039_280);
        assert_eq!(q.wire().est_ata_rent_lamports, "2039280");
    }

    #[test]
    fn sell_estimate() {
        let cfg = SimConfig::default();
        let q = estimate_sell(&pool(), 10_000_000_000_000, 6, 500, &cfg, 0, 15_000).expect("sell");
        let gross = 30.0 * 10_000_000.0 / (1_073_000_000.0 + 10_000_000.0);
        let want = (gross * (1.0 - 0.0125) * 1e9_f64).floor() as u64;
        assert_eq!(q.expected_out_lamports, want);
        assert_eq!(q.min_out_lamports, (want as f64 * 0.95).floor() as u64);
        assert_eq!(q.total_max_lamports, 25_000);
        assert!(estimate_sell(&pool(), 0, 6, 500, &cfg, 0, 1).is_err());
    }

    /// Shared vectors with the API's TypeScript port (`api/src/quote.ts`): same inputs, same outputs.
    #[test]
    fn shared_vectors() {
        let raw = include_str!("../tests/quote_vectors.json");
        let v: serde_json::Value = serde_json::from_str(raw).expect("vectors");
        let cfg = SimConfig::default();
        for c in v["buy"].as_array().expect("buy") {
            let p = PoolState {
                sol_reserve: c["sol_reserve"].as_f64().expect("f"),
                token_reserve: c["token_reserve"].as_f64().expect("f"),
                quote: QuoteAsset::Sol,
            };
            let q = estimate_buy(
                &p,
                c["amount_lamports"]
                    .as_str()
                    .expect("s")
                    .parse()
                    .expect("n"),
                c["decimals"].as_u64().expect("d") as u8,
                c["max_slippage_bps"].as_u64().expect("b") as u32,
                c["ata_exists"].as_bool().expect("b"),
                &cfg,
                0,
                QUOTE_TTL_MS,
            )
            .expect("quote");
            assert_eq!(
                q.min_out_raw.to_string(),
                c["min_out_raw"].as_str().expect("s")
            );
            assert_eq!(
                q.total_max_lamports.to_string(),
                c["total_max_lamports"].as_str().expect("s")
            );
        }
        for c in v["sell"].as_array().expect("sell") {
            let p = PoolState {
                sol_reserve: c["sol_reserve"].as_f64().expect("f"),
                token_reserve: c["token_reserve"].as_f64().expect("f"),
                quote: QuoteAsset::Sol,
            };
            let q = estimate_sell(
                &p,
                c["qty_raw"].as_str().expect("s").parse().expect("n"),
                c["decimals"].as_u64().expect("d") as u8,
                c["max_slippage_bps"].as_u64().expect("b") as u32,
                &cfg,
                0,
                QUOTE_TTL_MS,
            )
            .expect("quote");
            assert_eq!(
                q.expected_out_lamports.to_string(),
                c["expected_out_lamports"].as_str().expect("s")
            );
            assert_eq!(
                q.min_out_lamports.to_string(),
                c["min_out_lamports"].as_str().expect("s")
            );
        }
    }

    #[test]
    fn iso_formatting() {
        assert_eq!(iso(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso(951_782_400_123), "2000-02-29T00:00:00.123Z");
    }
}
