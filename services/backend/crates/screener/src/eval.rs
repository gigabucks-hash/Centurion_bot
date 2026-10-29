use common::CoinSnapshot;
use serde::{Deserialize, Serialize};

use crate::rules::{MissingPolicy, Op, Rule, RuleSet, Threshold};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuleClass {
    Venue,
    Hard,
    Weighted,
}

/// One line in the "checks" list shown to the user and stored in `picks.checks`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CheckResult {
    pub id: String,
    pub class: RuleClass,
    pub passed: bool,
    pub measured: Option<f64>,
    /// Points contributed (weighted only; may be negative).
    pub points: f64,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScreenResult {
    pub passed: bool,
    pub score: f64,
    pub score_threshold: f64,
    pub max_score: f64,
    pub checks: Vec<CheckResult>,
}

impl ScreenResult {
    /// Short human summary such as `Fit 85 / 70`.
    pub fn summary(&self) -> String {
        format!("Fit {:.0} / {:.0}", self.score, self.score_threshold)
    }
    pub fn failed_hard(&self) -> impl Iterator<Item = &CheckResult> {
        self.checks
            .iter()
            .filter(|c| c.class != RuleClass::Weighted && !c.passed)
    }
}

fn op_passes(op: Op, t: Threshold, x: f64) -> bool {
    match (op, t) {
        (Op::Gte, Threshold::Scalar(v)) => x >= v,
        (Op::Gt, Threshold::Scalar(v)) => x > v,
        (Op::Lte, Threshold::Scalar(v)) => x <= v,
        (Op::Lt, Threshold::Scalar(v)) => x < v,
        (Op::Between, Threshold::Range([a, b])) => x >= a && x <= b,
        (Op::Outside, Threshold::Range([a, b])) => x < a || x > b,
        _ => false, // shape mismatch is rejected by validate()
    }
}

fn describe(r: &Rule) -> String {
    let op = match r.op {
        Op::Gte => ">=",
        Op::Gt => ">",
        Op::Lte => "<=",
        Op::Lt => "<",
        Op::Between => "in",
        Op::Outside => "not in",
    };
    match r.value {
        Threshold::Scalar(v) => format!("{:?} {op} {v}", r.metric),
        Threshold::Range([a, b]) => format!("{:?} {op} [{a}, {b}]", r.metric),
    }
}

/// Partial credit fraction in [0, 1] for a failing value when `zero_at` is set.
fn partial_fraction(r: &Rule, x: f64) -> f64 {
    match (r.zero_at, r.value) {
        (Some(z), Threshold::Scalar(v)) if (v - z).abs() > f64::EPSILON => {
            ((x - z) / (v - z)).clamp(0.0, 1.0)
        }
        _ => 0.0,
    }
}

/// Evaluate a snapshot against a rule set. Pure and deterministic.
pub fn evaluate(rs: &RuleSet, coin: &CoinSnapshot) -> ScreenResult {
    let mut checks = Vec::with_capacity(rs.hard.len() + rs.weighted.len() + 1);

    let venue_ok = rs.venues.contains(&coin.venue);
    checks.push(CheckResult {
        id: "venue".into(),
        class: RuleClass::Venue,
        passed: venue_ok,
        measured: None,
        points: 0.0,
        reason: format!(
            "stream {:?} {}",
            coin.venue,
            if venue_ok { "allowed" } else { "not enabled" }
        ),
    });

    for r in &rs.hard {
        let policy = r.on_missing.unwrap_or(rs.on_missing);
        let measured = r.metric.read(&coin.metrics);
        let (passed, reason) = match measured {
            Some(x) => (
                op_passes(r.op, r.value, x),
                format!("{} (got {x})", describe(r)),
            ),
            None => match policy {
                MissingPolicy::Fail => (false, format!("{}: no data", describe(r))),
                MissingPolicy::Skip => (true, format!("{}: no data, skipped", describe(r))),
            },
        };
        checks.push(CheckResult {
            id: r.id.clone(),
            class: RuleClass::Hard,
            passed,
            measured,
            points: 0.0,
            reason,
        });
    }

    let mut score = 0.0;
    for r in &rs.weighted {
        let policy = r.on_missing.unwrap_or(rs.on_missing);
        let full = r.points.unwrap_or(0.0);
        let penalty = r.penalty.unwrap_or(0.0);
        let measured = r.metric.read(&coin.metrics);
        let (passed, points, reason) = match measured {
            Some(x) if op_passes(r.op, r.value, x) => {
                (true, full, format!("{} (got {x})", describe(r)))
            }
            Some(x) => {
                let frac = partial_fraction(r, x);
                let pts = if frac > 0.0 { full * frac } else { -penalty };
                (
                    false,
                    pts,
                    format!("{} (got {x}, {:.1} pts)", describe(r), pts),
                )
            }
            None => match policy {
                MissingPolicy::Fail => (false, -penalty, format!("{}: no data", describe(r))),
                MissingPolicy::Skip => (false, 0.0, format!("{}: no data, skipped", describe(r))),
            },
        };
        score += points;
        checks.push(CheckResult {
            id: r.id.clone(),
            class: RuleClass::Weighted,
            passed,
            measured,
            points,
            reason,
        });
    }

    let hard_ok = checks
        .iter()
        .filter(|c| c.class != RuleClass::Weighted)
        .all(|c| c.passed);
    let weighted_ok = rs.weighted.is_empty() || score >= rs.score_threshold;
    ScreenResult {
        passed: hard_ok && weighted_ok,
        score,
        score_threshold: rs.score_threshold,
        max_score: rs.max_score(),
        checks,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rules::RuleSet;
    use common::{CoinMetrics, CoinSnapshot, Launchpad, Mint, Untrusted, Venue};

    const RULES: &str = r#"{
      "version": 1,
      "name": "test",
      "venues": ["amm"],
      "score_threshold": 60,
      "hard": [
        { "id": "liquidity", "metric": "liquidity_usd", "op": "gte", "value": 10000 },
        { "id": "age",       "metric": "age_minutes",   "op": "between", "value": [5, 600] }
      ],
      "weighted": [
        { "id": "top_holders", "metric": "top_holders_share_pct",   "op": "lte", "value": 25, "points": 40, "zero_at": 50 },
        { "id": "holder_count", "metric": "holder_count",    "op": "gte", "value": 300, "points": 30 },
        { "id": "change_1h", "metric": "change_1h_pct",  "op": "between", "value": [5, 80], "points": 30, "penalty": 15 }
      ]
    }"#;

    fn coin(venue: Venue, m: CoinMetrics) -> CoinSnapshot {
        CoinSnapshot {
            mint: Mint::parse("So11111111111111111111111111111111111111112").expect("mint"),
            venue,
            launchpad: Launchpad::PumpSwap,
            creator: None,
            observed_at: 0,
            metrics: m,
            name: Untrusted::new("x".into()),
            symbol: Untrusted::new("X".into()),
            uri: Untrusted::new(String::new()),
        }
    }

    fn good() -> CoinMetrics {
        CoinMetrics {
            liquidity_usd: Some(25_000.0),
            age_minutes: Some(30.0),
            top_holders_share_pct: Some(20.0),
            holder_count: Some(500),
            change_1h_pct: Some(40.0),
            ..Default::default()
        }
    }

    fn rs() -> RuleSet {
        RuleSet::from_json(RULES).expect("valid rules")
    }

    #[test]
    fn all_pass_gets_full_score() {
        let r = evaluate(&rs(), &coin(Venue::Amm, good()));
        assert!(r.passed, "{r:#?}");
        assert_eq!(r.score, 100.0);
        assert_eq!(r.summary(), "Fit 100 / 60");
    }

    #[test]
    fn hard_failure_rejects_even_with_high_score() {
        let m = CoinMetrics {
            liquidity_usd: Some(5_000.0),
            ..good()
        };
        let r = evaluate(&rs(), &coin(Venue::Amm, m));
        assert!(!r.passed);
        assert_eq!(
            r.failed_hard().map(|c| c.id.as_str()).collect::<Vec<_>>(),
            vec!["liquidity"]
        );
        assert_eq!(r.score, 100.0);
    }

    #[test]
    fn wrong_stream_rejects() {
        let r = evaluate(&rs(), &coin(Venue::Curve, good()));
        assert!(!r.passed);
        assert_eq!(r.failed_hard().next().map(|c| c.id.as_str()), Some("venue"));
    }

    #[test]
    fn missing_hard_metric_fails_by_default() {
        let m = CoinMetrics {
            liquidity_usd: None,
            ..good()
        };
        let r = evaluate(&rs(), &coin(Venue::Amm, m));
        assert!(!r.passed);
    }

    #[test]
    fn partial_credit_is_linear() {
        // top_holders = 37.5 is halfway between value 25 (full) and zero_at 50 (zero) -> 20 pts
        let m = CoinMetrics {
            top_holders_share_pct: Some(37.5),
            ..good()
        };
        let r = evaluate(&rs(), &coin(Venue::Amm, m));
        let c = r
            .checks
            .iter()
            .find(|c| c.id == "top_holders")
            .expect("check");
        assert!(!c.passed);
        assert!((c.points - 20.0).abs() < 1e-9);
        assert!((r.score - 80.0).abs() < 1e-9);
        assert!(r.passed);
    }

    #[test]
    fn penalty_can_drop_below_score_threshold() {
        let m = CoinMetrics {
            change_1h_pct: Some(200.0),
            holder_count: Some(10),
            ..good()
        };
        let r = evaluate(&rs(), &coin(Venue::Amm, m));
        // 40 (top_holders) + 0 (holder_count) - 15 (change_1h penalty) = 25 < 60
        assert!((r.score - 25.0).abs() < 1e-9);
        assert!(!r.passed);
    }

    #[test]
    fn validation_catches_bad_sets() {
        let bad_mark = RULES.replace("\"score_threshold\": 60", "\"score_threshold\": 10");
        assert!(RuleSet::from_json(&bad_mark).is_err());
        let unreachable = RULES.replace("\"score_threshold\": 60", "\"score_threshold\": 120");
        assert!(RuleSet::from_json(&unreachable).is_err());
        let dup = RULES.replace("\"id\": \"holder_count\"", "\"id\": \"top_holders\"");
        assert!(RuleSet::from_json(&dup).is_err());
        let bad_range = RULES.replace("[5, 600]", "[600, 5]");
        assert!(RuleSet::from_json(&bad_range).is_err());
        let bad_zero = RULES.replace("\"zero_at\": 50", "\"zero_at\": 10");
        assert!(RuleSet::from_json(&bad_zero).is_err());
        let unknown = RULES.replace("\"name\": \"test\"", "\"name\": \"t\", \"bogus\": 1");
        assert!(RuleSet::from_json(&unknown).is_err());
    }

    #[test]
    fn example_config_is_valid() {
        let s = include_str!("../../../config/screener.example.json");
        let rs = RuleSet::from_json(s).expect("example config must validate");
        assert!(rs.max_score() >= rs.score_threshold);
    }
}
