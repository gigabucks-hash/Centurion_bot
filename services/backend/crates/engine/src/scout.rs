//! Scout: the hot-path hard filters (Spec v1 §2.1). Pure function over cached inputs, no I/O,
//! budget < 50 ms (measured; typically microseconds). Cheapest checks first, holders LAST.
//! Unknown input = fail closed (`unknown_<field>`); short own history = SKIP `warming`
//! (never a pass). Adds the monitoring label `post_peak_dip_gt20` (Zola, no score effect).
use crate::lead::{Candidate, ModuleId, ModuleScore, Phase, Reason, Specialist};
use crate::strategy::StrategyConfig;

pub const TAG_POST_PEAK_DIP_GT20: &str = "post_peak_dip_gt20";
pub const LABEL_WARMING: &str = "warming";
const VOLUME_WARMUP_S: i64 = 86_400;
const ANTI_TOP_HISTORY_S: i64 = 6 * 3600;

pub struct Scout;

fn veto(code: &str, detail: String, as_of: i64) -> Option<ModuleScore> {
    Some(ModuleScore::veto(Reason::new(code, detail), as_of))
}

fn warming(code: &str, as_of: i64) -> Option<ModuleScore> {
    let mut s = ModuleScore::veto(Reason::new(LABEL_WARMING, code.to_string()), as_of);
    s.labels.push(LABEL_WARMING.into());
    Some(s)
}

macro_rules! need {
    ($c:expr, $f:ident) => {
        match $c.$f {
            Some(v) => v,
            None => {
                return veto(
                    concat!("unknown_", stringify!($f)),
                    String::new(),
                    $c.as_of_ms,
                )
            }
        }
    };
}

/// Price already > 20 % below the 6 h window peak at decision time.
pub fn post_peak_dip_gt20(c: &Candidate) -> bool {
    match (c.price, c.max_6h) {
        (Some(p), Some(m)) if m > 0.0 => p < m * 0.80,
        _ => false,
    }
}

impl Specialist for Scout {
    fn id(&self) -> ModuleId {
        ModuleId::Scout
    }
    fn phase(&self) -> Phase {
        Phase::P1
    }
    fn required(&self) -> bool {
        true
    }
    fn assess(&self, c: &Candidate, cfg: &StrategyConfig) -> Option<ModuleScore> {
        let s = &cfg.scout;
        let t = c.as_of_ms;
        // venue + quote (P1: AMM, SOL-quoted only)
        if !c.venue_amm {
            return veto("venue_not_amm", String::new(), t);
        }
        if !need!(c, quote_is_sol) {
            return veto("quote_not_sol", String::new(), t);
        }
        // graduation age
        let age = need!(c, since_migration_s);
        if age < s.since_migration_seconds_min {
            return veto(
                "grad_age_low",
                format!("{age}s < {}s", s.since_migration_seconds_min),
                t,
            );
        }
        if let Some(max) = s.since_migration_seconds_max {
            if age > max {
                return veto("grad_age_high", format!("{age}s > {max}s"), t);
            }
        }
        // market cap + liquidity
        let mcap = need!(c, mcap_usd);
        if mcap < s.mcap_usd_min {
            return veto("mcap_low", format!("{mcap:.0} < {}", s.mcap_usd_min), t);
        }
        if let Some(max) = s.mcap_usd_max {
            if mcap > max {
                return veto("mcap_high", format!("{mcap:.0} > {max}"), t);
            }
        }
        let liq = need!(c, liquidity_usd);
        if liq < s.liquidity_usd_min {
            return veto(
                "liquidity_low",
                format!("{liq:.0} < {}", s.liquidity_usd_min),
                t,
            );
        }
        // crash skip
        let ch = need!(c, change_1h_pct);
        if ch <= -s.crash_skip_1h_pct {
            return veto(
                "crash_1h",
                format!("{ch:.1}% <= -{}%", s.crash_skip_1h_pct),
                t,
            );
        }
        // own-history dependent filters
        let hist = need!(c, own_history_s);
        if let Some(at) = &s.anti_top {
            if hist < ANTI_TOP_HISTORY_S {
                return warming("anti_top_history_lt_6h", t);
            }
            let (p, mn1, mx1, mn6, mx6) = (
                need!(c, price),
                need!(c, min_1h),
                need!(c, max_1h),
                need!(c, min_6h),
                need!(c, max_6h),
            );
            let range = |mn: f64, mx: f64| {
                if mn > 0.0 {
                    (mx - mn) / mn * 100.0
                } else {
                    f64::INFINITY
                }
            };
            let wide = range(mn1, mx1) > at.range_pct_1h || range(mn6, mx6) > at.range_pct_6h;
            let near_high = p >= mx6.max(mx1) * (1.0 - at.near_high_pct / 100.0);
            if wide && near_high {
                return veto(
                    "anti_top",
                    format!(
                        "1h {:.0}% / 6h {:.0}%, near high",
                        range(mn1, mx1),
                        range(mn6, mx6)
                    ),
                    t,
                );
            }
        }
        if hist < VOLUME_WARMUP_S {
            return warming("volume_history_lt_24h", t);
        }
        let v24 = need!(c, volume_24h_usd);
        if v24 < s.volume_24h_usd_min {
            return veto(
                "volume_24h_low",
                format!("{v24:.0} < {}", s.volume_24h_usd_min),
                t,
            );
        }
        let v1 = need!(c, volume_1h_usd);
        let ratio = if mcap > 0.0 { v1 / mcap } else { 0.0 };
        if s.volume_to_mcap_1h_min.is_some_and(|m| ratio < m) {
            return veto("vol_mcap_low", format!("{ratio:.2}"), t);
        }
        if s.volume_to_mcap_1h_max.is_some_and(|m| ratio > m) {
            return veto("vol_mcap_high", format!("{ratio:.2}"), t);
        }
        // RPC-backed (cached) checks
        let top10 = need!(c, top10_pct);
        if top10 > s.top_holders_share_pct_max {
            return veto(
                "top10_high",
                format!("{top10:.1}% > {}%", s.top_holders_share_pct_max),
                t,
            );
        }
        let lp = need!(c, lp_safe_pct);
        if lp < s.lp_safe_pct_min {
            return veto(
                "lp_safe_low",
                format!("{lp:.1}% < {}%", s.lp_safe_pct_min),
                t,
            );
        }
        // holders LAST (most expensive to refresh)
        let h = need!(c, holders);
        if h < s.holder_count_min {
            return veto("holders_low", format!("{h} < {}", s.holder_count_min), t);
        }
        let mut ok = ModuleScore::pass(100, t);
        if post_peak_dip_gt20(c) {
            ok.labels.push(TAG_POST_PEAK_DIP_GT20.into());
        }
        Some(ok)
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::strategy::tests::repo_strategy;

    pub fn good() -> Candidate {
        Candidate {
            mint: "m".into(),
            as_of_ms: 1,
            venue_amm: true,
            quote_is_sol: Some(true),
            mcap_usd: Some(800_000.0),
            liquidity_usd: Some(120_000.0),
            volume_24h_usd: Some(900_000.0),
            own_history_s: Some(90_000),
            volume_1h_usd: Some(200_000.0),
            top10_pct: Some(18.0),
            lp_safe_pct: Some(99.0),
            since_migration_s: Some(30_000),
            holders: Some(2_400),
            price: Some(1.0),
            change_1h_pct: Some(-5.0),
            min_1h: Some(0.9),
            max_1h: Some(1.1),
            min_6h: Some(0.8),
            max_6h: Some(1.3),
        }
    }
    fn a() -> StrategyConfig {
        StrategyConfig::parse(&repo_strategy("swing_hunter.json")).unwrap()
    }
    fn code(c: &Candidate) -> String {
        let s = Scout.assess(c, &a()).unwrap();
        if s.veto {
            s.reasons[0].code.clone()
        } else {
            "pass".into()
        }
    }

    #[test]
    fn passes_good_candidate_and_tags_post_peak_dip() {
        let s = Scout.assess(&good(), &a()).unwrap();
        assert!(!s.veto);
        // 1.0 < 0.8 * 1.3 = 1.04 -> tagged
        assert_eq!(s.labels, vec![TAG_POST_PEAK_DIP_GT20.to_string()]);
        let mut c = good();
        c.max_6h = Some(1.2);
        assert!(Scout.assess(&c, &a()).unwrap().labels.is_empty());
    }

    #[test]
    fn hard_filters() {
        type Case = (&'static str, Box<dyn Fn(&mut Candidate)>);
        let cases: Vec<Case> = vec![
            ("venue_not_amm", Box::new(|c| c.venue_amm = false)),
            ("quote_not_sol", Box::new(|c| c.quote_is_sol = Some(false))),
            ("unknown_quote_is_sol", Box::new(|c| c.quote_is_sol = None)),
            (
                "grad_age_low",
                Box::new(|c| c.since_migration_s = Some(3_600)),
            ),
            (
                "grad_age_high",
                Box::new(|c| c.since_migration_s = Some(700_000)),
            ),
            ("mcap_low", Box::new(|c| c.mcap_usd = Some(200_000.0))),
            ("mcap_high", Box::new(|c| c.mcap_usd = Some(3_500_000.0))),
            (
                "liquidity_low",
                Box::new(|c| c.liquidity_usd = Some(70_000.0)),
            ),
            ("crash_1h", Box::new(|c| c.change_1h_pct = Some(-25.0))),
            ("warming", Box::new(|c| c.own_history_s = Some(3_600))),
            ("warming", Box::new(|c| c.own_history_s = Some(30_000))), // anti-top ok, volume < 24 h
            (
                "volume_24h_low",
                Box::new(|c| c.volume_24h_usd = Some(250_000.0)),
            ),
            (
                "vol_mcap_low",
                Box::new(|c| c.volume_1h_usd = Some(40_000.0)),
            ),
            (
                "vol_mcap_high",
                Box::new(|c| c.volume_1h_usd = Some(1_700_000.0)),
            ),
            ("top10_high", Box::new(|c| c.top10_pct = Some(26.0))),
            ("lp_safe_low", Box::new(|c| c.lp_safe_pct = Some(94.0))),
            ("holders_low", Box::new(|c| c.holders = Some(1_499))),
            ("unknown_holders", Box::new(|c| c.holders = None)),
            // 1h range (1.6-0.9)/0.9 = 78 % > 60 % and price within 20 % of the high -> anti-top
            (
                "anti_top",
                Box::new(|c| {
                    c.max_1h = Some(1.1);
                    c.min_1h = Some(0.6);
                    c.max_6h = Some(1.15);
                    c.price = Some(1.0)
                }),
            ),
        ];
        for (want, f) in cases {
            let mut c = good();
            f(&mut c);
            assert_eq!(code(&c), want);
        }
        let mut c = good();
        c.own_history_s = Some(3_600);
        assert_eq!(
            Scout.assess(&c, &a()).unwrap().labels,
            vec!["warming".to_string()]
        );
    }

    #[test]
    fn b_has_no_anti_top_and_no_grad_age_max() {
        let b = StrategyConfig::parse(&repo_strategy("hot_dip_reload.json")).unwrap();
        let mut c = good();
        c.since_migration_s = Some(10);
        c.mcap_usd = Some(500_000.0);
        c.volume_1h_usd = Some(450_000.0);
        c.holders = Some(600);
        c.max_1h = Some(1.1);
        c.min_1h = Some(0.5);
        assert!(!Scout.assess(&c, &b).unwrap().veto);
    }

    #[test]
    fn scout_latency_budget() {
        let cfg = a();
        let lat = crate::latency::Latency::default();
        let mut c = good();
        for i in 0..20_000u64 {
            c.holders = Some(1_000 + (i % 3_000));
            let t = std::time::Instant::now();
            let _ = std::hint::black_box(Scout.assess(&c, &cfg));
            lat.record_us(t.elapsed().as_micros() as u64);
        }
        let s = lat.summary();
        assert!(s.max_us < 50_000, "Scout over 50 ms budget: {s:?}");
    }
}
