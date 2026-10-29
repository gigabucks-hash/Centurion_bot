//! pump.fun bonding-curve account: decoding, quote-mint gate and a bounded, TTL'd cache.
//!
//! Layout, as worked out from mainnet accounts captured on 2026-10-29
//! (`services/backend/fixtures/mainnet/curve_*.json`, 166 bytes, owner = launch program):
//!
//! | offset | size | field |
//! |---|---|---|
//! | 0 | 8 | Anchor discriminator `sha256("account:BondingCurve")[..8]` = `17b7f83760d8ac60` |
//! | 8 | 8 | virtual_token_reserves (u64, raw token units, 6 decimals) |
//! | 16 | 8 | virtual_quote_reserves (u64, **quote-mint** base units; lamports when the quote is SOL) |
//! | 24 | 8 | real_token_reserves |
//! | 32 | 8 | real_quote_reserves |
//! | 40 | 8 | token_total_supply |
//! | 48 | 1 | complete (bool) |
//! | 49 | 32 | creator |
//! | 81 | 2 | two flag bytes (observed 0/1; meaning not needed here, kept raw) |
//! | 83 | 32 | quote_mint (all-zero = SOL; otherwise an SPL mint) |
//! | 115 | .. | further fields, ignored |
//!
//! Accounts shorter than 115 bytes carry no quote mint; they decode with `quote = None` and are
//! treated as **not tradeable** (unknown quote), never assumed to be SOL.
use std::collections::HashMap;

use async_trait::async_trait;
use base64::Engine as _;
use common::{QuoteAsset, TsMs};
use papersim::PoolState;
use serde_json::{json, Value};

pub const BONDING_CURVE_DISCRIMINATOR: [u8; 8] = [0x17, 0xb7, 0xf8, 0x37, 0x60, 0xd8, 0xac, 0x60];
const MIN_LEN: usize = 81;
const QUOTE_LEN: usize = 115;
const LAMPORTS_PER_SOL: f64 = 1_000_000_000.0;
const TOKEN_UNITS: f64 = 1_000_000.0;

#[derive(Debug, Clone, PartialEq)]
pub struct BondingCurve {
    pub virtual_token_reserves: u64,
    pub virtual_quote_reserves: u64,
    pub real_token_reserves: u64,
    pub real_quote_reserves: u64,
    pub token_total_supply: u64,
    pub complete: bool,
    pub creator: String,
    pub flags: Option<[u8; 2]>,
    /// `None` when the account predates the quote-mint field.
    pub quote: Option<QuoteAsset>,
}

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum CurveError {
    #[error("not a bonding-curve account: {0}")]
    NotACurve(&'static str),
    #[error("account not found")]
    NotFound,
    #[error("rpc: {0}")]
    Rpc(String),
    #[error("not a token mint: {0}")]
    NotAMint(&'static str),
}

/// SPL Token program.
pub const SPL_TOKEN_PROGRAM: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
/// Token-2022 program (pump.fun CreateV2 mints).
pub const TOKEN_2022_PROGRAM: &str = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/// Facts read from a mint account. Both token programs share the 82-byte base layout:
/// mint_authority COption<Pubkey> (36) | supply u64 (8) | decimals u8 @44 | is_initialized u8 @45 | freeze COption (36).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MintInfo {
    pub decimals: u8,
    pub token_program: String,
}

pub fn decode_mint(owner: &str, data: &[u8]) -> Result<MintInfo, CurveError> {
    if owner != SPL_TOKEN_PROGRAM && owner != TOKEN_2022_PROGRAM {
        return Err(CurveError::NotAMint("owner is not a token program"));
    }
    if data.len() < 82 {
        return Err(CurveError::NotAMint("shorter than 82 bytes"));
    }
    if data[45] != 1 {
        return Err(CurveError::NotAMint("mint not initialized"));
    }
    Ok(MintInfo {
        decimals: data[44],
        token_program: owner.to_string(),
    })
}

/// Fetch + decode a mint account (read-only `getAccountInfo`).
pub async fn fetch_mint(fetcher: &dyn AccountFetcher, mint: &str) -> Result<MintInfo, CurveError> {
    let raw = fetcher.get_account_info(mint).await?;
    let (_, owner, data) = parse_account_info(&raw)?;
    decode_mint(&owner, &data)
}

/// Why a curve cannot back a paper fill.
#[derive(Debug, Clone, PartialEq)]
pub enum NotTradeable {
    /// `UNSUPPORTED_QUOTE_MINT`, with the quote mint (or `None` if the account has no quote field).
    UnsupportedQuoteMint(Option<String>),
    Complete,
    Empty,
}

fn u64_at(d: &[u8], at: usize) -> u64 {
    let mut b = [0u8; 8];
    b.copy_from_slice(&d[at..at + 8]);
    u64::from_le_bytes(b)
}

pub fn decode_bonding_curve(d: &[u8]) -> Result<BondingCurve, CurveError> {
    if d.len() < MIN_LEN {
        return Err(CurveError::NotACurve("too short"));
    }
    if d[..8] != BONDING_CURVE_DISCRIMINATOR {
        return Err(CurveError::NotACurve("discriminator"));
    }
    let complete = match d[48] {
        0 => false,
        1 => true,
        _ => return Err(CurveError::NotACurve("complete flag")),
    };
    let (flags, quote) = if d.len() >= QUOTE_LEN {
        let mut q = [0u8; 32];
        q.copy_from_slice(&d[83..115]);
        (Some([d[81], d[82]]), Some(QuoteAsset::from_pubkey_bytes(q)))
    } else {
        (None, None)
    };
    Ok(BondingCurve {
        virtual_token_reserves: u64_at(d, 8),
        virtual_quote_reserves: u64_at(d, 16),
        real_token_reserves: u64_at(d, 24),
        real_quote_reserves: u64_at(d, 32),
        token_total_supply: u64_at(d, 40),
        complete,
        creator: bs58::encode(&d[49..81]).into_string(),
        flags,
        quote,
    })
}

impl BondingCurve {
    /// Wire form of the quote mint (wSOL mint for SOL); `None` if unknown.
    pub fn quote_mint(&self) -> Option<String> {
        self.quote.map(|q| q.mint())
    }
    /// Pool for the paper simulator. Only SOL-quoted, live curves qualify; reserves are never converted.
    pub fn pool_state(&self) -> Result<PoolState, NotTradeable> {
        match self.quote {
            Some(q) if q.is_sol() => {}
            other => return Err(NotTradeable::UnsupportedQuoteMint(other.map(|q| q.mint()))),
        }
        if self.complete {
            return Err(NotTradeable::Complete);
        }
        if self.virtual_quote_reserves == 0 || self.virtual_token_reserves == 0 {
            return Err(NotTradeable::Empty);
        }
        Ok(PoolState {
            sol_reserve: self.virtual_quote_reserves as f64 / LAMPORTS_PER_SOL,
            token_reserve: self.virtual_token_reserves as f64 / TOKEN_UNITS,
            quote: QuoteAsset::Sol,
        })
    }
}

/// JSON-RPC `getAccountInfo` (base64).
pub fn get_account_info_request(id: u64, pubkey: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "method": "getAccountInfo",
            "params": [pubkey, { "encoding": "base64", "commitment": "confirmed" }] })
}

/// Parse a `getAccountInfo` response -> (context slot, owner, data).
pub fn parse_account_info(raw: &str) -> Result<(u64, String, Vec<u8>), CurveError> {
    let v: Value = serde_json::from_str(raw).map_err(|e| CurveError::Rpc(e.to_string()))?;
    if let Some(e) = v.get("error") {
        return Err(CurveError::Rpc(e.to_string()));
    }
    let r = v.get("result").ok_or(CurveError::Rpc("no result".into()))?;
    let slot = r
        .pointer("/context/slot")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let val = r
        .get("value")
        .filter(|x| !x.is_null())
        .ok_or(CurveError::NotFound)?;
    let owner = val
        .get("owner")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let b64 = val
        .pointer("/data/0")
        .and_then(Value::as_str)
        .ok_or(CurveError::Rpc("no data".into()))?;
    let data = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| CurveError::Rpc(e.to_string()))?;
    Ok((slot, owner, data))
}

/// Reads one account over RPC. Implementations must be read-only.
#[async_trait]
pub trait AccountFetcher: Send + Sync {
    async fn get_account_info(&self, pubkey: &str) -> Result<String, CurveError>;
}

/// Post-trade reserves carried by a trade event.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TradeReserves {
    pub slot: u64,
    pub virtual_token_reserves: u64,
    pub virtual_quote_reserves: u64,
    pub real_token_reserves: Option<u64>,
    pub real_quote_reserves: Option<u64>,
}

#[derive(Debug, Clone)]
struct Entry {
    curve: BondingCurve,
    slot: u64,
    refreshed_ms: TsMs,
}

/// Per-curve cache. Bounded (`capacity`, oldest evicted first) with two staleness limits:
/// wall-clock `ttl_ms` since the last refresh, and `max_slot_lag` behind the newest slot seen.
#[derive(Debug)]
pub struct CurveCache {
    capacity: usize,
    ttl_ms: i64,
    max_slot_lag: u64,
    latest_slot: u64,
    entries: HashMap<String, Entry>,
    by_mint: HashMap<String, String>,
    pub stats: CacheStats,
    /// Mint accounts (decimals + token program). Shared by every source that owns this cache.
    pub mints: MintCache,
}

/// Bounded cache of decoded mint accounts. `decimals` and the owning program never change after
/// `InitializeMint`, so entries do not expire; they are evicted oldest-first at capacity.
/// Failed reads are not cached (the next create/lookup retries).
#[derive(Debug)]
pub struct MintCache {
    capacity: usize,
    entries: HashMap<String, MintInfo>,
    order: std::collections::VecDeque<String>,
    pub stats: CacheStats,
}

impl MintCache {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            entries: HashMap::new(),
            order: std::collections::VecDeque::new(),
            stats: CacheStats::default(),
        }
    }
    pub fn len(&self) -> usize {
        self.entries.len()
    }
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
    pub fn get(&self, mint: &str) -> Option<&MintInfo> {
        self.entries.get(mint)
    }
    pub fn insert(&mut self, mint: &str, info: MintInfo) {
        if self.entries.insert(mint.to_string(), info).is_none() {
            self.order.push_back(mint.to_string());
            while self.entries.len() > self.capacity {
                if let Some(old) = self.order.pop_front() {
                    self.entries.remove(&old);
                    self.stats.evictions += 1;
                }
            }
        }
    }
    pub async fn get_or_fetch(
        &mut self,
        mint: &str,
        fetcher: &dyn AccountFetcher,
    ) -> Result<MintInfo, CurveError> {
        if let Some(m) = self.entries.get(mint) {
            self.stats.hits += 1;
            return Ok(m.clone());
        }
        self.stats.fetches += 1;
        let m = fetch_mint(fetcher, mint).await?;
        self.insert(mint, m.clone());
        Ok(m)
    }
}

/// Fill `decimals` / `token_program` on a new coin from its mint account (cached).
/// On failure the coin keeps `decimals: None` and loses its pool: decimals are never assumed,
/// so the pipeline reports `order.failed POOL_STALE` instead of filling.
pub async fn attach_mint(
    mints: &mut MintCache,
    fetcher: &dyn AccountFetcher,
    c: &mut crate::source::NewCoin,
) {
    match mints.get_or_fetch(c.mint.as_str(), fetcher).await {
        Ok(m) => {
            c.decimals = Some(m.decimals);
            c.token_program = Some(m.token_program);
        }
        Err(e) => {
            tracing::warn!(mint = %c.mint, error = %e, "mint account unavailable");
            c.decimals = None;
            c.token_program = None;
            c.pool = None;
        }
    }
}

pub const MINT_CACHE_CAPACITY: usize = 50_000;

#[derive(Debug, Default, Clone, Copy, PartialEq)]
pub struct CacheStats {
    pub hits: u64,
    pub fetches: u64,
    pub trade_updates: u64,
    pub evictions: u64,
}

impl CurveCache {
    pub fn new(capacity: usize, ttl_ms: i64, max_slot_lag: u64) -> Self {
        Self {
            capacity: capacity.max(1),
            ttl_ms,
            max_slot_lag,
            latest_slot: 0,
            entries: HashMap::new(),
            by_mint: HashMap::new(),
            stats: CacheStats::default(),
            mints: MintCache::new(MINT_CACHE_CAPACITY),
        }
    }
    pub fn len(&self) -> usize {
        self.entries.len()
    }
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
    pub fn curve_for_mint(&self, mint: &str) -> Option<&str> {
        self.by_mint.get(mint).map(String::as_str)
    }
    /// Record the newest slot seen on the stream (every frame).
    pub fn on_slot(&mut self, slot: u64) {
        self.latest_slot = self.latest_slot.max(slot);
    }
    pub fn insert(
        &mut self,
        curve_pk: &str,
        mint: &str,
        curve: BondingCurve,
        slot: u64,
        now: TsMs,
    ) {
        if !self.entries.contains_key(curve_pk) && self.entries.len() >= self.capacity {
            self.evict();
        }
        self.on_slot(slot);
        self.entries.insert(
            curve_pk.to_string(),
            Entry {
                curve,
                slot,
                refreshed_ms: now,
            },
        );
        self.by_mint.insert(mint.to_string(), curve_pk.to_string());
    }
    fn evict(&mut self) {
        // drop the oldest ~1/8 (at least one) so eviction cost is amortised
        let n = (self.capacity / 8).max(1);
        let mut v: Vec<(TsMs, String)> = self
            .entries
            .iter()
            .map(|(k, e)| (e.refreshed_ms, k.clone()))
            .collect();
        v.sort();
        for (_, k) in v.into_iter().take(n) {
            self.entries.remove(&k);
            self.stats.evictions += 1;
        }
        let live = &self.entries;
        self.by_mint.retain(|_, c| live.contains_key(c));
    }
    fn is_fresh(&self, e: &Entry, now: TsMs) -> bool {
        now - e.refreshed_ms <= self.ttl_ms
            && self.latest_slot.saturating_sub(e.slot) <= self.max_slot_lag
    }
    /// Fresh cached curve, if any.
    pub fn fresh(&self, curve_pk: &str, now: TsMs) -> Option<&BondingCurve> {
        self.entries
            .get(curve_pk)
            .filter(|e| self.is_fresh(e, now))
            .map(|e| &e.curve)
    }
    /// Apply a trade's post-trade reserves. Returns `false` when the curve is not cached or the trade
    /// is older than the cached state (caller then falls back to `getAccountInfo`).
    pub fn apply_trade(&mut self, mint: &str, t: TradeReserves, now: TsMs) -> bool {
        self.on_slot(t.slot);
        let Some(pk) = self.by_mint.get(mint) else {
            return false;
        };
        let Some(e) = self.entries.get_mut(pk) else {
            return false;
        };
        if t.slot < e.slot {
            return false;
        }
        e.curve.virtual_token_reserves = t.virtual_token_reserves;
        e.curve.virtual_quote_reserves = t.virtual_quote_reserves;
        if let Some(x) = t.real_token_reserves {
            e.curve.real_token_reserves = x;
        }
        if let Some(x) = t.real_quote_reserves {
            e.curve.real_quote_reserves = x;
        }
        e.slot = t.slot;
        e.refreshed_ms = now;
        self.stats.trade_updates += 1;
        true
    }
    /// Mark a curve complete (curve-complete event) without a round trip.
    pub fn mark_complete(&mut self, mint: &str) {
        if let Some(e) = self
            .by_mint
            .get(mint)
            .and_then(|pk| self.entries.get_mut(pk))
        {
            e.curve.complete = true;
        }
    }
    /// Cached curve if fresh, else `getAccountInfo` (read-only) and cache the result.
    pub async fn get_or_fetch(
        &mut self,
        curve_pk: &str,
        mint: &str,
        fetcher: &dyn AccountFetcher,
        now: TsMs,
    ) -> Result<BondingCurve, CurveError> {
        if let Some(c) = self.fresh(curve_pk, now).cloned() {
            self.stats.hits += 1;
            return Ok(c);
        }
        self.stats.fetches += 1;
        let raw = fetcher.get_account_info(curve_pk).await?;
        let (slot, _owner, data) = parse_account_info(&raw)?;
        let curve = decode_bonding_curve(&data)?;
        self.insert(curve_pk, mint, curve.clone(), slot, now);
        Ok(curve)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn mainnet(name: &str) -> String {
        let p = format!(
            "{}/../../fixtures/mainnet/{name}",
            env!("CARGO_MANIFEST_DIR")
        );
        std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("{p}: {e}"))
    }
    const SOL_CURVE: &str = "Eyp21gEasyUn85yrySC13DoXBSRG5sw8vexe7eLcMSoF";
    const SOL_MINT_COIN: &str = "Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump";
    const PUMP_QUOTE: &str = "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn";

    fn decoded(name: &str) -> (u64, BondingCurve) {
        let (slot, owner, data) = parse_account_info(&mainnet(name)).expect("account");
        assert_eq!(owner, "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
        assert_eq!(data.len(), 166);
        (slot, decode_bonding_curve(&data).expect("curve"))
    }

    #[test]
    fn discriminator_is_anchor_account_prefix() {
        use sha2::{Digest, Sha256};
        assert_eq!(
            Sha256::digest(b"account:BondingCurve")[..8],
            BONDING_CURVE_DISCRIMINATOR
        );
    }

    #[test]
    fn mainnet_sol_quote_curve_exact() {
        let (slot, c) = decoded("curve_sol_quote.2026-10-29.json");
        assert_eq!(slot, 462_834_787);
        assert_eq!(
            c,
            BondingCurve {
                virtual_token_reserves: 1_397_948_479_570_101,
                virtual_quote_reserves: 95_584_963,
                real_token_reserves: 1_118_048_479_570_101,
                real_quote_reserves: 6,
                token_total_supply: 1_000_000_000_000_000,
                complete: false,
                creator: "DAqfZQBcj1MWwSKY3jahzSXTcmEi4Do1XBNPnwbkNLPf".into(),
                flags: Some([1, 0]),
                quote: Some(QuoteAsset::Sol),
            }
        );
        assert_eq!(c.quote_mint().as_deref(), Some(common::WSOL_MINT));
        let p = c.pool_state().expect("SOL curve is tradeable");
        assert!((p.sol_reserve - 0.095_584_963).abs() < 1e-12);
        assert!((p.token_reserve - 1_397_948_479.570_101).abs() < 1e-6);
    }

    #[test]
    fn mainnet_non_sol_quote_curve_exact_and_rejected() {
        let (slot, c) = decoded("curve_non_sol_quote.2026-10-29.json");
        assert_eq!(slot, 462_834_787);
        assert_eq!(c.virtual_token_reserves, 1_072_993_568_334_454);
        assert_eq!(c.virtual_quote_reserves, 773_916_469_047);
        assert_eq!(c.real_token_reserves, 793_093_568_334_454);
        assert_eq!(c.real_quote_reserves, 4_638_936);
        assert_eq!(c.token_total_supply, 1_000_000_000_000_000);
        assert!(!c.complete);
        assert_eq!(c.creator, "9R55983jyCunSsqAx7G9BxbYN5mbkaRDsPuof7sejSQJ");
        assert_eq!(c.flags, Some([0, 0]));
        assert_eq!(c.quote_mint().as_deref(), Some(PUMP_QUOTE));
        assert_eq!(
            c.pool_state(),
            Err(NotTradeable::UnsupportedQuoteMint(Some(PUMP_QUOTE.into())))
        );
    }

    #[test]
    fn mainnet_complete_curve() {
        let (_, c) = decoded("curve_sol_quote_complete.2026-10-29.json");
        assert!(c.complete);
        assert_eq!((c.virtual_token_reserves, c.virtual_quote_reserves), (0, 0));
        assert_eq!(c.creator, "92rjsyV1bKBwW5e4ikXucq6gNCisKYPf9xHYpoJJTKU4");
        assert_eq!(c.quote, Some(QuoteAsset::Sol));
        assert_eq!(c.pool_state(), Err(NotTradeable::Complete));
    }

    #[test]
    fn short_or_foreign_accounts() {
        let (_, _, mut data) =
            parse_account_info(&mainnet("curve_sol_quote.2026-10-29.json")).expect("a");
        let legacy = decode_bonding_curve(&data[..81]).expect("legacy prefix");
        assert_eq!(legacy.quote, None, "no quote field -> unknown, not SOL");
        assert_eq!(
            legacy.pool_state(),
            Err(NotTradeable::UnsupportedQuoteMint(None))
        );
        data[0] ^= 0xff;
        assert_eq!(
            decode_bonding_curve(&data),
            Err(CurveError::NotACurve("discriminator"))
        );
        assert_eq!(
            decode_bonding_curve(&[0u8; 10]),
            Err(CurveError::NotACurve("too short"))
        );
        assert_eq!(
            parse_account_info(
                r#"{"jsonrpc":"2.0","result":{"context":{"slot":1},"value":null},"id":1}"#
            ),
            Err(CurveError::NotFound)
        );
    }

    struct Fixture {
        raw: String,
        calls: AtomicUsize,
    }
    #[async_trait]
    impl AccountFetcher for Fixture {
        async fn get_account_info(&self, _pk: &str) -> Result<String, CurveError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(self.raw.clone())
        }
    }
    fn fixture() -> Fixture {
        Fixture {
            raw: mainnet("curve_sol_quote.2026-10-29.json"),
            calls: AtomicUsize::new(0),
        }
    }

    #[tokio::test]
    async fn cache_hit_then_ttl_and_slot_staleness_fall_back_to_rpc() {
        let f = fixture();
        let mut c = CurveCache::new(16, 5_000, 150);
        c.get_or_fetch(SOL_CURVE, SOL_MINT_COIN, &f, 0)
            .await
            .expect("fetch");
        c.get_or_fetch(SOL_CURVE, SOL_MINT_COIN, &f, 1_000)
            .await
            .expect("hit");
        assert_eq!(
            f.calls.load(Ordering::SeqCst),
            1,
            "fresh entry served from cache"
        );
        // wall-clock TTL
        c.get_or_fetch(SOL_CURVE, SOL_MINT_COIN, &f, 6_001)
            .await
            .expect("ttl refetch");
        assert_eq!(f.calls.load(Ordering::SeqCst), 2);
        // stream moved far ahead (missed frames): slot lag forces a re-read
        c.on_slot(462_834_787 + 151);
        assert!(c.fresh(SOL_CURVE, 6_002).is_none());
        c.get_or_fetch(SOL_CURVE, SOL_MINT_COIN, &f, 6_002)
            .await
            .expect("slot refetch");
        assert_eq!(f.calls.load(Ordering::SeqCst), 3);
        assert_eq!(c.stats.hits, 1);
        assert_eq!(c.stats.fetches, 3);
    }

    #[tokio::test]
    async fn trade_deltas_update_reserves_and_miss_falls_back() {
        let f = fixture();
        let mut c = CurveCache::new(16, 5_000, 150);
        // trade before the curve is known: not applied -> caller must fetch
        let t = TradeReserves {
            slot: 462_834_790,
            virtual_token_reserves: 1_390_000_000_000_000,
            virtual_quote_reserves: 96_000_000,
            real_token_reserves: Some(1_110_000_000_000_000),
            real_quote_reserves: Some(500_000),
        };
        assert!(!c.apply_trade(SOL_MINT_COIN, t, 0));
        c.get_or_fetch(SOL_CURVE, SOL_MINT_COIN, &f, 0)
            .await
            .expect("fallback fetch");
        assert!(c.apply_trade(SOL_MINT_COIN, t, 10));
        let cur = c.fresh(SOL_CURVE, 10).expect("fresh");
        assert_eq!(cur.virtual_quote_reserves, 96_000_000);
        assert_eq!(cur.real_quote_reserves, 500_000);
        assert_eq!(
            cur.creator, "DAqfZQBcj1MWwSKY3jahzSXTcmEi4Do1XBNPnwbkNLPf",
            "non-reserve fields kept"
        );
        // an older trade never rolls state back
        let old = TradeReserves {
            slot: 462_834_700,
            virtual_quote_reserves: 1,
            ..t
        };
        assert!(!c.apply_trade(SOL_MINT_COIN, old, 11));
        assert_eq!(
            c.fresh(SOL_CURVE, 11)
                .expect("fresh")
                .virtual_quote_reserves,
            96_000_000
        );
        // trade refresh resets the TTL clock: no fetch needed later
        c.get_or_fetch(SOL_CURVE, SOL_MINT_COIN, &f, 4_000)
            .await
            .expect("hit");
        assert_eq!(f.calls.load(Ordering::SeqCst), 1);
        c.mark_complete(SOL_MINT_COIN);
        assert_eq!(
            c.fresh(SOL_CURVE, 4_001).expect("c").pool_state(),
            Err(NotTradeable::Complete)
        );
    }

    #[test]
    fn cache_is_bounded() {
        let (_, curve) = decoded("curve_sol_quote.2026-10-29.json");
        let mut c = CurveCache::new(8, 60_000, 1_000);
        for i in 0..20 {
            c.insert(
                &format!("curve{i}"),
                &format!("mint{i}"),
                curve.clone(),
                1,
                i,
            );
        }
        assert!(c.len() <= 8);
        assert!(c.fresh("curve19", 20).is_some(), "newest kept");
        assert!(c.fresh("curve0", 20).is_none(), "oldest evicted");
        assert!(
            c.curve_for_mint("mint0").is_none(),
            "mint index follows evictions"
        );
        assert!(c.stats.evictions >= 12);
    }

    #[test]
    fn decodes_mainnet_mint_accounts_exactly() {
        for (f, decimals, program) in [
            ("mint_sol_quote.2026-10-29.json", 6, TOKEN_2022_PROGRAM),
            ("mint_non_sol_quote.2026-10-29.json", 6, TOKEN_2022_PROGRAM),
            ("mint_wsol_spl.2026-10-29.json", 9, SPL_TOKEN_PROGRAM),
            ("mint_usdc_spl.2026-10-29.json", 6, SPL_TOKEN_PROGRAM),
            ("mint_usdt_spl.2026-10-29.json", 6, SPL_TOKEN_PROGRAM),
            ("mint_pyusd_2022.2026-10-29.json", 6, TOKEN_2022_PROGRAM),
            (
                "mint_pump_complete_2022.2026-10-29.json",
                6,
                TOKEN_2022_PROGRAM,
            ),
        ] {
            let (_, owner, data) = parse_account_info(&mainnet(f)).expect("parse");
            let m = decode_mint(&owner, &data).expect(f);
            assert_eq!(m.decimals, decimals, "{f}");
            assert_eq!(m.token_program, program, "{f}");
        }
        // a curve account is not a mint
        let (_, owner, data) =
            parse_account_info(&mainnet("curve_sol_quote.2026-10-29.json")).expect("parse");
        assert!(decode_mint(&owner, &data).is_err());
        assert!(decode_mint(SPL_TOKEN_PROGRAM, &[0u8; 40]).is_err());
    }
}
