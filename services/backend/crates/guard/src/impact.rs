//! Guard-change impact replay (backs `POST /v1/strategies/{id}/guard-impact`).
//!
//! Inputs are *precomputed* guard-input snapshots (one per coin evaluation, stored
//! in `guard_input_snapshots`) joined with labelled outcomes (`coin_outcomes`).
//! Re-running [`assess`] is pure CPU (~1–3 µs per sample), so a bounded window of
//! ≤ 50k samples replays in well under the 2 s budget; the DB read dominates.
use serde::{Deserialize, Serialize};

use crate::{assess, GuardConfig, GuardInput, Verdict};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Outcome {
    /// Labelled as a rug (liquidity pulled / -90% within 24h of observation).
    pub rugged: bool,
    pub worst_drawdown_pct: f64,
    pub peak_gain_pct: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Sample {
    pub input: GuardInput,
    pub outcome: Option<Outcome>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ImpactReport {
    pub samples: usize,
    pub pass_before: usize,
    pub pass_after: usize,
    pub newly_passing: usize,
    pub newly_blocked: usize,
    /// Of the newly passing coins with a known outcome, how many rugged.
    pub newly_passing_rugged: usize,
    pub newly_passing_labelled: usize,
    /// Mean max drawdown (%) of newly passing coins with a known outcome.
    pub newly_passing_avg_drawdown_pct: Option<f64>,
    /// Which config fields got weaker (empty = strengthening/neutral change).
    pub weakened_fields: Vec<String>,
}

fn passes(cfg: &GuardConfig, i: &GuardInput) -> bool {
    assess(cfg, i).verdict != Verdict::Fail
}

/// Fields where `new` is less strict than `old`. Any non-empty result means the
/// change is a *weakening* and must go through the approval queue.
pub fn weakened_fields(old: &GuardConfig, new: &GuardConfig) -> Vec<String> {
    let mut out = Vec::new();
    let mut flag = |name: &str, weaker: bool| {
        if weaker {
            out.push(name.to_owned());
        }
    };
    // "higher threshold = weaker"; 0 means disabled = weakest
    let up = |o: f64, n: f64| o > 0.0 && (n == 0.0 || n > o);
    flag(
        "allow_mint_authority",
        new.allow_mint_authority && !old.allow_mint_authority,
    );
    flag(
        "allow_freeze_authority",
        new.allow_freeze_authority && !old.allow_freeze_authority,
    );
    flag(
        "min_lp_safe_pct_warn",
        new.min_lp_safe_pct_warn < old.min_lp_safe_pct_warn,
    );
    flag(
        "min_lp_safe_pct_fail",
        new.min_lp_safe_pct_fail < old.min_lp_safe_pct_fail,
    );
    flag(
        "top_holders_share_pct_warn",
        up(
            old.top_holders_share_pct_warn,
            new.top_holders_share_pct_warn,
        ),
    );
    flag(
        "top_holders_share_pct_fail",
        up(
            old.top_holders_share_pct_fail,
            new.top_holders_share_pct_fail,
        ),
    );
    flag(
        "single_holder_pct_fail",
        up(old.single_holder_pct_fail, new.single_holder_pct_fail),
    );
    flag(
        "creator_share_pct_warn",
        up(old.creator_share_pct_warn, new.creator_share_pct_warn),
    );
    flag(
        "creator_share_pct_fail",
        up(old.creator_share_pct_fail, new.creator_share_pct_fail),
    );
    flag(
        "bundled_share_pct_warn",
        up(old.bundled_share_pct_warn, new.bundled_share_pct_warn),
    );
    flag(
        "bundled_share_pct_fail",
        up(old.bundled_share_pct_fail, new.bundled_share_pct_fail),
    );
    flag(
        "sniper_share_pct_warn",
        up(old.sniper_share_pct_warn, new.sniper_share_pct_warn),
    );
    flag(
        "sniper_share_pct_fail",
        up(old.sniper_share_pct_fail, new.sniper_share_pct_fail),
    );
    flag(
        "transfer_fee_bps_fail",
        new.transfer_fee_bps_fail > old.transfer_fee_bps_fail,
    );
    flag(
        "sell_tax_bps_warn",
        new.sell_tax_bps_warn > old.sell_tax_bps_warn,
    );
    flag(
        "sell_tax_bps_fail",
        new.sell_tax_bps_fail > old.sell_tax_bps_fail,
    );
    flag(
        "serial_creator_warn",
        up(
            f64::from(old.serial_creator_warn),
            f64::from(new.serial_creator_warn),
        ),
    );
    flag(
        "creator_rug_rate_fail",
        new.creator_rug_rate_fail > old.creator_rug_rate_fail,
    );
    flag(
        "warn_score_fail",
        up(
            f64::from(old.warn_score_fail),
            f64::from(new.warn_score_fail),
        ),
    );
    flag(
        "require_sell_sim",
        old.require_sell_sim && !new.require_sell_sim,
    );
    out
}

/// Replay `samples` under both configs.
pub fn impact(old: &GuardConfig, new: &GuardConfig, samples: &[Sample]) -> ImpactReport {
    let mut r = ImpactReport {
        samples: samples.len(),
        weakened_fields: weakened_fields(old, new),
        ..Default::default()
    };
    let mut dd_sum = 0.0;
    for s in samples {
        let (b, a) = (passes(old, &s.input), passes(new, &s.input));
        r.pass_before += usize::from(b);
        r.pass_after += usize::from(a);
        if a && !b {
            r.newly_passing += 1;
            if let Some(o) = &s.outcome {
                r.newly_passing_labelled += 1;
                r.newly_passing_rugged += usize::from(o.rugged);
                dd_sum += o.worst_drawdown_pct;
            }
        } else if b && !a {
            r.newly_blocked += 1;
        }
    }
    if r.newly_passing_labelled > 0 {
        r.newly_passing_avg_drawdown_pct = Some(dd_sum / r.newly_passing_labelled as f64);
    }
    r
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Authority, SellSimulation};
    use common::Venue;

    fn input(dev: f64) -> GuardInput {
        GuardInput {
            venue: Some(Venue::Amm),
            mint_authority: Some(Authority::Revoked),
            freeze_authority: Some(Authority::Revoked),
            lp_burned_pct: Some(100.0),
            holder_pcts: Some(vec![3.0; 10]),
            creator_share_pct: Some(dev),
            bundled_share_pct: Some(1.0),
            sniper_share_pct: Some(1.0),
            transfer_fee_bps: Some(0),
            sell_sim: Some(SellSimulation {
                can_sell: true,
                tax_bps: 0,
                error: None,
            }),
            creator_launches_30d: Some(1),
            creator_rugged_30d: Some(0),
            ..Default::default()
        }
    }

    fn samples() -> Vec<Sample> {
        (0..100)
            .map(|i| Sample {
                input: input(f64::from(i % 30)),
                outcome: Some(Outcome {
                    rugged: i % 30 >= 20,
                    worst_drawdown_pct: f64::from(i % 30) * 3.0,
                    peak_gain_pct: 50.0,
                }),
            })
            .collect()
    }

    #[test]
    fn weakening_dev_threshold_lets_more_through() {
        let old = GuardConfig::default();
        let new = GuardConfig {
            creator_share_pct_fail: 25.0,
            ..old.clone()
        };
        let r = impact(&old, &new, &samples());
        assert_eq!(r.weakened_fields, vec!["creator_share_pct_fail"]);
        assert!(r.newly_passing > 0 && r.newly_blocked == 0);
        assert!(r.newly_passing_rugged > 0, "{r:?}");
        assert!(r.pass_after > r.pass_before);
    }

    #[test]
    fn strengthening_is_not_weakening() {
        let old = GuardConfig::default();
        let new = GuardConfig {
            creator_share_pct_fail: 10.0,
            allow_mint_authority: false,
            ..old.clone()
        };
        let r = impact(&old, &new, &samples());
        assert!(r.weakened_fields.is_empty());
        assert_eq!(r.newly_passing, 0);
        assert!(r.newly_blocked > 0);
    }

    #[test]
    fn disabling_a_check_counts_as_weakening() {
        let old = GuardConfig::default();
        let new = GuardConfig {
            bundled_share_pct_fail: 0.0,
            require_sell_sim: false,
            ..old.clone()
        };
        assert_eq!(
            weakened_fields(&old, &new),
            vec!["bundled_share_pct_fail", "require_sell_sim"]
        );
    }

    /// `cargo test -p guard --release -- --ignored --nocapture replay_budget`
    #[test]
    #[ignore]
    fn replay_budget_50k_samples() {
        let s: Vec<Sample> = (0..50)
            .flat_map(|_| samples())
            .flat_map(|x| std::iter::repeat_n(x, 10))
            .collect();
        assert_eq!(s.len(), 50_000);
        let t = std::time::Instant::now();
        let r = impact(
            &GuardConfig::default(),
            &GuardConfig {
                creator_share_pct_fail: 25.0,
                ..Default::default()
            },
            &s,
        );
        let ms = t.elapsed().as_secs_f64() * 1000.0;
        println!("replayed {} samples x2 configs in {ms:.1} ms", r.samples);
        assert!(ms < 1000.0);
    }
}
