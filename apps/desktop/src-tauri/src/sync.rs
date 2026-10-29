//! Stream sync loop: transport → reducer → UI. Implements the contract's resume rules
//! (EVENTS_SCHEMA.md §3): persist a **watermark** only from SSE ids / page `next_after_seq` /
//! `clock.safe_seq`; dedupe by `id`; on a **seq gap** (seq is monotonic but not gapless, and the
//! live feed may drop messages) or on a clock heartbeat ahead of the watermark, catch up with
//! `GET /events?after_seq=<watermark>` pages; on disconnect, re-subscribe from the watermark.

use crate::backend::{ActiveTransport, Inbound, Transport};
use crate::events::{dispatch, Out};
use crate::state::{AppState, Engine};
use crate::view::Tone;
use crate::model::Actor;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Runtime};

const PAGE_LIMIT: u32 = 500;
const MIN_CATCHUP_GAP: Duration = Duration::from_millis(500);

/// Pure resync bookkeeping (unit-tested without Tauri).
#[derive(Debug, Default)]
pub struct Cursor {
    pub watermark: i64,
    pub gap_pending: bool,
}

impl Cursor {
    /// Live event arrived. Returns true if a catch-up should run before trusting the watermark.
    pub fn on_live(&mut self, seq: i64) -> bool {
        if seq <= self.watermark {
            return false; // replay/duplicate; reducer dedupes by id
        }
        if seq > self.watermark + 1 || self.gap_pending {
            // Possible missed delivery (or a rollback hole): do not advance; fetch the range.
            self.gap_pending = true;
            return true;
        }
        self.watermark = seq;
        false
    }
    pub fn on_page(&mut self, next_after_seq: Option<i64>, has_more: bool) {
        if let Some(n) = next_after_seq {
            self.watermark = self.watermark.max(n);
        }
        if !has_more {
            self.gap_pending = false;
        }
    }
    pub fn on_clock(&mut self, safe_seq: i64) -> bool {
        safe_seq > self.watermark
    }
}

fn with_engine<R: Runtime, T>(app: &AppHandle<R>, f: impl FnOnce(&mut Engine) -> T) -> T {
    let st = app.state::<AppState>();
    let mut e = st.engine.lock().unwrap();
    f(&mut e)
}

/// Load / refetch REST state: workspace rev, strategies (names + rev), portfolio.
pub async fn refresh<R: Runtime>(app: &AppHandle<R>, t: &ActiveTransport, strategies: bool, portfolio: bool) {
    let mut outs = Vec::new();
    if portfolio {
        match (t.get_workspace().await, t.get_portfolio().await) {
            (Ok(w), Ok(p)) => outs.push(with_engine(app, |e| {
                e.observe_server_now(&p.server_now);
                e.refetch_portfolio = false;
                e.account.workspace_rev = Some(w.data.rev);
                e.set_portfolio(&p.data)
            })),
            (a, b) => log::warn!("portfolio refetch failed: {:?} {:?}", a.err(), b.err()),
        }
    }
    if strategies {
        match t.list_strategies().await {
            Ok(list) => outs.push(with_engine(app, |e| {
                e.observe_server_now(&list.server_now);
                e.refetch_strategies = false;
                e.set_strategies(&list.data)
            })),
            Err(err) => log::warn!("strategies: {err}"),
        }
    }
    dispatch(app, outs);
}

/// After applying events: run the refetches the reducer asked for.
async fn follow_up<R: Runtime>(app: &AppHandle<R>, t: &ActiveTransport) {
    let (s, p) = with_engine(app, |e| (e.refetch_strategies, e.refetch_portfolio));
    if s || p {
        refresh(app, t, s, p).await;
    }
}

async fn catch_up<R: Runtime>(app: &AppHandle<R>, t: &ActiveTransport, cur: &mut Cursor) {
    let mut guard = 0;
    loop {
        let page = match t.list_events(cur.watermark, PAGE_LIMIT).await {
            Ok(p) => p,
            Err(e) => {
                log::warn!("catch-up failed: {e}");
                return;
            }
        };
        let outs = with_engine(app, |e| {
            e.observe_server_now(&page.server_now);
            let before = e.sync.duplicates;
            let mut outs = Vec::new();
            for env in &page.items {
                outs.extend(e.apply_event(env));
            }
            let applied = page.items.len() as u64 - (e.sync.duplicates - before);
            e.sync.recovered += applied;
            e.sync.resyncs += 1;
            outs
        });
        cur.on_page(page.next_after_seq, page.has_more);
        dispatch(app, outs);
        guard += 1;
        if !page.has_more || guard > 50 {
            break;
        }
    }
    let s = with_engine(app, |e| {
        e.sync.watermark = cur.watermark;
        e.sync.clone()
    });
    dispatch(app, vec![Out::Sync(s)]);
}

pub fn spawn<R: Runtime>(app: AppHandle<R>, t: Arc<ActiveTransport>) {
    tauri::async_runtime::spawn(async move {
        refresh(&app, &t, true, true).await;
        let mut cur = Cursor::default();
        let mut backoff = Duration::from_millis(500);
        loop {
            let mut rx = match t.subscribe(cur.watermark).await {
                Ok(rx) => rx,
                Err(err) => {
                    log::warn!("subscribe failed: {err}");
                    tokio::time::sleep(backoff).await;
                    backoff = (backoff * 2).min(Duration::from_secs(30));
                    continue;
                }
            };
            backoff = Duration::from_millis(500);
            let o = with_engine(&app, |e| {
                e.connected = true;
                e.note(Actor::System, Tone::Info, format!("Terhubung ke backend ({}) · resume dari seq {}", t.label(), cur.watermark))
            });
            dispatch(&app, vec![Out::Connection(true), o]);
            let mut last_catchup = Instant::now() - MIN_CATCHUP_GAP;
            while let Some(msg) = rx.recv().await {
                match msg {
                    Inbound::Event(env) => {
                        let need = cur.on_live(env.seq);
                        let outs = with_engine(&app, |e| {
                            if need {
                                e.sync.gaps_seen += 1;
                            }
                            e.apply_event(&env)
                        });
                        dispatch(&app, outs);
                        if need && last_catchup.elapsed() >= MIN_CATCHUP_GAP {
                            last_catchup = Instant::now();
                            catch_up(&app, &t, &mut cur).await;
                        }
                        follow_up(&app, &t).await;
                        if with_engine(&app, |e| e.account.deleted) {
                            log::warn!("account.deleted: stopping the stream");
                            return; // terminal: no reconnect for a deleted account
                        }
                    }
                    Inbound::Mark(m) => {
                        let outs = with_engine(&app, |e| e.apply_mark(&m));
                        dispatch(&app, outs);
                    }
                    Inbound::Clock(c) => {
                        with_engine(&app, |e| e.observe_server_now(&c.server_now));
                        if cur.on_clock(c.safe_seq) || cur.gap_pending {
                            last_catchup = Instant::now();
                            catch_up(&app, &t, &mut cur).await;
                            follow_up(&app, &t).await;
                        } else {
                            let s = with_engine(&app, |e| {
                                e.sync.watermark = cur.watermark;
                                e.sync.clone()
                            });
                            dispatch(&app, vec![Out::Sync(s)]);
                        }
                    }
                    Inbound::Disconnected => break,
                }
            }
            let o = with_engine(&app, |e| {
                e.connected = false;
                e.sync.reconnects += 1;
                e.note(Actor::System, Tone::Bad, "Stream terputus — menyambung ulang")
            });
            dispatch(&app, vec![Out::Connection(false), o]);
            tokio::time::sleep(backoff).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cursor_holds_watermark_on_gap_until_page() {
        let mut c = Cursor { watermark: 100, gap_pending: false };
        assert!(!c.on_live(101));
        assert_eq!(c.watermark, 101);
        assert!(c.on_live(104), "gap → catch up");
        assert_eq!(c.watermark, 101, "watermark not advanced past a gap");
        assert!(c.on_live(105), "still pending until a page closes the gap");
        c.on_page(Some(105), false);
        assert_eq!(c.watermark, 105);
        assert!(!c.on_live(106));
        assert!(!c.on_live(90), "old seq ignored (dedupe by id)");
        assert!(c.on_clock(110) && !c.on_clock(106));
    }

    #[tokio::test]
    async fn lossy_live_feed_is_fully_recovered_by_pages() {
        // Mock server with drops + seq holes; apply only what arrives live, then catch up.
        let t = crate::backend::mock::MockTransport::new(1_500);
        let mut rx = t.subscribe(0).await.unwrap();
        t.test_generate(60);
        let mut e = Engine::new(t.workspace_id());
        let mut cur = Cursor::default();
        let mut gaps = 0;
        while let Ok(msg) = rx.try_recv() {
            if let Inbound::Event(env) = msg {
                if cur.on_live(env.seq) {
                    gaps += 1;
                }
                e.apply_event(&env);
            }
        }
        loop {
            let p = t.list_events(cur.watermark, 50).await.unwrap();
            for env in &p.items {
                e.apply_event(env);
            }
            cur.on_page(p.next_after_seq, p.has_more);
            if !p.has_more {
                break;
            }
        }
        let total = t.list_events(0, 500).await.unwrap();
        assert!(gaps > 0, "test must exercise gaps");
        assert_eq!(cur.watermark, total.items.last().unwrap().seq);
        assert_eq!(e.snapshot().signals.len(), total.items.iter().filter(|x| x.kind == "proposal.created").count());
        assert!(e.sync.skew_ms > 1_000, "skew measured from server_now");
    }
}
