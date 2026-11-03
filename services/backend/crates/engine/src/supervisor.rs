//! Feed supervisor: runs each [`StreamSource`] in its own task, tags + counts + de-duplicates
//! its events, restarts dead feeds with backoff, and fails over from the primary (PumpPortal)
//! to the fallback (Helius WS) when the primary has been unhealthy for the stall window.
//!
//! Sources already reconnect internally on socket errors; the supervisor covers what they
//! cannot see: a task that died, and a socket that is "open" but silent (stall).
use crate::credits::CreditMeter;
use crate::stats::{Dedupe, IngestStats};
use crate::watchdog::{Level, StageState, Watchdog};
use ingest::source::{IngestEvent, StreamSource};
use std::collections::BTreeMap;
use std::sync::Arc;
use tokio::sync::{mpsc, watch};
use tokio::task::JoinHandle;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Primary,
    Fallback,
}

/// An event plus the feed it came from.
#[derive(Debug, Clone)]
pub struct Tagged {
    pub feed: &'static str,
    pub event: IngestEvent,
    pub recv_ms: i64,
}

#[derive(Debug)]
pub enum Command {
    /// Watchdog drill: abort the feed task (drops its socket). `hold_ms` delays the restart.
    Kill { feed: String, hold_ms: i64 },
}

pub struct FeedSpec {
    pub source: Arc<dyn StreamSource>,
    pub role: Role,
    /// Credits to record per `new_coin` from this feed (its own RPC enrichment), 0 for none.
    pub credits_per_new_coin: u64,
}

struct Running {
    task: JoinHandle<()>,
    stop: watch::Sender<bool>,
}

struct FeedSlot {
    spec: FeedSpec,
    running: Option<Running>,
    restart_at_ms: Option<i64>,
    fails: u32,
    started_ms: i64,
}

pub struct SupervisorConfig {
    pub stall_ms: i64,
    pub fallback_release_ms: i64,
    pub channel_capacity: usize,
}

pub struct Supervisor {
    cfg: SupervisorConfig,
    feeds: BTreeMap<&'static str, FeedSlot>,
    out: mpsc::Sender<Tagged>,
    wd: Arc<Watchdog>,
    stats: Arc<IngestStats>,
    credits: Arc<CreditMeter>,
    dedupe: Arc<std::sync::Mutex<Dedupe>>,
}

pub fn stage_name(feed: &str) -> String {
    format!("feed.{feed}")
}

/// Restart backoff: 1 s, 2 s, 4 s ... capped at 30 s.
pub fn restart_backoff_ms(fails: u32) -> i64 {
    (1000i64 << fails.min(5)).min(30_000)
}

impl Supervisor {
    pub fn new(
        cfg: SupervisorConfig,
        specs: Vec<FeedSpec>,
        out: mpsc::Sender<Tagged>,
        wd: Arc<Watchdog>,
        stats: Arc<IngestStats>,
        credits: Arc<CreditMeter>,
        now_ms: i64,
    ) -> Self {
        let mut feeds = BTreeMap::new();
        for spec in specs {
            let name = spec.source.name();
            // Standby until started; `start` flips it to Up with a fresh stall window.
            wd.register(
                &stage_name(name),
                Some(cfg.stall_ms),
                StageState::Standby,
                now_ms,
            );
            feeds.insert(
                name,
                FeedSlot {
                    spec,
                    running: None,
                    restart_at_ms: None,
                    fails: 0,
                    started_ms: 0,
                },
            );
        }
        Self {
            cfg,
            feeds,
            out,
            wd,
            stats,
            credits,
            dedupe: Arc::new(std::sync::Mutex::new(Dedupe::new(50_000))),
        }
    }

    fn start(&mut self, name: &'static str, now_ms: i64) {
        let Some(slot) = self.feeds.get_mut(name) else {
            return;
        };
        let (stop_tx, stop_rx) = watch::channel(false);
        let (tx, mut rx) = mpsc::channel::<IngestEvent>(self.cfg.channel_capacity);
        let src = slot.spec.source.clone();
        let per_coin = slot.spec.credits_per_new_coin;
        let (out, wd, stats, credits, dedupe) = (
            self.out.clone(),
            self.wd.clone(),
            self.stats.clone(),
            self.credits.clone(),
            self.dedupe.clone(),
        );
        let stage = stage_name(name);
        let task = tokio::spawn(async move {
            let run = src.run(tx, stop_rx);
            let fwd = async {
                while let Some(ev) = rx.recv().await {
                    let now = crate::now_ms();
                    wd.beat(&stage, now);
                    if per_coin > 0 && matches!(ev, IngestEvent::NewCoin(_)) {
                        credits.record(&format!("{name}_enrich"), per_coin, now);
                    }
                    let fresh = match dedupe.lock() {
                        Ok(mut d) => d.admit(&ev),
                        Err(p) => p.into_inner().admit(&ev),
                    };
                    stats.count(name, &ev, !fresh, now);
                    if fresh
                        && out
                            .send(Tagged {
                                feed: name,
                                event: ev,
                                recv_ms: now,
                            })
                            .await
                            .is_err()
                    {
                        return;
                    }
                }
            };
            tokio::select! {
                r = run => if let Err(e) = r { tracing::warn!(feed = name, error = %e, "feed ended") },
                _ = fwd => {}
            }
        });
        slot.running = Some(Running {
            task,
            stop: stop_tx,
        });
        slot.restart_at_ms = None;
        slot.started_ms = now_ms;
        self.stats.session(name);
        // Up with a fresh stall window; Stalled/Down -> Up happens on the first frame (recovery alert).
        if self.wd.state(&stage_name(name)) == Some(StageState::Standby) {
            self.wd.set_state(&stage_name(name), StageState::Up, now_ms);
        }
        tracing::info!(feed = name, "feed started");
    }

    fn stop(&mut self, name: &'static str) {
        if let Some(slot) = self.feeds.get_mut(name) {
            if let Some(r) = slot.running.take() {
                let _ = r.stop.send(true);
                r.task.abort();
            }
        }
    }

    fn primary(&self) -> Option<&'static str> {
        self.feeds
            .iter()
            .find(|(_, s)| s.spec.role == Role::Primary)
            .map(|(n, _)| *n)
    }

    fn fallback(&self) -> Option<&'static str> {
        self.feeds
            .iter()
            .find(|(_, s)| s.spec.role == Role::Fallback)
            .map(|(n, _)| *n)
    }

    pub fn is_running(&self, name: &str) -> bool {
        self.feeds
            .get(name)
            .map(|s| s.running.is_some())
            .unwrap_or(false)
    }

    /// Start the primary feed.
    pub fn boot(&mut self, now_ms: i64) {
        if let Some(p) = self.primary() {
            self.start(p, now_ms);
        }
    }

    pub fn handle(&mut self, cmd: Command, now_ms: i64) {
        match cmd {
            Command::Kill { feed, hold_ms } => {
                let Some(name) = self.feeds.keys().find(|k| **k == feed).copied() else {
                    tracing::warn!(%feed, "kill: unknown feed");
                    return;
                };
                self.stop(name);
                self.wd
                    .set_state(&stage_name(name), StageState::Down, now_ms);
                self.wd.alert(
                    Level::Warn,
                    &stage_name(name),
                    "FEED_DOWN",
                    "killed by watchdog drill (admin)",
                    now_ms,
                );
                if let Some(s) = self.feeds.get_mut(name) {
                    s.restart_at_ms = Some(now_ms + hold_ms.max(0) + restart_backoff_ms(0));
                }
            }
        }
    }

    /// One supervision pass (call every ~1 s).
    pub fn tick(&mut self, now_ms: i64) {
        // 1. dead tasks -> FEED_DOWN + scheduled restart
        let names: Vec<&'static str> = self.feeds.keys().copied().collect();
        for name in &names {
            let slot = self.feeds.get_mut(name).expect("feed exists");
            if slot
                .running
                .as_ref()
                .map(|r| r.task.is_finished())
                .unwrap_or(false)
            {
                slot.running = None;
                slot.fails += 1;
                let wait = restart_backoff_ms(slot.fails - 1);
                slot.restart_at_ms = Some(now_ms + wait);
                self.wd
                    .set_state(&stage_name(name), StageState::Down, now_ms);
                self.wd.note_restart(&stage_name(name));
                self.wd.alert(
                    Level::Warn,
                    &stage_name(name),
                    "FEED_DOWN",
                    &format!("task ended; restart in {wait} ms"),
                    now_ms,
                );
            }
        }
        // 2. stalls -> restart the stalled feed now
        for stage in self.wd.check(now_ms) {
            if let Some(name) = names.iter().find(|n| stage_name(n) == stage).copied() {
                if self.is_running(name) {
                    self.stop(name);
                    self.wd.note_restart(&stage);
                    if let Some(s) = self.feeds.get_mut(name) {
                        s.restart_at_ms = Some(now_ms);
                    }
                }
            }
        }
        // 3. scheduled restarts
        for name in &names {
            let due = self
                .feeds
                .get(name)
                .and_then(|s| s.restart_at_ms)
                .map(|t| t <= now_ms)
                .unwrap_or(false);
            if due && !self.is_running(name) {
                self.start(name, now_ms);
            }
        }
        // reset failure counters once a feed delivers again
        for name in &names {
            let up = self.wd.state(&stage_name(name)) == Some(StageState::Up);
            if let Some(s) = self.feeds.get_mut(name) {
                if up && s.running.is_some() {
                    s.fails = 0;
                }
            }
        }
        // 4. failover
        let (Some(p), Some(f)) = (self.primary(), self.fallback()) else {
            return;
        };
        let pstage = self.wd.stages().get(&stage_name(p)).cloned();
        let Some(ps) = pstage else { return };
        let primary_bad_for = if ps.state == StageState::Up {
            0
        } else {
            now_ms - ps.since_ms
        };
        let primary_good_for = if ps.state == StageState::Up && ps.last_beat_ms.is_some() {
            now_ms - ps.since_ms
        } else {
            0
        };
        if !self.is_running(f) && primary_bad_for >= self.cfg.stall_ms {
            self.wd
                .set_state(&stage_name(f), StageState::Standby, now_ms);
            self.start(f, now_ms);
            self.wd.alert(
                Level::Warn,
                &stage_name(f),
                "FAILOVER_ON",
                &format!("{p} unhealthy for {primary_bad_for} ms; {f} started"),
                now_ms,
            );
        } else if self.is_running(f) && primary_good_for >= self.cfg.fallback_release_ms {
            self.stop(f);
            self.wd
                .set_state(&stage_name(f), StageState::Standby, now_ms);
            self.wd.alert(
                Level::Info,
                &stage_name(f),
                "FAILOVER_OFF",
                &format!("{p} healthy again; {f} back on standby"),
                now_ms,
            );
        }
    }

    /// Drive the supervisor until `shutdown`.
    pub async fn run(
        mut self,
        mut cmds: mpsc::Receiver<Command>,
        mut shutdown: watch::Receiver<bool>,
    ) {
        self.boot(crate::now_ms());
        let mut tick = tokio::time::interval(std::time::Duration::from_millis(1000));
        loop {
            tokio::select! {
                _ = tick.tick() => self.tick(crate::now_ms()),
                Some(c) = cmds.recv() => self.handle(c, crate::now_ms()),
                _ = shutdown.changed() => if *shutdown.borrow() { break },
            }
        }
        let names: Vec<&'static str> = self.feeds.keys().copied().collect();
        for n in names {
            self.stop(n);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use common::Mint;
    use ingest::source::SourceError;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

    /// Emits a migration every 20 ms while `alive`; counts sessions.
    struct Fake {
        name: &'static str,
        alive: Arc<AtomicBool>,
        sessions: Arc<AtomicU64>,
        n: AtomicU64,
    }

    #[async_trait]
    impl StreamSource for Fake {
        fn name(&self) -> &'static str {
            self.name
        }
        async fn run(
            &self,
            tx: mpsc::Sender<IngestEvent>,
            mut sd: watch::Receiver<bool>,
        ) -> Result<(), SourceError> {
            self.sessions.fetch_add(1, Ordering::SeqCst);
            let mints = [
                "So11111111111111111111111111111111111111112",
                "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            ];
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(std::time::Duration::from_millis(20)) => {}
                    _ = sd.changed() => return Ok(()),
                }
                if !self.alive.load(Ordering::SeqCst) {
                    continue; // silent socket: stall
                }
                let i = self.n.fetch_add(1, Ordering::SeqCst) as usize;
                let ev = IngestEvent::Trade(ingest::source::TradeTick {
                    mint: Mint::parse(mints[i % 2]).expect("mint"),
                    side: papersim::Side::Buy,
                    sol: 1.0,
                    tokens: 1.0,
                    trader: "t".into(),
                    ts: 0,
                    pool: None,
                });
                if tx.send(ev).await.is_err() {
                    return Err(SourceError::ChannelClosed);
                }
            }
        }
    }

    fn fake(name: &'static str) -> (Arc<Fake>, Arc<AtomicBool>, Arc<AtomicU64>) {
        let alive = Arc::new(AtomicBool::new(true));
        let sessions = Arc::new(AtomicU64::new(0));
        (
            Arc::new(Fake {
                name,
                alive: alive.clone(),
                sessions: sessions.clone(),
                n: AtomicU64::new(0),
            }),
            alive,
            sessions,
        )
    }

    async fn settle(ms: u64) {
        tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
    }

    fn sup(
        p: Arc<Fake>,
        f: Arc<Fake>,
        stall_ms: i64,
    ) -> (
        Supervisor,
        Arc<Watchdog>,
        Arc<IngestStats>,
        mpsc::Receiver<Tagged>,
    ) {
        let wd = Arc::new(Watchdog::new(None, crate::now_ms()));
        let stats = Arc::new(IngestStats::default());
        let credits = Arc::new(CreditMeter::new(100, None));
        let (tx, rx) = mpsc::channel(10_000);
        let s = Supervisor::new(
            SupervisorConfig {
                stall_ms,
                fallback_release_ms: 300,
                channel_capacity: 64,
            },
            vec![
                FeedSpec {
                    source: p,
                    role: Role::Primary,
                    credits_per_new_coin: 0,
                },
                FeedSpec {
                    source: f,
                    role: Role::Fallback,
                    credits_per_new_coin: 1,
                },
            ],
            tx,
            wd.clone(),
            stats.clone(),
            credits,
            crate::now_ms(),
        );
        (s, wd, stats, rx)
    }

    fn codes(wd: &Watchdog) -> Vec<String> {
        wd.alerts()
            .into_iter()
            .map(|a| format!("{}:{}", a.stage, a.code))
            .collect()
    }

    #[tokio::test]
    async fn kill_feed_reconnects_and_alerts() {
        let (p, _pa, psess) = fake("pp");
        let (f, _fa, _) = fake("hl");
        let (mut s, wd, stats, mut rx) = sup(p, f, 10_000);
        s.boot(crate::now_ms());
        settle(120).await;
        assert!(rx.try_recv().is_ok(), "events forwarded");
        assert_eq!(psess.load(Ordering::SeqCst), 1);
        s.handle(
            Command::Kill {
                feed: "pp".into(),
                hold_ms: 0,
            },
            crate::now_ms(),
        );
        assert!(!s.is_running("pp"));
        // restart is due after the first backoff (1 s)
        s.tick(crate::now_ms() + 1_100);
        assert!(s.is_running("pp"));
        settle(120).await;
        s.tick(crate::now_ms());
        assert_eq!(
            psess.load(Ordering::SeqCst),
            2,
            "new session after the kill"
        );
        assert_eq!(wd.state("feed.pp"), Some(StageState::Up));
        assert_eq!(
            codes(&wd),
            vec!["feed.pp:FEED_DOWN", "feed.pp:FEED_RECONNECTED"]
        );
        assert_eq!(stats.snapshot()["pp"].sessions, 2);
        assert!(!s.is_running("hl"), "no failover for a quick reconnect");
    }

    #[tokio::test]
    async fn stall_fails_over_then_releases() {
        let (p, palive, psess) = fake("pp");
        let (f, _fa, fsess) = fake("hl");
        let (mut s, wd, stats, _rx) = sup(p, f, 200);
        s.boot(crate::now_ms());
        settle(100).await;
        palive.store(false, Ordering::SeqCst); // silent socket
        settle(300).await;
        s.tick(crate::now_ms()); // stalled -> restart primary (still silent)
        assert_eq!(wd.state("feed.pp"), Some(StageState::Stalled));
        settle(250).await;
        s.tick(crate::now_ms()); // unhealthy >= stall window -> fallback on
        assert!(s.is_running("hl"));
        assert!(psess.load(Ordering::SeqCst) >= 2);
        settle(150).await;
        assert!(fsess.load(Ordering::SeqCst) == 1);
        assert!(stats.snapshot()["hl"].trades > 0, "fallback delivers");
        palive.store(true, Ordering::SeqCst); // primary recovers
        settle(100).await;
        s.tick(crate::now_ms());
        assert!(s.is_running("hl"), "release only after the release window");
        settle(350).await;
        s.tick(crate::now_ms());
        assert!(!s.is_running("hl"));
        assert_eq!(wd.state("feed.hl"), Some(StageState::Standby));
        let c = codes(&wd);
        for want in [
            "feed.pp:FEED_STALLED",
            "feed.hl:FAILOVER_ON",
            "feed.pp:FEED_RECONNECTED",
            "feed.hl:FAILOVER_OFF",
        ] {
            assert!(c.iter().any(|x| x == want), "missing {want} in {c:?}");
        }
    }

    #[test]
    fn backoff_caps() {
        assert_eq!(restart_backoff_ms(0), 1000);
        assert_eq!(restart_backoff_ms(3), 8000);
        assert_eq!(restart_backoff_ms(10), 30_000);
    }
}
