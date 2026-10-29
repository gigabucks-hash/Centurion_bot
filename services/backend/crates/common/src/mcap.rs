//! Market cap: the single computation behind the `mcap_usd` screener metric / guard and the
//! `market_cap_lamports` / `mcap_usd` / `mcap_as_of` wire fields, so the screener column and
//! the check always agree.
//!
//! `market_cap_lamports = price (SOL per whole token) x total supply (raw units / 10^decimals) x 1e9`,
//! from curve or pool state. Unknown decimals or supply -> `None` (never assumed).
//! `mcap_usd` is display-only and indicative: lamports converted with the same configured SOL/USD
//! reference the marks use (`MARKS_SOL_USD`), not a live feed.

use serde::{Deserialize, Serialize};

use crate::{TsMs, LAMPORTS_PER_SOL};

/// Largest decimals value a mint can carry that we accept (SQL `coins.decimals` CHECK is 0..18).
pub const MAX_DECIMALS: u8 = 18;

/// Market cap facts for one observation.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct MarketCap {
    /// Whole lamports (wire: integer string).
    pub lamports: u128,
    /// Indicative USD value; `None` when no SOL/USD reference is configured.
    pub usd: Option<f64>,
    pub as_of: TsMs,
}

/// Market cap in lamports from a SOL-per-whole-token price, the raw total supply and the mint decimals.
pub fn market_cap_lamports(
    price_sol_per_token: f64,
    total_supply_raw: Option<u64>,
    decimals: Option<u8>,
) -> Option<u128> {
    let (supply, dec) = (total_supply_raw?, decimals?);
    if dec > MAX_DECIMALS || !price_sol_per_token.is_finite() || price_sol_per_token < 0.0 {
        return None;
    }
    let whole_tokens = supply as f64 / 10f64.powi(i32::from(dec));
    let lamports = (price_sol_per_token * whole_tokens * LAMPORTS_PER_SOL as f64).round();
    if !lamports.is_finite() || lamports < 0.0 || lamports >= u128::MAX as f64 {
        return None;
    }
    Some(lamports as u128)
}

/// Indicative USD value of a lamport amount with the configured SOL/USD reference.
pub fn lamports_to_usd(lamports: u128, sol_usd: Option<f64>) -> Option<f64> {
    let r = sol_usd.filter(|r| r.is_finite() && *r > 0.0)?;
    Some(lamports as f64 / LAMPORTS_PER_SOL as f64 * r)
}

/// Everything at once; `None` when decimals or supply are unknown or the price is unusable.
pub fn market_cap(
    price_sol_per_token: f64,
    total_supply_raw: Option<u64>,
    decimals: Option<u8>,
    sol_usd: Option<f64>,
    as_of: TsMs,
) -> Option<MarketCap> {
    let lamports = market_cap_lamports(price_sol_per_token, total_supply_raw, decimals)?;
    Some(MarketCap {
        lamports,
        usd: lamports_to_usd(lamports, sol_usd),
        as_of,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pump_curve_numbers() {
        // 30 SOL / 1.073e9 tokens virtual reserves, 1e9 whole tokens of 6 decimals.
        let price = 30.0 / 1_073_000_000.0;
        let l = market_cap_lamports(price, Some(1_000_000_000_000_000), Some(6)).expect("mcap");
        assert_eq!(l, 27_958_993_476); // ~27.96 SOL
        let usd = lamports_to_usd(l, Some(150.0)).expect("usd");
        assert!((usd - 4193.849).abs() < 0.01, "{usd}");
    }

    #[test]
    fn decimals_scale_the_supply() {
        let p = 0.000_001;
        let six = market_cap_lamports(p, Some(1_000_000_000_000), Some(6)).expect("6");
        let nine = market_cap_lamports(p, Some(1_000_000_000_000), Some(9)).expect("9");
        assert_eq!(six, 1_000_000_000); // 1e6 tokens x 1e-6 SOL = 1 SOL
        assert_eq!(nine, 1_000_000); // 1e3 tokens -> 0.001 SOL
    }

    #[test]
    fn unknowns_are_none_never_assumed() {
        assert_eq!(market_cap_lamports(1.0, None, Some(6)), None);
        assert_eq!(market_cap_lamports(1.0, Some(1), None), None);
        assert_eq!(market_cap_lamports(f64::NAN, Some(1), Some(6)), None);
        assert_eq!(market_cap_lamports(-1.0, Some(1), Some(6)), None);
        assert_eq!(market_cap_lamports(1.0, Some(1), Some(19)), None);
        assert_eq!(lamports_to_usd(1, None), None);
        assert_eq!(lamports_to_usd(1, Some(0.0)), None);
        let m = market_cap(1e-6, Some(1_000_000_000_000), Some(6), None, 5).expect("m");
        assert_eq!((m.lamports, m.usd, m.as_of), (1_000_000_000, None, 5));
    }
}
