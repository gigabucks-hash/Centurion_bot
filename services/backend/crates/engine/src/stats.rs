//! Ingest counters per feed + cross-feed de-duplication (primary and fallback can overlap
//! during a failover; a mint's `new_coin` / `migrated` is forwarded once).
use ingest::source::IngestEvent;
use serde::Serialize;
use std::collections::{BTreeMap, HashSet, VecDeque};
use std::sync::Mutex;

#[derive(Debug, Clone, Default, Serialize)]
pub struct FeedCounts {
    pub new_coins: u64,
    pub trades: u64,
    pub migrations: u64,
    pub duplicates: u64,
    pub first_ms: Option<i64>,
    pub last_ms: Option<i64>,
    /// Session (re)starts by the supervisor.
    pub sessions: u64,
}

impl FeedCounts {
    pub fn total(&self) -> u64 {
        self.new_coins + self.trades + self.migrations
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Kind {
    New,
    Migrated,
}

pub struct Dedupe {
    seen: HashSet<(Kind, String)>,
    order: VecDeque<(Kind, String)>,
    cap: usize,
}

impl Dedupe {
    pub fn new(cap: usize) -> Self {
        Self {
            seen: HashSet::new(),
            order: VecDeque::new(),
            cap,
        }
    }
    /// `true` if the event is new (should be forwarded). Trades are never de-duplicated here.
    pub fn admit(&mut self, ev: &IngestEvent) -> bool {
        let key = match ev {
            IngestEvent::NewCoin(c) => (Kind::New, c.mint.as_str().to_string()),
            IngestEvent::Migrated { mint, .. } => (Kind::Migrated, mint.as_str().to_string()),
            IngestEvent::Trade(_) => return true,
        };
        if self.seen.contains(&key) {
            return false;
        }
        if self.order.len() == self.cap {
            if let Some(old) = self.order.pop_front() {
                self.seen.remove(&old);
            }
        }
        self.seen.insert(key.clone());
        self.order.push_back(key);
        true
    }
}

#[derive(Default)]
pub struct IngestStats {
    feeds: Mutex<BTreeMap<String, FeedCounts>>,
}

impl IngestStats {
    fn with<R>(&self, feed: &str, f: impl FnOnce(&mut FeedCounts) -> R) -> R {
        let mut g = match self.feeds.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        f(g.entry(feed.to_string()).or_default())
    }
    pub fn count(&self, feed: &str, ev: &IngestEvent, dup: bool, now_ms: i64) {
        self.with(feed, |c| {
            if dup {
                c.duplicates += 1;
                return;
            }
            match ev {
                IngestEvent::NewCoin(_) => c.new_coins += 1,
                IngestEvent::Trade(_) => c.trades += 1,
                IngestEvent::Migrated { .. } => c.migrations += 1,
            }
            c.first_ms.get_or_insert(now_ms);
            c.last_ms = Some(now_ms);
        })
    }
    pub fn session(&self, feed: &str) {
        self.with(feed, |c| c.sessions += 1)
    }
    pub fn snapshot(&self) -> BTreeMap<String, FeedCounts> {
        match self.feeds.lock() {
            Ok(g) => g.clone(),
            Err(p) => p.into_inner().clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use common::Mint;

    fn mig(m: &str) -> IngestEvent {
        IngestEvent::Migrated {
            mint: Mint::parse(m).unwrap(),
            ts: 0,
        }
    }

    #[test]
    fn dedupe_bounded() {
        let a = "So11111111111111111111111111111111111111112";
        let b = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
        let mut d = Dedupe::new(1);
        assert!(d.admit(&mig(a)));
        assert!(!d.admit(&mig(a)));
        assert!(d.admit(&mig(b))); // evicts a
        assert!(d.admit(&mig(a)));
    }
}
