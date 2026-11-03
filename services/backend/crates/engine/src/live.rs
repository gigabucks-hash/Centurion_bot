//! LiveExecutor: DESIGN-ONLY in P1. There is no key material, no transaction building, no
//! signing and no network send anywhere in this crate. `submit` validates the order against
//! the allowlist (so the rules are tested now) and then always refuses with `RealLocked`.
//! Enabling Real is a Phase 7 change that needs Boss's explicit approval.
use serde::Serialize;

/// Programs a future live swap may route through (read from the Spec; P1 never calls them).
pub const PROGRAM_ALLOWLIST: &[(&str, &str)] = &[
    ("jupiter_v6", "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"),
    (
        "pumpswap_amm",
        "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    ),
    (
        "raydium_amm_v4",
        "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    ),
    (
        "raydium_cpmm",
        "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
    ),
    (
        "meteora_damm_v2",
        "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
    ),
];

pub const WSOL_MINT: &str = "So11111111111111111111111111111111111111112";

#[derive(Debug, Clone, Serialize)]
pub struct LiveOrder {
    pub strategy_key: String,
    pub mint: String,
    pub program_id: String,
    pub input_mint: String,
    pub lamports_in: u64,
    pub max_slippage_bps: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum LiveRefused {
    #[error("program not on the allowlist: {0}")]
    ProgramNotAllowed(String),
    #[error("only SOL-quoted buys are allowed")]
    InputNotSol,
    #[error("size {0} lamports over the per-trade cap {1}")]
    OverCap(u64, u64),
    #[error("slippage {0} bps over the cap {1}")]
    SlippageTooHigh(u32, u32),
    #[error("zero size")]
    ZeroSize,
    /// Always returned in P1 after validation: Real is locked (needs_owner_approval).
    #[error("real trading is locked (needs_owner_approval); P1 is paper only")]
    RealLocked,
}

pub struct LiveExecutor {
    pub per_trade_cap_lamports: u64,
    pub max_slippage_bps: u32,
}

impl LiveExecutor {
    pub fn validate(&self, o: &LiveOrder) -> Result<(), LiveRefused> {
        if !PROGRAM_ALLOWLIST.iter().any(|(_, id)| *id == o.program_id) {
            return Err(LiveRefused::ProgramNotAllowed(o.program_id.clone()));
        }
        if o.input_mint != WSOL_MINT {
            return Err(LiveRefused::InputNotSol);
        }
        if o.lamports_in == 0 {
            return Err(LiveRefused::ZeroSize);
        }
        if o.lamports_in > self.per_trade_cap_lamports {
            return Err(LiveRefused::OverCap(
                o.lamports_in,
                self.per_trade_cap_lamports,
            ));
        }
        if o.max_slippage_bps > self.max_slippage_bps {
            return Err(LiveRefused::SlippageTooHigh(
                o.max_slippage_bps,
                self.max_slippage_bps,
            ));
        }
        Ok(())
    }

    /// Never sends. Validation errors first (so they are visible), then `RealLocked`.
    pub fn submit(&self, o: &LiveOrder) -> Result<std::convert::Infallible, LiveRefused> {
        self.validate(o)?;
        Err(LiveRefused::RealLocked)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn order() -> LiveOrder {
        LiveOrder {
            strategy_key: "swing_hunter".into(),
            mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v".into(),
            program_id: PROGRAM_ALLOWLIST[0].1.into(),
            input_mint: WSOL_MINT.into(),
            lamports_in: 500_000_000,
            max_slippage_bps: 300,
        }
    }
    fn ex() -> LiveExecutor {
        LiveExecutor {
            per_trade_cap_lamports: 500_000_000,
            max_slippage_bps: 500,
        }
    }

    #[test]
    fn valid_order_is_still_refused() {
        assert!(ex().validate(&order()).is_ok());
        assert_eq!(ex().submit(&order()).unwrap_err(), LiveRefused::RealLocked);
    }

    #[test]
    fn rejections() {
        let mut o = order();
        o.program_id = "11111111111111111111111111111111".into();
        assert!(matches!(
            ex().submit(&o),
            Err(LiveRefused::ProgramNotAllowed(_))
        ));
        let mut o = order();
        o.input_mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v".into();
        assert_eq!(ex().submit(&o).unwrap_err(), LiveRefused::InputNotSol);
        let mut o = order();
        o.lamports_in = 500_000_001;
        assert!(matches!(ex().submit(&o), Err(LiveRefused::OverCap(..))));
        let mut o = order();
        o.lamports_in = 0;
        assert_eq!(ex().submit(&o).unwrap_err(), LiveRefused::ZeroSize);
        let mut o = order();
        o.max_slippage_bps = 501;
        assert!(matches!(
            ex().submit(&o),
            Err(LiveRefused::SlippageTooHigh(..))
        ));
    }
}
