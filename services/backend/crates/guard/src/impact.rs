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
    pub max_drawdown_pct: f64,
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
    #[serde(with = "common::units::opt_f64_dec")]
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
        "allowMintAuthority",
        new.allow_mint_authority && !old.allow_mint_authority,
    );
    flag(
        "allowFreezeAuthority",
        new.allow_freeze_authority && !old.allow_freeze_authority,
    );
    flag(
        "minLpSafePctWarn",
        new.min_lp_safe_pct_warn < old.min_lp_safe_pct_warn,
    );
    flag(
        "minLpSafePctFail",
        new.min_lp_safe_pct_fail < old.min_lp_safe_pct_fail,
    );
    flag("top10PctWarn", up(old.top10_pct_warn, new.top10_pct_warn));
    flag("top10PctFail", up(old.top10_pct_fail, new.top10_pct_fail));
    flag(
        "singleHolderPctFail",
        up(old.single_holder_pct_fail, new.single_holder_pct_fail),
    );
    flag("devPctWarn", up(old.dev_pct_warn, new.dev_pct_warn));
    flag("devPctFail", up(old.dev_pct_fail, new.dev_pct_fail));
    flag(
        "bundlersPctWarn",
        up(old.bundlers_pct_warn, new.bundlers_pct_warn),
    );
    flag(
        "bundlersPctFail",
        up(old.bundlers_pct_fail, new.bundlers_pct_fail),
    );
    flag(
        "snipersPctWarn",
        up(old.snipers_pct_warn, new.snipers_pct_warn),
    );
    flag(
        "snipersPctFail",
        up(old.snipers_pct_fail, new.snipers_pct_fail),
    );
    flag(
        "transferFeeBpsFail",
        new.transfer_fee_bps_fail > old.transfer_fee_bps_fail,
    );
    flag(
        "sellTaxBpsWarn",
        new.sell_tax_bps_warn > old.sell_tax_bps_warn,
    );
    flag(
        "sellTaxBpsFail",
        new.sell_tax_bps_fail > old.sell_tax_bps_fail,
    );
    flag(
        "serialCreatorWarn",
        up(
            f64::from(old.serial_creator_warn),
            f64::from(new.serial_creator_warn),
        ),
    );
    flag(
        "creatorRugRateFail",
        new.creator_rug_rate_fail > old.creator_rug_rate_fail,
    );
    flag(
        "warnScoreFail",
        up(
            f64::from(old.warn_score_fail),
            f64::from(new.warn_score_fail),
        ),
    );
    flag(
        "requireSellSim",
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
                dd_sum += o.max_drawdown_pct;
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
    use common::Stream;

    fn input(dev: f64) -> GuardInput {
        GuardInput {
            stream: Some(Stream::Graduated),
            mint_authority: Some(Authority::Revoked),
            freeze_authority: Some(Authority::Revoked),
            lp_burned_pct: Some(100.0),
            holder_pcts: Some(vec![3.0; 10]),
            dev_pct: Some(dev),
            bundlers_pct: Some(1.0),
            snipers_pct: Some(1.0),
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
                    max_drawdown_pct: f64::from(i % 30) * 3.0,
                    peak_gain_pct: 50.0,
                }),
            })
            .collect()
    }

    #[test]
    fn weakening_dev_threshold_lets_more_through() {
        let old = GuardConfig::default();
        let new = GuardConfig {
            dev_pct_fail: 25.0,
            ..old.clone()
        };
        let r = impact(&old, &new, &samples());
        assert_eq!(r.weakened_fields, vec!["devPctFail"]);
        assert!(r.newly_passing > 0 && r.newly_blocked == 0);
        assert!(r.newly_passing_rugged > 0, "{r:?}");
        assert!(r.pass_after > r.pass_before);
    }

    #[test]
    fn strengthening_is_not_weakening() {
        let old = GuardConfig::default();
        let new = GuardConfig {
            dev_pct_fail: 10.0,
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
            bundlers_pct_fail: 0.0,
            require_sell_sim: false,
            ..old.clone()
        };
        assert_eq!(
            weakened_fields(&old, &new),
            vec!["bundlersPctFail", "requireSellSim"]
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
                dev_pct_fail: 25.0,
                ..Default::default()
            },
            &s,
        );
        let ms = t.elapsed().as_secs_f64() * 1000.0;
        println!("replayed {} samples x2 configs in {ms:.1} ms", r.samples);
        assert!(ms < 1000.0);
    }
}
