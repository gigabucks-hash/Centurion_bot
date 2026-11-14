//! Pure timing and fee math for a live swap. Nothing here signs, stores a key, or talks to the network.
//! The allowlist, min-out, and tip cap stay in `tx` and `limits`. This module only decides how fast
//! the already-checked swap is built and sent.

use std::time::{Duration, Instant};

use serde_json::{json, Value};

/// Confirmation never waits for `finalized`. One confirmed slot is enough to treat the swap as landed.
pub const CONFIRM_COMMITMENT: &str = "confirmed";

/// Quotes are reused only for this long. A memecoin price older than that is not reused.
pub const QUOTE_TTL: Duration = Duration::from_millis(1_500);

/// A cached blockhash older than this is fetched again. The background task refreshes well inside this.
pub const BLOCKHASH_TTL: Duration = Duration::from_secs(20);

/// Public Jito transaction endpoint. Used only when the owner turns Jito on. Off by default.
pub const JITO_TX: &str = "https://mainnet.block-engine.jito.wtf/api/v1/transactions";

/// Default percentile of recent prioritization fees. The lamport cap defaults to 0, so this spends nothing
/// until the owner raises the priority-fee cap.
pub const DEFAULT_FEE_PERCENTILE: u8 = 75;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct StageUs {
    pub quote: u64,
    pub build: u64,
    pub sign: u64,
    pub send: u64,
    pub confirm: u64,
}

impl StageUs {
    pub fn total(self) -> u64 {
        self.quote
            .saturating_add(self.build)
            .saturating_add(self.sign)
            .saturating_add(self.send)
            .saturating_add(self.confirm)
    }

    pub fn log_line(self) -> String {
        format!(
            "trade_latency quote_us={} build_us={} sign_us={} send_us={} confirm_us={} total_us={}",
            self.quote,
            self.build,
            self.sign,
            self.send,
            self.confirm,
            self.total()
        )
    }
}

/// Delays measured against the public Jupiter and Solana endpoints (cold vs warm), plus a
/// stand-in for preflight simulation and for polling `finalized` (the old path did not time it).
#[cfg(test)]
#[derive(Clone, Copy, Debug)]
pub struct StageDelays {
    pub quote_cold_ms: u64,
    pub quote_warm_ms: u64,
    pub build_ms: u64,
    pub rpc_ms: u64,
    pub sim_ms: u64,
    pub send_ms: u64,
    pub confirm_poll_ms: u64,
    pub confirm_polls: u64,
    pub confirm_ws_ms: u64,
}

#[cfg(test)]
impl StageDelays {
    /// One sample from this environment on 2026-11-14, plus the preflight and confirm stand-ins.
    pub fn measured() -> Self {
        Self {
            quote_cold_ms: 68,
            quote_warm_ms: 24,
            build_ms: 45,
            rpc_ms: 40,
            sim_ms: 80,
            send_ms: 40,
            confirm_poll_ms: 200,
            confirm_polls: 4,
            confirm_ws_ms: 50,
        }
    }
}

#[cfg(test)]
fn ms(n: u64) -> u64 {
    n.saturating_mul(1_000)
}

/// The path `real_prepare_swap` / `real_submit` used before this change:
/// a new connection for the quote, then the swap, then `sendTransaction` with preflight on,
/// then several `finalized`-style polls. Sign time is the wallet and is the same on both paths, so it is 0 here.
#[cfg(test)]
pub fn predict_baseline(d: StageDelays) -> StageUs {
    let send = d.send_ms.saturating_add(d.sim_ms);
    let confirm = d.confirm_poll_ms.saturating_mul(d.confirm_polls);
    StageUs {
        quote: ms(d.quote_cold_ms),
        build: ms(d.build_ms),
        sign: 0,
        send: ms(send),
        confirm: ms(confirm),
    }
}

/// Warm connection, quote overlapped with blockhash, fees and balance, simulation done once
/// before broadcast, `skipPreflight`, one websocket confirmation.
#[cfg(test)]
pub fn predict_fast(d: StageDelays, quote_cached: bool) -> StageUs {
    // Quote, blockhash, fees and balance share one wait: the slower of the quote and the RPC.
    let quote_ms = if quote_cached {
        0
    } else {
        d.quote_warm_ms.max(d.rpc_ms)
    };
    StageUs {
        quote: ms(quote_ms),
        build: ms(d.build_ms.saturating_add(d.sim_ms)),
        sign: 0,
        send: ms(d.send_ms),
        confirm: ms(d.confirm_ws_ms),
    }
}

/// `samples` are micro-lamports per compute unit from `getRecentPrioritizationFees`.
pub fn percentile_u64(samples: &[u64], percentile: u8) -> u64 {
    if samples.is_empty() {
        return 0;
    }
    let mut v = samples.to_vec();
    v.sort_unstable();
    let p = usize::from(percentile.min(100));
    let n = v.len();
    let idx = if p == 0 {
        0
    } else {
        let rank = p.saturating_mul(n).saturating_add(99) / 100;
        rank.saturating_sub(1).min(n - 1)
    };
    v[idx]
}

/// Total priority fee in lamports: percentile price × compute units, never above the owner's cap.
/// A cap of 0 spends nothing, even when the percentile would otherwise be high.
pub fn priority_fee_lamports(micro_per_cu: u64, cu: u32, cap: u64) -> u64 {
    if cap == 0 || cu == 0 || micro_per_cu == 0 {
        return 0;
    }
    let total = u128::from(micro_per_cu).saturating_mul(u128::from(cu)) / 1_000_000;
    u64::try_from(total).unwrap_or(u64::MAX).min(cap)
}

pub fn micro_lamports_per_cu(total_lamports: u64, cu: u32) -> u64 {
    if cu == 0 {
        return 0;
    }
    u64::try_from(u128::from(total_lamports).saturating_mul(1_000_000) / u128::from(cu))
        .unwrap_or(u64::MAX)
}

/// Compute-unit limit from a simulation. This is not the 200_000 default.
pub fn cu_limit_from_sim(units_consumed: u64) -> u32 {
    if units_consumed == 0 {
        return 1_000;
    }
    let padded = units_consumed.saturating_mul(11) / 10;
    u32::try_from(padded.clamp(1_000, 1_400_000)).unwrap_or(1_400_000)
}

pub fn blockhash_fresh(fetched: Instant, now: Instant) -> bool {
    now.saturating_duration_since(fetched) < BLOCKHASH_TTL
}

pub fn quote_fresh(fetched: Instant, now: Instant) -> bool {
    now.saturating_duration_since(fetched) < QUOTE_TTL
}

/// The fast RPC is an optional hook. Empty means off: the owner's normal RPC is used.
pub fn rpc_in_use<'a>(primary: &'a str, fast: &'a str) -> &'a str {
    if fast.is_empty() {
        primary
    } else {
        fast
    }
}

pub fn ws_url(http_url: &str) -> Option<String> {
    http_url
        .strip_prefix("https://")
        .map(|rest| format!("wss://{rest}"))
        .or_else(|| {
            http_url
                .strip_prefix("http://")
                .map(|rest| format!("ws://{rest}"))
        })
}

/// Jito costs a tip on every trade. It stays off unless the owner enabled it and set a tip above 0.
pub fn jito_url(enabled: bool, tip_lamports: u64) -> Option<&'static str> {
    if enabled && tip_lamports > 0 {
        Some(JITO_TX)
    } else {
        None
    }
}

/// `skipPreflight` only after a simulation of this exact transaction already succeeded.
pub fn send_config(simulated_ok: bool) -> Value {
    json!({
        "encoding": "base64",
        "skipPreflight": simulated_ok,
        "maxRetries": 0,
        "preflightCommitment": CONFIRM_COMMITMENT
    })
}

/// Jupiter fee field. Unbounded `"auto"` is sent only when the owner set a cap above 0; the built
/// transaction is then patched down to the capped percentile. A cap of 0 sends 0. Jito, when on,
/// sends the owner's tip and nothing above it.
pub fn prioritization_fee_field(cap: u64, jito: bool, tip: u64) -> Value {
    if jito && tip > 0 {
        json!({ "jitoTipLamports": tip })
    } else if cap > 0 {
        json!("auto")
    } else {
        json!(0)
    }
}

pub fn swap_body(quote: &Value, wallet: &str, fee: Value) -> Value {
    json!({
        "quoteResponse": quote,
        "userPublicKey": wallet,
        "wrapAndUnwrapSol": true,
        "dynamicComputeUnitLimit": true,
        "prioritizationFeeLamports": fee
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SellDecision {
    Allow,
    InFlight,
    AlreadyClosed,
}

/// `tracked` is `None` when this mint was not bought through the book (a manual sell is allowed).
/// `Some(true)` is an open position. `Some(false)` means every recorded row for the mint is already closed.
pub fn sell_decision(tracked_open: Option<bool>, in_flight: bool) -> SellDecision {
    if in_flight {
        return SellDecision::InFlight;
    }
    match tracked_open {
        Some(false) => SellDecision::AlreadyClosed,
        _ => SellDecision::Allow,
    }
}

/// Open positions counted toward the cap, including buys and sells that are signed but not confirmed.
#[cfg(test)]
pub fn pending_exposure(buys: &[(bool, u64)]) -> (u64, i64) {
    let sol = buys
        .iter()
        .filter(|(buy, _)| *buy)
        .fold(0u64, |s, (_, n)| s.saturating_add(*n));
    let delta = buys.iter().filter(|(buy, _)| *buy).count() as i64
        - buys.iter().filter(|(buy, _)| !*buy).count() as i64;
    (sol, delta)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentile_and_cap() {
        let samples = [10u64, 20, 30, 40, 100];
        assert_eq!(percentile_u64(&samples, 0), 10);
        assert_eq!(percentile_u64(&samples, 50), 30);
        assert_eq!(percentile_u64(&samples, 100), 100);
        assert_eq!(percentile_u64(&[], 75), 0);
        // 100 micro-lamports/CU * 50_000 CU = 5 lamports, under a 1_000 cap.
        assert_eq!(priority_fee_lamports(100, 50_000, 1_000), 5);
        assert_eq!(priority_fee_lamports(100, 50_000, 0), 0);
        assert_eq!(priority_fee_lamports(1_000_000, 1_400_000, 50), 50);
    }

    #[test]
    fn compute_limit_comes_from_the_simulation() {
        assert_eq!(cu_limit_from_sim(0), 1_000);
        assert_eq!(cu_limit_from_sim(50_000), 55_000);
        assert_eq!(cu_limit_from_sim(2_000_000), 1_400_000);
        assert_ne!(cu_limit_from_sim(50_000), 200_000);
    }

    #[test]
    fn jito_and_fast_rpc_stay_off() {
        assert!(jito_url(false, 10_000).is_none());
        assert!(jito_url(true, 0).is_none());
        assert_eq!(jito_url(true, 1).unwrap(), JITO_TX);
        assert_eq!(
            rpc_in_use("https://api.mainnet-beta.solana.com", ""),
            "https://api.mainnet-beta.solana.com"
        );
        assert_eq!(
            rpc_in_use("https://a.example", "https://b.example"),
            "https://b.example"
        );
        assert_eq!(
            ws_url("https://api.mainnet-beta.solana.com").as_deref(),
            Some("wss://api.mainnet-beta.solana.com")
        );
    }

    #[test]
    fn skip_preflight_requires_a_simulation() {
        assert_eq!(send_config(false)["skipPreflight"], false);
        assert_eq!(send_config(true)["skipPreflight"], true);
        assert_eq!(send_config(true)["maxRetries"], 0);
        assert_eq!(send_config(true)["preflightCommitment"], "confirmed");
        assert_ne!(CONFIRM_COMMITMENT, "finalized");
    }

    #[test]
    fn fee_field_respects_the_cap_and_the_jito_switch() {
        assert_eq!(prioritization_fee_field(0, false, 0), json!(0));
        assert_eq!(prioritization_fee_field(5_000, false, 0), json!("auto"));
        assert_eq!(
            prioritization_fee_field(5_000, true, 1_000)["jitoTipLamports"],
            1_000
        );
        let body = swap_body(&json!({"inAmount": "1"}), "Wallet", json!(0));
        assert_eq!(body["dynamicComputeUnitLimit"], true);
        assert_eq!(body["wrapAndUnwrapSol"], true);
    }

    #[test]
    fn a_second_sell_of_the_same_mint_is_refused() {
        assert_eq!(sell_decision(Some(true), false), SellDecision::Allow);
        assert_eq!(sell_decision(Some(true), true), SellDecision::InFlight);
        assert_eq!(
            sell_decision(Some(false), false),
            SellDecision::AlreadyClosed
        );
        assert_eq!(sell_decision(None, false), SellDecision::Allow);
        let (sol, delta) = pending_exposure(&[(true, 10), (true, 5), (false, 0)]);
        assert_eq!(sol, 15);
        assert_eq!(delta, 1);
    }

    #[test]
    fn fast_path_is_shorter_than_the_serialized_path() {
        let d = StageDelays::measured();
        let base = predict_baseline(d);
        let fast = predict_fast(d, false);
        let cached = predict_fast(d, true);
        assert!(
            fast.total() < base.total(),
            "{} vs {}",
            fast.total(),
            base.total()
        );
        assert!(
            cached.total() < fast.total(),
            "{} vs {}",
            cached.total(),
            fast.total()
        );
        assert!(base.send > fast.send, "preflight sits on the baseline send");
        assert_eq!(fast.confirm, ms(d.confirm_ws_ms));
        assert!(base.confirm > fast.confirm);
        assert!(cached.quote < base.quote);
    }
}
