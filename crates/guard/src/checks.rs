use common::Stream;
use serde::{Deserialize, Serialize};

use crate::{Authority, GuardConfig, GuardInput};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CheckStatus {
    Pass,
    Unknown,
    Warn,
    Fail,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Verdict {
    Pass,
    Warn,
    Fail,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GuardCheck {
    pub name: String,
    pub status: CheckStatus,
    pub measured: Option<f64>,
    pub reason: String,
    /// Contribution to `risk_score` when WARN / UNKNOWN.
    pub weight: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GuardReport {
    pub verdict: Verdict,
    pub risk_score: u32,
    pub reasons: Vec<String>,
    pub checks: Vec<GuardCheck>,
}

fn chk(
    name: &'static str,
    status: CheckStatus,
    measured: Option<f64>,
    weight: u32,
    reason: impl Into<String>,
) -> GuardCheck {
    GuardCheck {
        name: name.to_owned(),
        status,
        measured,
        reason: reason.into(),
        weight,
    }
}

/// Higher-is-worse threshold check (e.g. top10 %, dev %).
fn upper(
    name: &'static str,
    v: Option<f64>,
    warn: f64,
    fail: f64,
    weight: u32,
    label: &str,
) -> GuardCheck {
    match v {
        None => chk(
            name,
            CheckStatus::Unknown,
            None,
            0,
            format!("{label}: no data"),
        ),
        Some(x) if fail > 0.0 && x >= fail => chk(
            name,
            CheckStatus::Fail,
            Some(x),
            weight,
            format!("{label} {x:.1}% >= {fail}%"),
        ),
        Some(x) if warn > 0.0 && x >= warn => chk(
            name,
            CheckStatus::Warn,
            Some(x),
            weight,
            format!("{label} {x:.1}% >= {warn}%"),
        ),
        Some(x) => chk(
            name,
            CheckStatus::Pass,
            Some(x),
            weight,
            format!("{label} {x:.1}%"),
        ),
    }
}

fn authority(name: &'static str, v: &Option<Authority>, allowed: bool, label: &str) -> GuardCheck {
    match v {
        None => chk(
            name,
            CheckStatus::Unknown,
            None,
            2,
            format!("{label}: no data"),
        ),
        Some(Authority::Revoked) => {
            chk(name, CheckStatus::Pass, None, 3, format!("{label} revoked"))
        }
        Some(Authority::Set(_)) if allowed => chk(
            name,
            CheckStatus::Warn,
            None,
            3,
            format!("{label} still set (allowed by config)"),
        ),
        Some(Authority::Set(_)) => chk(
            name,
            CheckStatus::Fail,
            None,
            3,
            format!("{label} still set"),
        ),
    }
}

/// Run every check and fold into a verdict.
pub fn assess(cfg: &GuardConfig, input: &GuardInput) -> GuardReport {
    use CheckStatus::*;
    let mut checks = vec![
        authority(
            "mint_authority",
            &input.mint_authority,
            cfg.allow_mint_authority,
            "mint authority",
        ),
        authority(
            "freeze_authority",
            &input.freeze_authority,
            cfg.allow_freeze_authority,
            "freeze authority",
        ),
    ];

    // LP burn/lock only meaningful once graduated to an AMM pool.
    checks.push(
        match (input.stream, input.lp_burned_pct, input.lp_locked_pct) {
            (Some(Stream::Bonding), _, _) => {
                chk("lp_safety", Pass, None, 0, "on bonding curve: no LP yet")
            }
            (_, None, None) => chk("lp_safety", Unknown, None, 1, "LP burn/lock: no data"),
            (_, b, l) => {
                let safe = (b.unwrap_or(0.0) + l.unwrap_or(0.0)).min(100.0);
                if safe < cfg.min_lp_safe_pct_fail {
                    chk(
                        "lp_safety",
                        Fail,
                        Some(safe),
                        3,
                        format!("only {safe:.1}% of LP burned/locked"),
                    )
                } else if safe < cfg.min_lp_safe_pct_warn {
                    chk(
                        "lp_safety",
                        Warn,
                        Some(safe),
                        2,
                        format!("{safe:.1}% of LP burned/locked"),
                    )
                } else {
                    chk(
                        "lp_safety",
                        Pass,
                        Some(safe),
                        2,
                        format!("{safe:.1}% of LP burned/locked"),
                    )
                }
            }
        },
    );

    let top10 = input
        .holder_pcts
        .as_ref()
        .map(|h| h.iter().take(10).sum::<f64>());
    let top1 = input.holder_pcts.as_ref().and_then(|h| h.first().copied());
    checks.push(upper(
        "top10",
        top10,
        cfg.top10_pct_warn,
        cfg.top10_pct_fail,
        2,
        "top-10 holders",
    ));
    checks.push(upper(
        "single_holder",
        top1,
        0.0,
        cfg.single_holder_pct_fail,
        2,
        "largest holder",
    ));
    checks.push(upper(
        "dev",
        input.dev_pct,
        cfg.dev_pct_warn,
        cfg.dev_pct_fail,
        2,
        "dev wallet",
    ));
    checks.push(upper(
        "bundlers",
        input.bundlers_pct,
        cfg.bundlers_pct_warn,
        cfg.bundlers_pct_fail,
        2,
        "bundled buys",
    ));
    checks.push(upper(
        "snipers",
        input.snipers_pct,
        cfg.snipers_pct_warn,
        cfg.snipers_pct_fail,
        1,
        "snipers",
    ));

    checks.push(match input.transfer_fee_bps {
        None => chk("transfer_fee", Unknown, None, 0, "transfer fee: no data"),
        Some(0) => chk("transfer_fee", Pass, Some(0.0), 0, "no transfer fee"),
        Some(b) if b >= cfg.transfer_fee_bps_fail => chk(
            "transfer_fee",
            Fail,
            Some(b.into()),
            3,
            format!("transfer fee {b} bps"),
        ),
        Some(b) => chk(
            "transfer_fee",
            Warn,
            Some(b.into()),
            1,
            format!("transfer fee {b} bps"),
        ),
    });

    checks.push(match &input.sell_sim {
        None if cfg.require_sell_sim => {
            chk("honeypot", Warn, None, 2, "sell simulation unavailable")
        }
        None => chk("honeypot", Unknown, None, 1, "sell simulation unavailable"),
        Some(s) if !s.can_sell => chk(
            "honeypot",
            Fail,
            None,
            5,
            format!(
                "sell simulation failed: {}",
                s.error.as_deref().unwrap_or("unknown error")
            ),
        ),
        Some(s) if s.tax_bps >= cfg.sell_tax_bps_fail => chk(
            "honeypot",
            Fail,
            Some(s.tax_bps.into()),
            5,
            format!("sell tax {} bps", s.tax_bps),
        ),
        Some(s) if s.tax_bps >= cfg.sell_tax_bps_warn => chk(
            "honeypot",
            Warn,
            Some(s.tax_bps.into()),
            2,
            format!("sell tax {} bps", s.tax_bps),
        ),
        Some(s) => chk(
            "honeypot",
            Pass,
            Some(s.tax_bps.into()),
            0,
            format!("sellable, tax {} bps", s.tax_bps),
        ),
    });

    checks.push(
        match (input.creator_launches_30d, input.creator_rugged_30d) {
            (Some(n), Some(r))
                if n > 0 && (r as f64 / n as f64) >= cfg.creator_rug_rate_fail && r >= 2 =>
            {
                chk(
                    "creator_history",
                    Fail,
                    Some(r as f64 / n as f64),
                    3,
                    format!("creator rugged {r} of {n} launches (30d)"),
                )
            }
            (Some(n), _) if cfg.serial_creator_warn > 0 && n >= cfg.serial_creator_warn => chk(
                "creator_history",
                Warn,
                Some(n.into()),
                1,
                format!("serial creator: {n} launches (30d)"),
            ),
            (Some(n), _) => chk(
                "creator_history",
                Pass,
                Some(n.into()),
                0,
                format!("{n} launches (30d)"),
            ),
            (None, _) => chk(
                "creator_history",
                Unknown,
                None,
                0,
                "creator history: no data",
            ),
        },
    );

    let risk_score: u32 = checks
        .iter()
        .filter(|c| matches!(c.status, Warn | Unknown))
        .map(|c| {
            if c.status == Warn {
                c.weight
            } else {
                c.weight.min(1)
            }
        })
        .sum();

    let mut reasons: Vec<String> = checks
        .iter()
        .filter(|c| c.status == Fail)
        .map(|c| c.reason.clone())
        .collect();
    let verdict = if !reasons.is_empty() {
        Verdict::Fail
    } else if cfg.warn_score_fail > 0 && risk_score >= cfg.warn_score_fail {
        reasons.push(format!(
            "risk score {risk_score} >= {}",
            cfg.warn_score_fail
        ));
        reasons.extend(
            checks
                .iter()
                .filter(|c| c.status == Warn)
                .map(|c| c.reason.clone()),
        );
        Verdict::Fail
    } else if checks.iter().any(|c| c.status == Warn) {
        reasons.extend(
            checks
                .iter()
                .filter(|c| c.status == Warn)
                .map(|c| c.reason.clone()),
        );
        Verdict::Warn
    } else {
        Verdict::Pass
    };

    GuardReport {
        verdict,
        risk_score,
        reasons,
        checks,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::SellSimulation;

    fn clean() -> GuardInput {
        GuardInput {
            stream: Some(Stream::Graduated),
            mint_authority: Some(Authority::Revoked),
            freeze_authority: Some(Authority::Revoked),
            lp_burned_pct: Some(100.0),
            lp_locked_pct: None,
            holder_pcts: Some(vec![4.0, 3.0, 2.0, 2.0, 1.0]),
            dev_pct: Some(1.0),
            bundlers_pct: Some(2.0),
            snipers_pct: Some(1.0),
            transfer_fee_bps: Some(0),
            sell_sim: Some(SellSimulation {
                can_sell: true,
                tax_bps: 0,
                error: None,
            }),
            creator_launches_30d: Some(1),
            creator_rugged_30d: Some(0),
        }
    }

    #[test]
    fn clean_coin_passes() {
        let r = assess(&GuardConfig::default(), &clean());
        assert_eq!(r.verdict, Verdict::Pass, "{r:#?}");
        assert_eq!(r.risk_score, 0);
    }

    #[test]
    fn mint_authority_fails() {
        let i = GuardInput {
            mint_authority: Some(Authority::Set("Auth111".into())),
            ..clean()
        };
        let r = assess(&GuardConfig::default(), &i);
        assert_eq!(r.verdict, Verdict::Fail);
        assert!(r.reasons.iter().any(|x| x.contains("mint authority")));
    }

    #[test]
    fn honeypot_fails() {
        let i = GuardInput {
            sell_sim: Some(SellSimulation {
                can_sell: false,
                tax_bps: 0,
                error: Some("custom program error".into()),
            }),
            ..clean()
        };
        assert_eq!(assess(&GuardConfig::default(), &i).verdict, Verdict::Fail);
    }

    #[test]
    fn single_warning_is_warn() {
        let i = GuardInput {
            dev_pct: Some(7.0),
            ..clean()
        };
        let r = assess(&GuardConfig::default(), &i);
        assert_eq!(r.verdict, Verdict::Warn);
        assert_eq!(r.risk_score, 2);
    }

    #[test]
    fn many_warnings_escalate_to_fail() {
        let i = GuardInput {
            dev_pct: Some(7.0),
            bundlers_pct: Some(12.0),
            lp_burned_pct: Some(80.0),
            ..clean()
        };
        let r = assess(&GuardConfig::default(), &i);
        assert_eq!(r.risk_score, 6);
        assert_eq!(r.verdict, Verdict::Fail);
    }

    #[test]
    fn bonding_curve_skips_lp_check() {
        let i = GuardInput {
            stream: Some(Stream::Bonding),
            lp_burned_pct: None,
            ..clean()
        };
        let r = assess(&GuardConfig::default(), &i);
        assert_eq!(r.verdict, Verdict::Pass);
    }

    #[test]
    fn top10_concentration_fails() {
        let i = GuardInput {
            holder_pcts: Some(vec![8.0; 10]),
            ..clean()
        };
        let r = assess(&GuardConfig::default(), &i);
        assert_eq!(r.verdict, Verdict::Fail);
    }

    #[test]
    fn unknown_data_counts_toward_risk() {
        let r = assess(&GuardConfig::default(), &GuardInput::default());
        // honeypot WARN (2) + authorities unknown (1+1) + lp unknown (1) = 5 → WARN, not PASS
        assert_eq!(r.verdict, Verdict::Warn);
        assert_eq!(r.risk_score, 5);
    }

    #[tokio::test]
    async fn stub_source_returns_fixed_input() {
        use crate::{GuardDataSource, StubDataSource};
        let src = StubDataSource { fixed: clean() };
        let m = common::Mint::parse("So11111111111111111111111111111111111111112").expect("mint");
        assert_eq!(src.fetch(&m).await.expect("fetch"), clean());
    }
}
