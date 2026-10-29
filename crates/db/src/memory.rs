use std::collections::{BTreeMap, HashMap};

use async_trait::async_trait;
use common::{CoinKey, CoinSnapshot, Event, Mint};
use tokio::sync::Mutex;

use crate::{DbError, FillRecord, PickRecord, Repo};

#[derive(Default)]
struct Inner {
    coins: HashMap<Mint, CoinSnapshot>,
    picks: HashMap<CoinKey, PickRecord>,
    events: BTreeMap<String, Event>,
    seq: i64,
    fills: Vec<FillRecord>,
}

/// In-memory [`Repo`] for tests and offline replay.
#[derive(Default)]
pub struct MemoryRepo {
    inner: Mutex<Inner>,
}

impl MemoryRepo {
    pub fn new() -> Self {
        Self::default()
    }
    pub async fn event_count(&self) -> usize {
        self.inner.lock().await.events.len()
    }
    pub async fn fills(&self) -> Vec<FillRecord> {
        self.inner.lock().await.fills.clone()
    }
}

#[async_trait]
impl Repo for MemoryRepo {
    async fn upsert_coin(&self, coin: &CoinSnapshot) -> Result<(), DbError> {
        self.inner
            .lock()
            .await
            .coins
            .insert(coin.mint.clone(), coin.clone());
        Ok(())
    }
    async fn upsert_pick(&self, pick: &PickRecord) -> Result<(), DbError> {
        self.inner
            .lock()
            .await
            .picks
            .insert(pick.ck.clone(), pick.clone());
        Ok(())
    }
    async fn get_pick(&self, ck: &CoinKey) -> Result<PickRecord, DbError> {
        self.inner
            .lock()
            .await
            .picks
            .get(ck)
            .cloned()
            .ok_or_else(|| DbError::NotFound(ck.to_string()))
    }
    async fn append_event(&self, ev: &Event) -> Result<bool, DbError> {
        let mut g = self.inner.lock().await;
        if g.events.contains_key(&ev.id) {
            return Ok(false);
        }
        let mut ev = ev.clone();
        g.seq += 1;
        ev.seq = Some(g.seq);
        g.events.insert(ev.id.clone(), ev);
        Ok(true)
    }
    async fn events_for(&self, ck: &CoinKey) -> Result<Vec<Event>, DbError> {
        let g = self.inner.lock().await;
        let mut v: Vec<Event> = g
            .events
            .values()
            .filter(|e| e.ck.as_deref() == Some(ck.0.as_str()))
            .cloned()
            .collect();
        v.sort_by_key(|e| e.seq);
        Ok(v)
    }
    async fn record_fill(&self, fill: &FillRecord) -> Result<(), DbError> {
        if !fill.simulated || fill.tx_sig.is_some() {
            return Err(DbError::Backend(
                "only simulated fills are allowed before Phase 7".into(),
            ));
        }
        self.inner.lock().await.fills.push(fill.clone());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use common::{Actor, EventKind};

    #[tokio::test]
    async fn events_are_append_only_and_idempotent() {
        let r = MemoryRepo::new();
        let ck = CoinKey("k".into());
        let mut e = Event::new(
            "ws",
            &ck.0,
            1,
            EventKind::CoinFound,
            Actor::Ingest,
            serde_json::json!({"a": 1}),
        );
        e.ck = Some(ck.0.clone());
        assert!(r.append_event(&e).await.expect("append"));
        let mut e2 = e.clone();
        e2.data = serde_json::json!({"a": 2});
        assert!(!r.append_event(&e2).await.expect("append dup"));
        let got = r.events_for(&ck).await.expect("events");
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].data, serde_json::json!({"a": 1}));
        assert_eq!(got[0].seq, Some(1));
    }

    #[tokio::test]
    async fn rejects_non_simulated_fills() {
        let r = MemoryRepo::new();
        let f = FillRecord {
            position_key: "k.0".into(),
            workspace_id: "ws".into(),
            side: "buy",
            simulated: false,
            tx_sig: Some("sig".into()),
            sol_lamports: common::Lamports(1),
            token_amount_raw: common::RawAmount(1),
            exec_price_sol: common::Dec::from_f64(1.0, 6).expect("dec"),
            swap_fee_lamports: common::Lamports(0),
            network_fee_lamports: common::Lamports(0),
            slippage_bps: common::Dec::from_f64(0.0, 6).expect("dec"),
            latency_ms: 0,
            ts: 0,
        };
        assert!(r.record_fill(&f).await.is_err());
    }
}
