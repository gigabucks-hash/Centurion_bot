//! Fill model (constant-product, also valid for pump-style virtual-reserve curves).
//!
//! Pipeline for one order:
//! 1. **Latency**: during `latency_ms`, competing same-direction flow of
//!    `competing_flow_sol_per_sec` hits the pool first (we are never first in line).
//! 2. **Swap fee** (`swap_fee_bps`, platform + pool) taken on the SOL side.
//! 3. **Price impact** from the CPMM formula `out = R_out * in / (R_in + in)`.
//! 4. **Adverse drift** `adverse_drift_bps_per_sec * latency` applied to the output.
//! 5. **Slippage guard**: compare actual output with the quote taken at decision time
//!    (step 2+3 on the pre-latency pool); reject if worse than `max_slippage_bps`.
//! 6. **Network cost**: base fee + priority fee (`cu_limit * cu_price`) in SOL.
use common::LAMPORTS_PER_SOL;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PoolState {
    /// SOL side (real or virtual) reserve.
    pub sol_reserve: f64,
    /// Token side reserve, UI units.
    pub token_reserve: f64,
}

impl PoolState {
    /// Mid price in SOL per token.
    pub fn mid_price(&self) -> f64 {
        self.sol_reserve / self.token_reserve
    }
    fn swap_sol_in(&self, sol_in: f64) -> (f64, PoolState) {
        let out = self.token_reserve * sol_in / (self.sol_reserve + sol_in);
        (
            out,
            PoolState {
                sol_reserve: self.sol_reserve + sol_in,
                token_reserve: self.token_reserve - out,
            },
        )
    }
    fn swap_tokens_in(&self, tok_in: f64) -> (f64, PoolState) {
        let out = self.sol_reserve * tok_in / (self.token_reserve + tok_in);
        (
            out,
            PoolState {
                sol_reserve: self.sol_reserve - out,
                token_reserve: self.token_reserve + tok_in,
            },
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Side {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Order {
    pub side: Side,
    /// SOL for buys, tokens for sells.
    pub amount_in: f64,
    pub max_slippage_bps: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SimConfig {
    pub swap_fee_bps: u32,
    pub base_fee_lamports: u64,
    pub cu_limit: u64,
    pub cu_price_micro_lamports: u64,
    pub latency_ms: u64,
    pub competing_flow_sol_per_sec: f64,
    pub adverse_drift_bps_per_sec: f64,
}

impl Default for SimConfig {
    fn default() -> Self {
        Self {
            swap_fee_bps: 125,
            base_fee_lamports: 5_000,
            cu_limit: 200_000,
            cu_price_micro_lamports: 100_000, // 200k CU * 0.1 lamport/CU = 20_000 lamports
            latency_ms: 400,
            competing_flow_sol_per_sec: 0.0,
            adverse_drift_bps_per_sec: 0.0,
        }
    }
}

impl SimConfig {
    pub fn network_fee_sol(&self) -> f64 {
        let priority = self.cu_limit.saturating_mul(self.cu_price_micro_lamports) / 1_000_000;
        (self.base_fee_lamports + priority) as f64 / LAMPORTS_PER_SOL as f64
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Fill {
    pub side: Side,
    /// SOL into the swap for buys (before fee), SOL out to the wallet for sells (after fee).
    pub sol_amount: f64,
    pub token_amount: f64,
    pub mid_price_before: f64,
    /// SOL per token actually paid/received (incl. swap fee, excl. network fee).
    pub exec_price: f64,
    pub price_impact_bps: f64,
    pub slippage_vs_quote_bps: f64,
    pub swap_fee_sol: f64,
    pub network_fee_sol: f64,
    pub latency_ms: u64,
    pub simulated: bool,
    pub pool_after: PoolState,
}

impl Fill {
    /// Net SOL change for the wallet (negative for buys).
    pub fn wallet_sol_delta(&self) -> f64 {
        match self.side {
            Side::Buy => -(self.sol_amount + self.network_fee_sol),
            Side::Sell => self.sol_amount - self.network_fee_sol,
        }
    }
}

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum SimError {
    #[error("invalid order: {0}")]
    InvalidOrder(&'static str),
    #[error("pool has no liquidity")]
    EmptyPool,
    #[error("slippage {actual_bps:.1} bps exceeds max {max_bps} bps")]
    SlippageExceeded { actual_bps: f64, max_bps: u32 },
}

fn bps(x: u32) -> f64 {
    f64::from(x) / 10_000.0
}

/// Output of one leg on a given pool, after fee. Returns (out, sol_fee, pool_after).
fn leg(pool: &PoolState, side: Side, amount_in: f64, fee: f64) -> (f64, f64, PoolState) {
    match side {
        Side::Buy => {
            let fee_sol = amount_in * fee;
            let (out, p) = pool.swap_sol_in(amount_in - fee_sol);
            (out, fee_sol, p)
        }
        Side::Sell => {
            let (gross, p) = pool.swap_tokens_in(amount_in);
            let fee_sol = gross * fee;
            (gross - fee_sol, fee_sol, p)
        }
    }
}

/// Simulate a fill. Deterministic for a given (pool, order, config).
pub fn simulate(pool: &PoolState, order: &Order, cfg: &SimConfig) -> Result<Fill, SimError> {
    if !(order.amount_in.is_finite() && order.amount_in > 0.0) {
        return Err(SimError::InvalidOrder("amount_in must be > 0"));
    }
    if !(pool.sol_reserve > 0.0 && pool.token_reserve > 0.0) {
        return Err(SimError::EmptyPool);
    }
    let fee = bps(cfg.swap_fee_bps);
    let secs = cfg.latency_ms as f64 / 1000.0;

    // Quote at decision time.
    let (quote_out, _, _) = leg(pool, order.side, order.amount_in, fee);

    // Competing flow lands first (always same direction = worst case for us).
    let flow_sol = cfg.competing_flow_sol_per_sec * secs;
    let pool_at_exec = if flow_sol > 0.0 {
        match order.side {
            Side::Buy => pool.swap_sol_in(flow_sol).1,
            Side::Sell => {
                let tok = flow_sol / pool.mid_price();
                pool.swap_tokens_in(tok).1
            }
        }
    } else {
        *pool
    };

    let (raw_out, swap_fee_sol, pool_after) = leg(&pool_at_exec, order.side, order.amount_in, fee);
    let drift = (cfg.adverse_drift_bps_per_sec * secs / 10_000.0).clamp(0.0, 0.99);
    let out = raw_out * (1.0 - drift);

    let slippage_vs_quote_bps = (1.0 - out / quote_out) * 10_000.0;
    if slippage_vs_quote_bps > f64::from(order.max_slippage_bps) {
        return Err(SimError::SlippageExceeded {
            actual_bps: slippage_vs_quote_bps,
            max_bps: order.max_slippage_bps,
        });
    }

    let mid = pool.mid_price();
    let (sol_amount, token_amount) = match order.side {
        Side::Buy => (order.amount_in, out),
        Side::Sell => (out, order.amount_in),
    };
    let exec_price = sol_amount / token_amount;
    // Pure CPMM impact on the pre-latency pool, excluding fees.
    let price_impact_bps = match order.side {
        Side::Buy => {
            let (o, _) = pool.swap_sol_in(order.amount_in);
            ((order.amount_in / o) / mid - 1.0) * 10_000.0
        }
        Side::Sell => {
            let (o, _) = pool.swap_tokens_in(order.amount_in);
            (1.0 - (o / order.amount_in) / mid) * 10_000.0
        }
    };

    Ok(Fill {
        side: order.side,
        sol_amount,
        token_amount,
        mid_price_before: mid,
        exec_price,
        price_impact_bps,
        slippage_vs_quote_bps,
        swap_fee_sol,
        network_fee_sol: cfg.network_fee_sol(),
        latency_ms: cfg.latency_ms,
        simulated: true,
        pool_after,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // ~pump.fun-like virtual reserves: 30 SOL / 1.073e9 tokens.
    fn pool() -> PoolState {
        PoolState {
            sol_reserve: 30.0,
            token_reserve: 1_073_000_000.0,
        }
    }
    fn buy(sol: f64) -> Order {
        Order {
            side: Side::Buy,
            amount_in: sol,
            max_slippage_bps: 1_000,
        }
    }
    fn zero_cost() -> SimConfig {
        SimConfig {
            swap_fee_bps: 0,
            base_fee_lamports: 0,
            cu_price_micro_lamports: 0,
            latency_ms: 0,
            ..Default::default()
        }
    }

    #[test]
    fn tiny_trade_fills_near_mid_with_no_fees() {
        let f = simulate(&pool(), &buy(1e-6), &zero_cost()).expect("fill");
        assert!((f.exec_price / f.mid_price_before - 1.0).abs() < 1e-6);
        assert!(f.price_impact_bps < 0.01);
        assert!(f.simulated);
    }

    #[test]
    fn cpmm_math_matches_closed_form() {
        // 3 SOL into 30/1.073e9 -> out = 1.073e9 * 3 / 33
        let f = simulate(&pool(), &buy(3.0), &zero_cost()).expect("fill");
        assert!((f.token_amount - 1_073_000_000.0 * 3.0 / 33.0).abs() < 1e-3);
        // impact = (33/30 - 1) = 1000 bps
        assert!((f.price_impact_bps - 1_000.0).abs() < 1e-6);
        // k is preserved
        let k0 = pool().sol_reserve * pool().token_reserve;
        let k1 = f.pool_after.sol_reserve * f.pool_after.token_reserve;
        assert!((k1 / k0 - 1.0).abs() < 1e-12);
    }

    #[test]
    fn impact_grows_with_size() {
        let c = zero_cost();
        let a = simulate(&pool(), &buy(0.1), &c)
            .expect("fill")
            .price_impact_bps;
        let b = simulate(&pool(), &buy(1.0), &c)
            .expect("fill")
            .price_impact_bps;
        assert!(b > a && a > 0.0);
    }

    #[test]
    fn fees_and_network_cost() {
        let cfg = SimConfig {
            latency_ms: 0,
            ..Default::default()
        };
        let f = simulate(&pool(), &buy(1.0), &cfg).expect("fill");
        assert!((f.swap_fee_sol - 0.0125).abs() < 1e-12);
        // 5000 + 200_000 * 100_000 / 1e6 = 25_000 lamports
        assert!((f.network_fee_sol - 0.000_025).abs() < 1e-12);
        assert!((f.wallet_sol_delta() + 1.000_025).abs() < 1e-12);
    }

    #[test]
    fn round_trip_loses_at_least_two_fees() {
        let cfg = SimConfig {
            latency_ms: 0,
            ..Default::default()
        };
        let b = simulate(&pool(), &buy(0.5), &cfg).expect("buy");
        let s_order = Order {
            side: Side::Sell,
            amount_in: b.token_amount,
            max_slippage_bps: 1_000,
        };
        let s = simulate(&b.pool_after, &s_order, &cfg).expect("sell");
        let pnl = b.wallet_sol_delta() + s.wallet_sol_delta();
        assert!(pnl < -0.5 * 2.0 * 0.0125 * 0.98, "pnl {pnl}");
        assert!(pnl > -0.5 * 0.05);
    }

    #[test]
    fn latency_with_competing_flow_worsens_fill_and_can_reject() {
        let base = SimConfig {
            competing_flow_sol_per_sec: 0.0,
            ..Default::default()
        };
        let busy = SimConfig {
            competing_flow_sol_per_sec: 0.5,
            latency_ms: 1_000,
            ..Default::default()
        };
        let a = simulate(&pool(), &buy(1.0), &base).expect("fill");
        let b = simulate(&pool(), &buy(1.0), &busy).expect("fill");
        assert!(b.token_amount < a.token_amount);
        assert!(b.slippage_vs_quote_bps > 0.0);
        let tight = Order {
            max_slippage_bps: 50,
            ..buy(1.0)
        };
        assert!(matches!(
            simulate(&pool(), &tight, &busy),
            Err(SimError::SlippageExceeded { .. })
        ));
    }

    #[test]
    fn adverse_drift_applies() {
        let cfg = SimConfig {
            adverse_drift_bps_per_sec: 100.0,
            latency_ms: 500,
            ..zero_cost()
        };
        let f = simulate(&pool(), &buy(0.01), &cfg).expect("fill");
        assert!((f.slippage_vs_quote_bps - 50.0).abs() < 1e-6);
    }

    #[test]
    fn rejects_bad_input() {
        assert!(matches!(
            simulate(&pool(), &buy(0.0), &zero_cost()),
            Err(SimError::InvalidOrder(_))
        ));
        let empty = PoolState {
            sol_reserve: 0.0,
            token_reserve: 1.0,
        };
        assert_eq!(
            simulate(&empty, &buy(1.0), &zero_cost()),
            Err(SimError::EmptyPool)
        );
    }
}

/// Wire form of a [`Fill`]: integers-as-strings and decimal strings only.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct FillWire {
    pub side: Side,
    pub simulated: bool,
    pub sol_lamports: common::Lamports,
    pub token_amount_raw: common::RawAmount,
    pub exec_price_sol: common::Dec,
    pub mid_price_sol: common::Dec,
    /// bps are JSON numbers (2 dp).
    pub price_impact_bps: f64,
    pub slippage_bps: f64,
    pub swap_fee_lamports: common::Lamports,
    pub network_fee_lamports: common::Lamports,
    pub latency_ms: u64,
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

impl Fill {
    /// Convert to the wire/DB representation. `decimals` = token mint decimals.
    pub fn to_wire(&self, decimals: u8) -> Result<FillWire, common::UnitError> {
        use common::{Dec, Lamports, RawAmount};
        Ok(FillWire {
            side: self.side,
            simulated: self.simulated,
            sol_lamports: Lamports::from_sol_f64(self.sol_amount)?,
            token_amount_raw: RawAmount::from_ui_f64(self.token_amount, decimals)?,
            exec_price_sol: Dec::from_f64(self.exec_price, 12)?,
            mid_price_sol: Dec::from_f64(self.mid_price_before, 12)?,
            price_impact_bps: round2(self.price_impact_bps),
            slippage_bps: round2(self.slippage_vs_quote_bps),
            swap_fee_lamports: Lamports::from_sol_f64(self.swap_fee_sol)?,
            network_fee_lamports: Lamports::from_sol_f64(self.network_fee_sol)?,
            latency_ms: self.latency_ms,
        })
    }
}

#[cfg(test)]
mod wire_tests {
    use super::*;

    #[test]
    fn wire_has_no_json_numbers_for_amounts() {
        let pool = PoolState {
            sol_reserve: 30.0,
            token_reserve: 1_073_000_000.0,
        };
        let f = simulate(
            &pool,
            &Order {
                side: Side::Buy,
                amount_in: 0.25,
                max_slippage_bps: 500,
            },
            &SimConfig::default(),
        )
        .expect("fill");
        let w = f.to_wire(6).expect("wire");
        assert_eq!(w.sol_lamports, common::Lamports(250_000_000));
        assert_eq!(w.swap_fee_lamports, common::Lamports(3_125_000));
        assert_eq!(w.network_fee_lamports, common::Lamports(25_000));
        let v = serde_json::to_value(&w).expect("json");
        for k in [
            "sol_lamports",
            "token_amount_raw",
            "exec_price_sol",
            "swap_fee_lamports",
        ] {
            assert!(v[k].is_string(), "{k} must be a string on the wire");
        }
        assert!(v["slippage_bps"].is_number(), "bps are JSON numbers");
        common::units::assert_wire_numbers(&v);
    }
}
