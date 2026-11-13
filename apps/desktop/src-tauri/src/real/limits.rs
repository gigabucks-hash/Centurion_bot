//! Owner-set Real limits. Defaults are 0.05 / 0.5 / 2 SOL and 3 positions.
//! There is no policy ceiling. Tightening applies at once. Loosening applies only
//! when the owner's wallet signature matches the exact old→new message.
//! The book stores the public key and the signature, never a private key.

use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use super::b58;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TakeProfit {
    pub gain_pct: u32,
    pub sell_pct: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Filters {
    pub min_mcap_usd: u64,
    pub max_mcap_usd: Option<u64>,
    pub min_liquidity_usd: u64,
    pub min_volume_24h_usd: u64,
    pub max_top10_pct: u32,
    pub min_holders: u64,
    pub min_age_minutes: u64,
    pub max_age_minutes: Option<u64>,
    pub min_lp_burn_pct: u32,
    pub max_pool_share_pct: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Knobs {
    pub trade_lamports: u64,
    pub daily_lamports: u64,
    pub cap_lamports: u64,
    pub max_positions: u32,
    pub slippage_bps: u32,
    pub priority_fee_lamports: u64,
    pub tip_lamports: u64,
    pub take_profits: Vec<TakeProfit>,
    pub stop_loss_pct: u32,
    pub trail_pct: u32,
    pub max_hold_minutes: u32,
    pub filters: Filters,
}

impl Default for Knobs {
    fn default() -> Self {
        Self {
            trade_lamports: 50_000_000,
            daily_lamports: 500_000_000,
            cap_lamports: 2_000_000_000,
            max_positions: 3,
            slippage_bps: 300,
            priority_fee_lamports: 0,
            tip_lamports: 0,
            take_profits: vec![TakeProfit {
                gain_pct: 100,
                sell_pct: 100,
            }],
            stop_loss_pct: 25,
            trail_pct: 20,
            max_hold_minutes: 0,
            filters: Filters {
                min_mcap_usd: 0,
                max_mcap_usd: None,
                min_liquidity_usd: 0,
                min_volume_24h_usd: 0,
                max_top10_pct: 100,
                min_holders: 0,
                min_age_minutes: 0,
                max_age_minutes: None,
                min_lp_burn_pct: 0,
                max_pool_share_pct: 100,
            },
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeKind {
    Same,
    Tighten,
    Loosen,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RealBook {
    pub enabled: bool,
    pub wallet: String,
    pub rpc_url: String,
    pub global: Knobs,
    pub strategies: BTreeMap<String, Knobs>,
    pub buys_paused: bool,
    /// Strategy ids the owner marked for Real. Paper strategies are not in this set.
    pub real_strategies: Vec<String>,
}

impl Default for RealBook {
    fn default() -> Self {
        Self {
            enabled: false,
            wallet: String::new(),
            rpc_url: "https://api.mainnet-beta.solana.com".into(),
            global: Knobs::default(),
            strategies: BTreeMap::new(),
            buys_paused: false,
            real_strategies: Vec::new(),
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum LimitError {
    Invalid,
    NeedsSignature,
    BadSignature,
}

#[derive(Debug, PartialEq, Eq)]
pub enum BuyRefuse {
    RealOff,
    BuysPaused,
    Guard,
    Risk,
    PerTrade,
    Daily,
    Cap,
    Positions,
    Slippage,
    Filter,
}

pub struct BuyCheck {
    pub guard_pass: bool,
    pub risk_veto: bool,
    pub open_positions: u32,
    pub spent_today: u64,
    pub capital_used: u64,
    pub trade_lamports: u64,
    pub slippage_bps: u32,
    pub mcap_usd: Option<u64>,
    pub liquidity_usd: Option<u64>,
    pub volume_24h_usd: Option<u64>,
    pub top10_pct: Option<u32>,
    pub holders: Option<u64>,
    pub age_minutes: Option<u64>,
    pub lp_burn_pct: Option<u32>,
}

fn room(n: u32) -> u64 {
    if n == 0 {
        u64::MAX
    } else {
        u64::from(n)
    }
}

fn cmp_u64(old: u64, new: u64, higher_looser: bool) -> ChangeKind {
    if old == new {
        ChangeKind::Same
    } else if (new > old) == higher_looser {
        ChangeKind::Loosen
    } else {
        ChangeKind::Tighten
    }
}

fn cmp_room(old: u32, new: u32) -> ChangeKind {
    let (a, b) = (room(old), room(new));
    if a == b {
        ChangeKind::Same
    } else if b > a {
        ChangeKind::Loosen
    } else {
        ChangeKind::Tighten
    }
}

fn cmp_max(old: Option<u64>, new: Option<u64>) -> ChangeKind {
    if old == new {
        ChangeKind::Same
    } else if old.is_none() {
        ChangeKind::Tighten
    } else if new.is_none() || new > old {
        ChangeKind::Loosen
    } else {
        ChangeKind::Tighten
    }
}

fn json_num_or_null(n: Option<u64>) -> serde_json::Value {
    match n {
        Some(v) => serde_json::Value::from(v),
        None => serde_json::Value::Null,
    }
}

fn filters_text(f: &Filters) -> String {
    let mut m = serde_json::Map::new();
    m.insert(
        "max_age_minutes".into(),
        json_num_or_null(f.max_age_minutes),
    );
    m.insert("max_mcap_usd".into(), json_num_or_null(f.max_mcap_usd));
    m.insert(
        "max_pool_share_pct".into(),
        serde_json::Value::from(f.max_pool_share_pct),
    );
    m.insert(
        "max_top10_pct".into(),
        serde_json::Value::from(f.max_top10_pct),
    );
    m.insert(
        "min_age_minutes".into(),
        serde_json::Value::from(f.min_age_minutes),
    );
    m.insert("min_holders".into(), serde_json::Value::from(f.min_holders));
    m.insert(
        "min_liquidity_usd".into(),
        serde_json::Value::from(f.min_liquidity_usd),
    );
    m.insert(
        "min_lp_burn_pct".into(),
        serde_json::Value::from(f.min_lp_burn_pct),
    );
    m.insert(
        "min_mcap_usd".into(),
        serde_json::Value::from(f.min_mcap_usd),
    );
    m.insert(
        "min_volume_24h_usd".into(),
        serde_json::Value::from(f.min_volume_24h_usd),
    );
    serde_json::Value::Object(m).to_string()
}

fn tp_text(list: &[TakeProfit]) -> String {
    let mut rows = list.to_vec();
    rows.sort_by_key(|r| (r.gain_pct, r.sell_pct));
    let v: Vec<_> = rows
        .into_iter()
        .map(|r| serde_json::json!({ "gain_pct": r.gain_pct, "sell_pct": r.sell_pct }))
        .collect();
    serde_json::Value::Array(v).to_string()
}

fn tp_kind(old: &[TakeProfit], new: &[TakeProfit]) -> ChangeKind {
    if tp_text(old) == tp_text(new) {
        return ChangeKind::Same;
    }
    if new.len() < old.len() {
        return ChangeKind::Loosen;
    }
    let mut kind = ChangeKind::Same;
    let n = old.len().max(new.len());
    for i in 0..n {
        match (old.get(i), new.get(i)) {
            (None, Some(_)) => kind = ChangeKind::Tighten,
            (Some(_), None) => return ChangeKind::Loosen,
            (Some(a), Some(b)) => {
                if b.gain_pct > a.gain_pct || b.sell_pct < a.sell_pct {
                    return ChangeKind::Loosen;
                }
                if b.gain_pct < a.gain_pct || b.sell_pct > a.sell_pct {
                    kind = ChangeKind::Tighten;
                }
            }
            (None, None) => {}
        }
    }
    if kind == ChangeKind::Same {
        ChangeKind::Tighten
    } else {
        kind
    }
}

fn filter_kind(a: &Filters, b: &Filters) -> ChangeKind {
    let parts = [
        cmp_u64(a.min_mcap_usd, b.min_mcap_usd, false),
        cmp_max(a.max_mcap_usd, b.max_mcap_usd),
        cmp_u64(a.min_liquidity_usd, b.min_liquidity_usd, false),
        cmp_u64(a.min_volume_24h_usd, b.min_volume_24h_usd, false),
        cmp_u64(u64::from(a.max_top10_pct), u64::from(b.max_top10_pct), true),
        cmp_u64(a.min_holders, b.min_holders, false),
        cmp_u64(a.min_age_minutes, b.min_age_minutes, false),
        cmp_max(a.max_age_minutes, b.max_age_minutes),
        cmp_u64(
            u64::from(a.min_lp_burn_pct),
            u64::from(b.min_lp_burn_pct),
            false,
        ),
        cmp_u64(
            u64::from(a.max_pool_share_pct),
            u64::from(b.max_pool_share_pct),
            true,
        ),
    ];
    if parts.contains(&ChangeKind::Loosen) {
        ChangeKind::Loosen
    } else if parts.contains(&ChangeKind::Tighten) {
        ChangeKind::Tighten
    } else {
        ChangeKind::Same
    }
}

pub fn change_kind(old: &Knobs, new: &Knobs) -> ChangeKind {
    let parts = [
        cmp_u64(old.trade_lamports, new.trade_lamports, true),
        cmp_u64(old.daily_lamports, new.daily_lamports, true),
        cmp_u64(old.cap_lamports, new.cap_lamports, true),
        cmp_u64(
            u64::from(old.max_positions),
            u64::from(new.max_positions),
            true,
        ),
        cmp_u64(
            u64::from(old.slippage_bps),
            u64::from(new.slippage_bps),
            true,
        ),
        cmp_u64(old.priority_fee_lamports, new.priority_fee_lamports, true),
        cmp_u64(old.tip_lamports, new.tip_lamports, true),
        cmp_room(old.stop_loss_pct, new.stop_loss_pct),
        cmp_room(old.trail_pct, new.trail_pct),
        cmp_room(old.max_hold_minutes, new.max_hold_minutes),
        tp_kind(&old.take_profits, &new.take_profits),
        filter_kind(&old.filters, &new.filters),
    ];
    if parts.contains(&ChangeKind::Loosen) {
        ChangeKind::Loosen
    } else if parts.contains(&ChangeKind::Tighten) {
        ChangeKind::Tighten
    } else {
        ChangeKind::Same
    }
}

fn kind_word(k: ChangeKind) -> &'static str {
    match k {
        ChangeKind::Same => "same",
        ChangeKind::Tighten => "tighten",
        ChangeKind::Loosen => "loosen",
    }
}

pub fn limits_message(wallet: &str, scope: &str, old: &Knobs, new: &Knobs) -> String {
    let kind = change_kind(old, new);
    format!(
        "Centurion Trade\naction: set-real-limits\nwallet: {wallet}\nscope: {scope}\n\
trade_lamports: {t0} -> {t1}\n\
daily_lamports: {d0} -> {d1}\n\
cap_lamports: {c0} -> {c1}\n\
max_positions: {p0} -> {p1}\n\
slippage_bps: {s0} -> {s1}\n\
priority_fee_lamports: {f0} -> {f1}\n\
tip_lamports: {i0} -> {i1}\n\
stop_loss_pct: {l0} -> {l1}\n\
trail_pct: {r0} -> {r1}\n\
max_hold_minutes: {h0} -> {h1}\n\
take_profits: {a0} -> {a1}\n\
filters: {b0} -> {b1}\n\
kind: {kind}\n",
        t0 = old.trade_lamports,
        t1 = new.trade_lamports,
        d0 = old.daily_lamports,
        d1 = new.daily_lamports,
        c0 = old.cap_lamports,
        c1 = new.cap_lamports,
        p0 = old.max_positions,
        p1 = new.max_positions,
        s0 = old.slippage_bps,
        s1 = new.slippage_bps,
        f0 = old.priority_fee_lamports,
        f1 = new.priority_fee_lamports,
        i0 = old.tip_lamports,
        i1 = new.tip_lamports,
        l0 = old.stop_loss_pct,
        l1 = new.stop_loss_pct,
        r0 = old.trail_pct,
        r1 = new.trail_pct,
        h0 = old.max_hold_minutes,
        h1 = new.max_hold_minutes,
        a0 = tp_text(&old.take_profits),
        a1 = tp_text(&new.take_profits),
        b0 = filters_text(&old.filters),
        b1 = filters_text(&new.filters),
        kind = kind_word(kind),
    )
}

pub fn enable_message(wallet: &str) -> String {
    format!("Centurion Trade\naction: enable-real\nwallet: {wallet}\n")
}

pub fn verify_wallet(wallet: &str, message: &str, signature_b58: &str) -> Result<(), LimitError> {
    let sig_bytes: [u8; 64] =
        b58::decode_exact(signature_b58).map_err(|_| LimitError::BadSignature)?;
    verify_wallet_bytes(wallet, message, &sig_bytes)
}

pub fn verify_wallet_bytes(
    wallet: &str,
    message: &str,
    sig_bytes: &[u8; 64],
) -> Result<(), LimitError> {
    let pk: [u8; 32] = b58::decode_exact(wallet).map_err(|_| LimitError::BadSignature)?;
    let key = VerifyingKey::from_bytes(&pk).map_err(|_| LimitError::BadSignature)?;
    let sig = Signature::from_bytes(sig_bytes);
    key.verify(message.as_bytes(), &sig)
        .map_err(|_| LimitError::BadSignature)
}

pub fn check_sig(wallet: &str, message: &str, signature: &str) -> Result<(), LimitError> {
    if let Ok(bytes) = decode_hex_sig(signature) {
        return verify_wallet_bytes(wallet, message, &bytes);
    }
    verify_wallet(wallet, message, signature)
}

pub fn decode_hex_sig(s: &str) -> Result<[u8; 64], LimitError> {
    let s = s.trim();
    if s.len() != 128 || !s.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(LimitError::BadSignature);
    }
    let mut out = [0u8; 64];
    for i in 0..64 {
        out[i] =
            u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).map_err(|_| LimitError::BadSignature)?;
    }
    Ok(out)
}

fn pct_ok(n: u32) -> bool {
    n <= 100
}

pub fn validate(k: &Knobs) -> Result<(), LimitError> {
    if k.trade_lamports == 0 || k.max_positions == 0 || k.slippage_bps > 10_000 {
        return Err(LimitError::Invalid);
    }
    if !pct_ok(k.stop_loss_pct) || !pct_ok(k.trail_pct) {
        return Err(LimitError::Invalid);
    }
    if k.take_profits.len() > 8 {
        return Err(LimitError::Invalid);
    }
    for tp in &k.take_profits {
        if tp.gain_pct == 0 || tp.gain_pct > 100_000 || tp.sell_pct == 0 || tp.sell_pct > 100 {
            return Err(LimitError::Invalid);
        }
    }
    let f = &k.filters;
    if !pct_ok(f.max_top10_pct) || !pct_ok(f.max_pool_share_pct) || !pct_ok(f.min_lp_burn_pct) {
        return Err(LimitError::Invalid);
    }
    if f.max_mcap_usd.is_some_and(|m| m < f.min_mcap_usd) {
        return Err(LimitError::Invalid);
    }
    if f.max_age_minutes.is_some_and(|m| m < f.min_age_minutes) {
        return Err(LimitError::Invalid);
    }
    Ok(())
}

impl RealBook {
    pub fn effective(&self, strategy: Option<&str>) -> Knobs {
        strategy
            .and_then(|id| self.strategies.get(id).cloned())
            .unwrap_or_else(|| self.global.clone())
    }

    pub fn enable(&mut self, wallet: &str, signature_b58: &str) -> Result<(), LimitError> {
        check_sig(wallet, &enable_message(wallet), signature_b58)?;
        self.wallet = wallet.to_owned();
        self.enabled = true;
        Ok(())
    }

    pub fn apply(
        &mut self,
        scope: &str,
        new: Knobs,
        signature_b58: Option<&str>,
    ) -> Result<ChangeKind, LimitError> {
        validate(&new)?;
        let old = if scope == "global" {
            self.global.clone()
        } else {
            let id = scope.strip_prefix("strategy:").ok_or(LimitError::Invalid)?;
            if id.is_empty() {
                return Err(LimitError::Invalid);
            }
            self.strategies
                .get(id)
                .cloned()
                .unwrap_or_else(|| self.global.clone())
        };
        let kind = change_kind(&old, &new);
        if kind == ChangeKind::Loosen {
            let sig = signature_b58.ok_or(LimitError::NeedsSignature)?;
            if self.wallet.is_empty() {
                return Err(LimitError::NeedsSignature);
            }
            let msg = limits_message(&self.wallet, scope, &old, &new);
            check_sig(&self.wallet, &msg, sig)?;
        }
        if scope == "global" {
            self.global = new;
        } else if let Some(id) = scope.strip_prefix("strategy:") {
            self.strategies.insert(id.to_owned(), new);
        }
        Ok(kind)
    }

    pub fn admit_buy(&self, strategy: Option<&str>, c: &BuyCheck) -> Result<(), BuyRefuse> {
        if !self.enabled {
            return Err(BuyRefuse::RealOff);
        }
        if self.buys_paused {
            return Err(BuyRefuse::BuysPaused);
        }
        if !c.guard_pass {
            return Err(BuyRefuse::Guard);
        }
        if c.risk_veto {
            return Err(BuyRefuse::Risk);
        }
        let k = self.effective(strategy);
        if c.trade_lamports > k.trade_lamports {
            return Err(BuyRefuse::PerTrade);
        }
        if c.spent_today.saturating_add(c.trade_lamports) > k.daily_lamports {
            return Err(BuyRefuse::Daily);
        }
        if c.capital_used.saturating_add(c.trade_lamports) > k.cap_lamports {
            return Err(BuyRefuse::Cap);
        }
        if c.open_positions >= k.max_positions {
            return Err(BuyRefuse::Positions);
        }
        if c.slippage_bps > k.slippage_bps {
            return Err(BuyRefuse::Slippage);
        }
        let f = &k.filters;
        if c.mcap_usd.is_some_and(|v| v < f.min_mcap_usd) {
            return Err(BuyRefuse::Filter);
        }
        if c.mcap_usd
            .is_some_and(|v| f.max_mcap_usd.is_some_and(|m| v > m))
        {
            return Err(BuyRefuse::Filter);
        }
        if c.liquidity_usd.is_some_and(|v| v < f.min_liquidity_usd) {
            return Err(BuyRefuse::Filter);
        }
        if c.volume_24h_usd.is_some_and(|v| v < f.min_volume_24h_usd) {
            return Err(BuyRefuse::Filter);
        }
        if c.top10_pct.is_some_and(|v| v > f.max_top10_pct) {
            return Err(BuyRefuse::Filter);
        }
        if c.holders.is_some_and(|v| v < f.min_holders) {
            return Err(BuyRefuse::Filter);
        }
        if c.age_minutes.is_some_and(|v| v < f.min_age_minutes) {
            return Err(BuyRefuse::Filter);
        }
        if c.age_minutes
            .is_some_and(|v| f.max_age_minutes.is_some_and(|m| v > m))
        {
            return Err(BuyRefuse::Filter);
        }
        if c.lp_burn_pct.is_some_and(|v| v < f.min_lp_burn_pct) {
            return Err(BuyRefuse::Filter);
        }
        Ok(())
    }

    #[cfg(test)]
    pub fn admit_sell(&self) -> Result<(), BuyRefuse> {
        if self.enabled {
            Ok(())
        } else {
            Err(BuyRefuse::RealOff)
        }
    }
}

pub fn rpc_url_ok(url: &str) -> bool {
    let Some((scheme, rest)) = url.split_once("://") else {
        return false;
    };
    if rest.contains('@')
        || rest.contains('?')
        || rest.contains('#')
        || rest.contains(char::is_whitespace)
    {
        return false;
    }
    let host = rest.split('/').next().unwrap_or("");
    if host.is_empty()
        || rest.contains('/') && rest.split_once('/').is_some_and(|(_, p)| !p.is_empty())
    {
        return false;
    }
    if scheme == "https" {
        return true;
    }
    scheme == "http" && (host.starts_with("127.0.0.1") || host.starts_with("localhost"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn sign(seed: &[u8; 32], msg: &str) -> (String, String) {
        let sk = SigningKey::from_bytes(seed);
        let vk = sk.verifying_key();
        let sig = sk.sign(msg.as_bytes());
        (b58::encode(vk.as_bytes()), b58::encode(&sig.to_bytes()))
    }

    fn blank() -> BuyCheck {
        BuyCheck {
            guard_pass: true,
            risk_veto: false,
            open_positions: 0,
            spent_today: 0,
            capital_used: 0,
            trade_lamports: 50_000_000,
            slippage_bps: 100,
            mcap_usd: Some(20_000),
            liquidity_usd: Some(10_000),
            volume_24h_usd: Some(5_000),
            top10_pct: Some(20),
            holders: Some(50),
            age_minutes: Some(30),
            lp_burn_pct: Some(100),
        }
    }

    #[test]
    fn defaults_and_no_ceiling_on_size() {
        let d = Knobs::default();
        assert_eq!(d.trade_lamports, 50_000_000);
        assert_eq!(d.daily_lamports, 500_000_000);
        assert_eq!(d.cap_lamports, 2_000_000_000);
        assert_eq!(d.max_positions, 3);
        let mut big = d.clone();
        big.trade_lamports = 25_000_000_000;
        big.max_positions = 40;
        assert!(validate(&big).is_ok());
    }

    #[test]
    fn tighten_is_instant_and_loosen_needs_the_wallet() {
        let mut book = RealBook::default();
        let seed = [7u8; 32];
        let msg = enable_message("placeholder");
        let _ = msg;
        let enable = enable_message_for(&seed);
        book.enable(&enable.0, &enable.1).unwrap();
        assert!(book.enabled);

        let mut tight = book.global.clone();
        tight.trade_lamports = 20_000_000;
        tight.max_positions = 1;
        assert_eq!(
            book.apply("global", tight, None).unwrap(),
            ChangeKind::Tighten
        );
        assert_eq!(book.global.trade_lamports, 20_000_000);

        let mut loose = book.global.clone();
        loose.trade_lamports = 1_000_000_000;
        assert_eq!(
            book.apply("global", loose.clone(), None),
            Err(LimitError::NeedsSignature)
        );
        let msg = limits_message(&book.wallet, "global", &book.global, &loose);
        let sk = SigningKey::from_bytes(&seed);
        let sig = b58::encode(&sk.sign(msg.as_bytes()).to_bytes());
        assert_eq!(
            book.apply("global", loose, Some(&sig)).unwrap(),
            ChangeKind::Loosen
        );
        assert_eq!(book.global.trade_lamports, 1_000_000_000);

        let stored = serde_json::to_string(&book).unwrap();
        assert!(!stored.to_lowercase().contains("private"));
        assert!(!stored.contains("secret"));
    }

    fn enable_message_for(seed: &[u8; 32]) -> (String, String) {
        let sk = SigningKey::from_bytes(seed);
        let wallet = b58::encode(sk.verifying_key().as_bytes());
        let sig = b58::encode(&sk.sign(enable_message(&wallet).as_bytes()).to_bytes());
        (wallet, sig)
    }

    #[test]
    fn guard_risk_stop_and_caps_veto_buys_sells_still_pass() {
        let mut book = RealBook::default();
        assert_eq!(book.admit_buy(None, &blank()), Err(BuyRefuse::RealOff));
        let (w, s) = enable_message_for(&[9u8; 32]);
        book.enable(&w, &s).unwrap();
        assert!(book.admit_buy(None, &blank()).is_ok());
        book.buys_paused = true;
        assert_eq!(book.admit_buy(None, &blank()), Err(BuyRefuse::BuysPaused));
        assert!(book.admit_sell().is_ok(), "stop does not block a sell");
        book.buys_paused = false;
        let mut c = blank();
        c.guard_pass = false;
        assert_eq!(book.admit_buy(None, &c), Err(BuyRefuse::Guard));
        c.guard_pass = true;
        c.risk_veto = true;
        assert_eq!(book.admit_buy(None, &c), Err(BuyRefuse::Risk));
        c.risk_veto = false;
        c.trade_lamports = 50_000_001;
        assert_eq!(book.admit_buy(None, &c), Err(BuyRefuse::PerTrade));
        c.trade_lamports = 50_000_000;
        c.open_positions = 3;
        assert_eq!(book.admit_buy(None, &c), Err(BuyRefuse::Positions));
    }

    #[test]
    fn message_matches_the_desktop_dialog() {
        let old = Knobs::default();
        let mut new = old.clone();
        new.trade_lamports = 1_000_000_000;
        let msg = limits_message("Wallet111", "global", &old, &new);
        assert!(msg.starts_with(
            "Centurion Trade\naction: set-real-limits\nwallet: Wallet111\nscope: global\n"
        ));
        assert!(msg.contains("trade_lamports: 50000000 -> 1000000000\n"));
        assert!(msg.contains("kind: loosen\n"));
        assert!(msg.contains("take_profits: [{\"gain_pct\":100,\"sell_pct\":100}] -> [{\"gain_pct\":100,\"sell_pct\":100}]\n"));
    }

    #[test]
    fn sign_helper_roundtrip() {
        let (w, s) = sign(&[3u8; 32], "Centurion Trade\n");
        assert!(verify_wallet(&w, "Centurion Trade\n", &s).is_ok());
        assert!(verify_wallet(&w, "other", &s).is_err());
    }
}
