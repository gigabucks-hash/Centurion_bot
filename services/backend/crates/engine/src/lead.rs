//! Specialist modules and the Lead orchestrator (Spec v1 §5).
//!
//! Order: Scout veto > required module missing > vetoes > floors > weighted aggregate
//! (renormalised over missing OPTIONAL modules only) > `min_score`. Every module's score and
//! reasons are kept on the [`Decision`] for the decision log.
use crate::strategy::StrategyConfig;
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ModuleId {
    Scout,
    Guard,
    SmartMoney,
    Momentum,
    Narrative,
    Risk,
}

impl ModuleId {
    pub fn as_str(self) -> &'static str {
        match self {
            ModuleId::Scout => "scout",
            ModuleId::Guard => "guard",
            ModuleId::SmartMoney => "smart_money",
            ModuleId::Momentum => "momentum",
            ModuleId::Narrative => "narrative",
            ModuleId::Risk => "risk",
        }
    }
    /// Key in `scoring.weights_by_phase` / `scoring.floors` (Guard is scored as "safety").
    pub fn weight_key(self) -> &'static str {
        match self {
            ModuleId::Guard => "safety",
            m => m.as_str(),
        }
    }
    /// Reason when a required module has no result.
    pub fn missing_reason(self) -> &'static str {
        match self {
            ModuleId::Guard => "guard_unavailable",
            ModuleId::Momentum => "momentum_pending",
            ModuleId::Scout => "scout_unavailable",
            ModuleId::Risk => "risk_unavailable",
            ModuleId::SmartMoney => "smart_money_unavailable",
            ModuleId::Narrative => "narrative_unavailable",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    P1,
    P2,
    P3,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Reason {
    pub code: String,
    pub detail: String,
}

impl Reason {
    pub fn new(code: &str, detail: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            detail: detail.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ModuleScore {
    /// 0-100.
    pub score: u8,
    pub veto: bool,
    pub reasons: Vec<Reason>,
    pub inputs_as_of: i64,
    /// `sim-approx`, `warming`, `post_peak_dip_gt20`, ...
    pub labels: Vec<String>,
    pub rpc_credits: u32,
}

impl ModuleScore {
    pub fn pass(score: u8, as_of: i64) -> Self {
        Self {
            score: score.min(100),
            veto: false,
            reasons: vec![],
            inputs_as_of: as_of,
            labels: vec![],
            rpc_credits: 0,
        }
    }
    pub fn veto(reason: Reason, as_of: i64) -> Self {
        Self {
            score: 0,
            veto: true,
            reasons: vec![reason],
            inputs_as_of: as_of,
            labels: vec![],
            rpc_credits: 0,
        }
    }
}

/// Everything a specialist may read for one mint, filled from the enrich caches.
/// `None` = not known (yet); modules must fail closed on unknown hard-filter inputs.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Candidate {
    pub mint: String,
    pub as_of_ms: i64,
    pub venue_amm: bool,
    pub quote_is_sol: Option<bool>,
    pub mcap_usd: Option<f64>,
    pub liquidity_usd: Option<f64>,
    pub volume_24h_usd: Option<f64>,
    /// Hours of own swap history on this pool (volume warm-up is 24 h).
    pub own_history_s: Option<i64>,
    pub volume_1h_usd: Option<f64>,
    pub top10_pct: Option<f64>,
    pub lp_safe_pct: Option<f64>,
    pub since_migration_s: Option<i64>,
    pub holders: Option<u64>,
    pub price: Option<f64>,
    pub change_1h_pct: Option<f64>,
    pub min_1h: Option<f64>,
    pub max_1h: Option<f64>,
    pub min_6h: Option<f64>,
    pub max_6h: Option<f64>,
}

pub trait Specialist: Send + Sync {
    fn id(&self) -> ModuleId;
    fn phase(&self) -> Phase;
    fn required(&self) -> bool;
    /// `None` = not available / pending.
    fn assess(&self, c: &Candidate, cfg: &StrategyConfig) -> Option<ModuleScore>;
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Decision {
    pub mint: String,
    pub strategy_key: String,
    pub config_rev: u32,
    pub pass: bool,
    /// Stage that decided: scout | required | veto | floor | min_score | lead.
    pub stage: String,
    pub reasons: Vec<Reason>,
    pub scores: BTreeMap<String, Option<ModuleScore>>,
    pub weights_used: BTreeMap<String, f64>,
    pub aggregate: Option<f64>,
    pub labels: Vec<String>,
    pub latency_us: u64,
}

pub struct Lead {
    pub modules: Vec<Box<dyn Specialist>>,
}

impl Lead {
    pub fn decide(&self, c: &Candidate, cfg: &StrategyConfig) -> Decision {
        let t0 = std::time::Instant::now();
        let sc = &cfg.scoring;
        let mut scores: BTreeMap<String, Option<ModuleScore>> = BTreeMap::new();
        let mut d = Decision {
            mint: c.mint.clone(),
            strategy_key: cfg.strategy_key.clone(),
            config_rev: cfg.config_rev,
            pass: false,
            stage: String::new(),
            reasons: vec![],
            scores: BTreeMap::new(),
            weights_used: BTreeMap::new(),
            aggregate: None,
            labels: vec![],
            latency_us: 0,
        };
        let finish = |mut d: Decision, scores, t0: std::time::Instant| {
            d.scores = scores;
            d.labels.sort();
            d.labels.dedup();
            d.latency_us = t0.elapsed().as_micros() as u64;
            d
        };
        // 1. Scout first: a Scout veto stops everything else (no enrichment spent).
        let scout = self.modules.iter().find(|m| m.id() == ModuleId::Scout);
        if let Some(m) = scout {
            let s = m.assess(c, cfg);
            if let Some(ms) = &s {
                d.labels.extend(ms.labels.iter().cloned());
            }
            let vetoed = s.as_ref().map(|s| s.veto).unwrap_or(true);
            if vetoed {
                d.stage = "scout".into();
                d.reasons = s
                    .as_ref()
                    .map(|s| s.reasons.clone())
                    .unwrap_or_else(|| vec![Reason::new("scout_unavailable", "")]);
                scores.insert("scout".into(), s);
                return finish(d, scores, t0);
            }
            scores.insert("scout".into(), s);
        }
        for m in self.modules.iter().filter(|m| m.id() != ModuleId::Scout) {
            let s = m.assess(c, cfg);
            if let Some(ms) = &s {
                d.labels.extend(ms.labels.iter().cloned());
            }
            scores.insert(m.id().as_str().into(), s);
        }
        // 2. required modules must have a result
        for req in &sc.required {
            match scores.get(req.as_str()) {
                Some(Some(_)) => {}
                _ => {
                    let id = self
                        .modules
                        .iter()
                        .map(|m| m.id())
                        .find(|i| i.as_str() == req);
                    let code = id
                        .map(|i| i.missing_reason())
                        .unwrap_or("module_unavailable");
                    d.stage = "required".into();
                    d.reasons.push(Reason::new(code, req.clone()));
                }
            }
        }
        if !d.reasons.is_empty() {
            return finish(d, scores, t0);
        }
        // 3. vetoes (a veto flag on any module, listed or not, rejects)
        for (k, s) in &scores {
            if let Some(s) = s {
                if s.veto {
                    d.reasons.extend(s.reasons.iter().cloned());
                    if d.reasons.is_empty() {
                        d.reasons.push(Reason::new("veto", k.clone()));
                    }
                }
            }
        }
        if !d.reasons.is_empty() {
            d.stage = "veto".into();
            return finish(d, scores, t0);
        }
        // 4. floors
        let by_weight_key = |key: &str| -> Option<u8> {
            self.modules
                .iter()
                .find(|m| m.id().weight_key() == key)
                .and_then(|m| scores.get(m.id().as_str()).cloned().flatten())
                .map(|s| s.score)
        };
        for (key, floor) in &sc.floors {
            match by_weight_key(key) {
                Some(v) if (v as f64) >= *floor => {}
                Some(v) => d.reasons.push(Reason::new(
                    &format!("floor_{key}"),
                    format!("{v} < {floor}"),
                )),
                None => d
                    .reasons
                    .push(Reason::new(&format!("floor_{key}"), "no score")),
            }
        }
        if !d.reasons.is_empty() {
            d.stage = "floor".into();
            return finish(d, scores, t0);
        }
        // 5. weighted aggregate; renormalise over missing OPTIONAL modules only
        let weights = sc
            .weights_by_phase
            .get(&sc.phase)
            .cloned()
            .unwrap_or_default();
        let mut num = 0.0;
        let mut den = 0.0;
        for (key, w) in &weights {
            let module = self.modules.iter().find(|m| m.id().weight_key() == key);
            match (module, by_weight_key(key)) {
                (_, Some(v)) => {
                    num += w * v as f64;
                    den += w;
                    d.weights_used.insert(key.clone(), *w);
                }
                (Some(m), None) if m.required() => {
                    d.stage = "required".into();
                    d.reasons
                        .push(Reason::new(m.id().missing_reason(), key.clone()));
                    return finish(d, scores, t0);
                }
                // optional / not built yet (P2/P3): drop and renormalise
                _ => {}
            }
        }
        if den <= 0.0 {
            d.stage = "lead".into();
            d.reasons.push(Reason::new("no_weighted_modules", ""));
            return finish(d, scores, t0);
        }
        for w in d.weights_used.values_mut() {
            *w = *w * 100.0 / den;
        }
        let agg = num / den;
        d.aggregate = Some((agg * 100.0).round() / 100.0);
        if agg < sc.min_score {
            d.stage = "min_score".into();
            d.reasons.push(Reason::new(
                "below_min_score",
                format!("{:.2} < {}", agg, sc.min_score),
            ));
            return finish(d, scores, t0);
        }
        d.pass = true;
        d.stage = "lead".into();
        finish(d, scores, t0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::strategy::{tests::repo_strategy, StrategyConfig};

    struct Fixed(ModuleId, bool, Option<ModuleScore>);
    impl Specialist for Fixed {
        fn id(&self) -> ModuleId {
            self.0
        }
        fn phase(&self) -> Phase {
            Phase::P1
        }
        fn required(&self) -> bool {
            self.1
        }
        fn assess(&self, _: &Candidate, _: &StrategyConfig) -> Option<ModuleScore> {
            self.2.clone()
        }
    }

    fn cfg() -> StrategyConfig {
        StrategyConfig::parse(&repo_strategy("swing_hunter.json")).unwrap()
    }
    fn ok(s: u8) -> Option<ModuleScore> {
        Some(ModuleScore::pass(s, 0))
    }
    fn lead(
        scout: Option<ModuleScore>,
        guard: Option<ModuleScore>,
        mom: Option<ModuleScore>,
        sm: Option<ModuleScore>,
    ) -> Lead {
        Lead {
            modules: vec![
                Box::new(Fixed(ModuleId::Scout, true, scout)),
                Box::new(Fixed(ModuleId::Guard, true, guard)),
                Box::new(Fixed(ModuleId::Momentum, true, mom)),
                Box::new(Fixed(ModuleId::Risk, true, ok(100))),
                Box::new(Fixed(ModuleId::SmartMoney, false, sm)),
            ],
        }
    }

    #[test]
    fn scout_veto_first() {
        let d = lead(
            Some(ModuleScore::veto(Reason::new("mcap_low", ""), 0)),
            None,
            None,
            None,
        )
        .decide(&Candidate::default(), &cfg());
        assert!(!d.pass);
        assert_eq!(d.stage, "scout");
        assert_eq!(d.reasons[0].code, "mcap_low");
        assert_eq!(d.scores.len(), 1, "no other module evaluated");
    }

    #[test]
    fn required_missing_rejects() {
        let d = lead(ok(100), None, ok(90), None).decide(&Candidate::default(), &cfg());
        assert_eq!(d.stage, "required");
        assert_eq!(d.reasons[0].code, "guard_unavailable");
        let d = lead(ok(100), ok(90), None, None).decide(&Candidate::default(), &cfg());
        assert_eq!(d.reasons[0].code, "momentum_pending");
    }

    #[test]
    fn guard_veto_and_floors() {
        let d = lead(
            ok(100),
            Some(ModuleScore::veto(Reason::new("honeypot_unverified", ""), 0)),
            ok(90),
            None,
        )
        .decide(&Candidate::default(), &cfg());
        assert_eq!(d.stage, "veto");
        assert_eq!(d.reasons[0].code, "honeypot_unverified");
        let d = lead(ok(100), ok(69), ok(90), None).decide(&Candidate::default(), &cfg());
        assert_eq!(d.stage, "floor");
        assert_eq!(d.reasons[0].code, "floor_safety");
        let d = lead(ok(100), ok(90), ok(54), None).decide(&Candidate::default(), &cfg());
        assert_eq!(d.reasons[0].code, "floor_momentum");
    }

    #[test]
    fn p1_weights_and_min_score() {
        // A p1: safety 55 / momentum 45, min 68. 0.55*70 + 0.45*60 = 65.5 -> reject
        let d = lead(ok(100), ok(70), ok(60), None).decide(&Candidate::default(), &cfg());
        assert_eq!(d.stage, "min_score");
        assert_eq!(d.aggregate, Some(65.5));
        // 0.55*80 + 0.45*60 = 71 -> pass
        let d = lead(ok(100), ok(80), ok(60), None).decide(&Candidate::default(), &cfg());
        assert!(d.pass, "{d:?}");
        assert_eq!(d.aggregate, Some(71.0));
        assert_eq!(d.weights_used["safety"], 55.0);
    }

    #[test]
    fn renormalises_only_optional() {
        let mut c = cfg();
        c.scoring.phase = "p2".into(); // safety 45 / smart_money 25 / momentum 30
                                       // smart money (optional) missing -> renormalise over 75: (45*80 + 30*60)/75 = 72
        let d = lead(ok(100), ok(80), ok(60), None).decide(&Candidate::default(), &c);
        assert!(d.pass);
        assert_eq!(d.aggregate, Some(72.0));
        assert_eq!(d.weights_used["safety"], 60.0);
        assert!(!d.weights_used.contains_key("smart_money"));
        // with smart money present: (45*80 + 25*20 + 30*60)/100 = 59 -> reject
        let d = lead(ok(100), ok(80), ok(60), ok(20)).decide(&Candidate::default(), &c);
        assert_eq!(d.stage, "min_score");
        assert_eq!(d.aggregate, Some(59.0));
    }
}
