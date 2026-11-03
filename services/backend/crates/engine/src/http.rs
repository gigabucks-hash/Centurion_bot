//! Localhost status view (loopback only, enforced in config): `/health`, `/stats`,
//! `/decisions`, `/` (HTML), and `POST /admin/kill-feed?feed=<name>&hold_s=<n>` for the
//! watchdog drill. Hand-rolled HTTP/1.1 on tokio (no new crates); one request per connection.
use crate::credits::CreditMeter;
use crate::latency::Latency;
use crate::lead::Decision;
use crate::stats::IngestStats;
use crate::supervisor::Command;
use crate::watchdog::Watchdog;
use serde_json::{json, Value};
use std::collections::{BTreeMap, VecDeque};
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::mpsc;

pub struct AppState {
    pub wd: Arc<Watchdog>,
    pub stats: Arc<IngestStats>,
    pub credits: Arc<CreditMeter>,
    pub scout_latency: Arc<Latency>,
    pub e2e_latency: Arc<Latency>,
    pub decisions: Mutex<VecDeque<Decision>>,
    pub reject_counts: Mutex<BTreeMap<String, u64>>,
    pub strategies: Mutex<Value>,
    pub cmds: mpsc::Sender<Command>,
    pub positions: Mutex<Vec<Value>>,
}

const DECISION_RING: usize = 200;

impl AppState {
    pub fn push_decision(&self, d: Decision) {
        let key = if d.pass {
            "pass".to_string()
        } else {
            d.reasons
                .first()
                .map(|r| r.code.clone())
                .unwrap_or_default()
        };
        if let Ok(mut m) = self.reject_counts.lock() {
            *m.entry(format!("{}:{}", d.strategy_key, key)).or_default() += 1;
        }
        if let Ok(mut q) = self.decisions.lock() {
            if q.len() == DECISION_RING {
                q.pop_front();
            }
            q.push_back(d);
        }
    }

    pub fn health(&self) -> Value {
        let now = crate::now_ms();
        json!({
            "status": self.wd.overall(),
            "trading_mode": "paper",
            "real_locked": true,
            "uptime_s": self.wd.uptime_ms(now) / 1000,
            "stages": self.wd.stages(),
            "alerts_recent": self.wd.alerts().into_iter().rev().take(20).collect::<Vec<_>>(),
        })
    }

    pub fn stats_json(&self) -> Value {
        let now = crate::now_ms();
        let c = self.credits.snapshot(now);
        json!({
            "ingest": self.stats.snapshot(),
            "scout_latency_us": self.scout_latency.summary(),
            "ingest_to_decision_latency_us": self.e2e_latency.summary(),
            "decision_counts": self.reject_counts.lock().map(|m| m.clone()).unwrap_or_default(),
            "credits": { "cap_per_day": self.credits.cap(), "day": c.day, "day_used": c.day_used,
                         "day_cap_hits": c.day_cap_hits, "by_check": c.day_by_check,
                         "month": c.month, "month_used": c.month_used },
            "strategies": self.strategies.lock().map(|v| v.clone()).unwrap_or(Value::Null),
        })
    }
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn html(st: &AppState) -> String {
    let h = st.health();
    let s = st.stats_json();
    let decisions: Vec<Decision> = st
        .decisions
        .lock()
        .map(|q| q.iter().rev().take(50).cloned().collect())
        .unwrap_or_default();
    let mut rows = String::new();
    for d in &decisions {
        use std::fmt::Write as _;
        let _ = write!(
            rows,
            "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
            esc(&d.mint),
            esc(&d.strategy_key),
            if d.pass { "PASS" } else { "reject" },
            esc(&d.stage),
            esc(&d
                .reasons
                .iter()
                .map(|r| r.code.as_str())
                .collect::<Vec<_>>()
                .join(", ")),
            esc(&d.labels.join(", "))
        );
    }
    format!(
        "<!doctype html><meta charset=utf-8><meta http-equiv=refresh content=5><title>Centurion engine (paper)</title>\
<style>body{{font:14px system-ui;margin:20px}}pre{{background:#f4f4f4;padding:8px;overflow:auto}}td,th{{padding:2px 8px;border-bottom:1px solid #ddd;text-align:left}}</style>\
<h1>Centurion engine: PAPER ONLY</h1><p>status <b>{}</b>, uptime {} s, real locked</p>\
<h2>Health</h2><pre>{}</pre><h2>Ingest + credits</h2><pre>{}</pre>\
<h2>Positions</h2><p>{}</p><h2>Recent decisions</h2><table><tr><th>mint</th><th>strategy</th><th>result</th><th>stage</th><th>reasons</th><th>labels</th></tr>{}</table>",
        esc(h["status"].as_str().unwrap_or("?")),
        h["uptime_s"],
        esc(&serde_json::to_string_pretty(&h).unwrap_or_default()),
        esc(&serde_json::to_string_pretty(&s).unwrap_or_default()),
        if st.positions.lock().map(|p| p.is_empty()).unwrap_or(true) { "none (M1: no entries yet)".to_string() } else { "see /positions".to_string() },
        rows
    )
}

fn query(q: &str, key: &str) -> Option<String> {
    q.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == key).then(|| v.to_string())
    })
}

/// Route one request; returns (status, content-type, body).
pub async fn route(st: &AppState, method: &str, target: &str) -> (u16, &'static str, String) {
    let (path, q) = target.split_once('?').unwrap_or((target, ""));
    let j = |v: Value| serde_json::to_string_pretty(&v).unwrap_or_default();
    match (method, path) {
        ("GET", "/health") => {
            let h = st.health();
            let code = if h["status"] == "down" { 503 } else { 200 };
            (code, "application/json", j(h))
        }
        ("GET", "/stats") => (200, "application/json", j(st.stats_json())),
        ("GET", "/decisions") => {
            let d: Vec<Decision> = st
                .decisions
                .lock()
                .map(|q| q.iter().rev().cloned().collect())
                .unwrap_or_default();
            (200, "application/json", j(json!(d)))
        }
        ("GET", "/positions") => (
            200,
            "application/json",
            j(json!(st
                .positions
                .lock()
                .map(|p| p.clone())
                .unwrap_or_default())),
        ),
        ("GET", "/") => (200, "text/html; charset=utf-8", html(st)),
        ("POST", "/admin/kill-feed") => {
            let Some(feed) = query(q, "feed") else {
                return (
                    400,
                    "application/json",
                    j(json!({"error": "feed required"})),
                );
            };
            let hold_s: i64 = query(q, "hold_s")
                .and_then(|v| v.parse().ok())
                .unwrap_or(0)
                .clamp(0, 600);
            let ok = st
                .cmds
                .send(Command::Kill {
                    feed: feed.clone(),
                    hold_ms: hold_s * 1000,
                })
                .await
                .is_ok();
            (
                if ok { 202 } else { 503 },
                "application/json",
                j(json!({"killed": feed, "hold_s": hold_s})),
            )
        }
        _ => (404, "application/json", j(json!({"error": "not found"}))),
    }
}

pub async fn serve(addr: String, st: Arc<AppState>) -> std::io::Result<()> {
    let l = TcpListener::bind(&addr).await?;
    tracing::info!(%addr, "localhost view listening");
    loop {
        let (mut sock, peer) = l.accept().await?;
        if !peer.ip().is_loopback() {
            continue;
        }
        let st = st.clone();
        tokio::spawn(async move {
            let mut buf = vec![0u8; 8192];
            let mut n = 0;
            let read = tokio::time::timeout(std::time::Duration::from_secs(5), async {
                while n < buf.len() {
                    let r = sock.read(&mut buf[n..]).await?;
                    if r == 0 {
                        break;
                    }
                    n += r;
                    if buf[..n].windows(4).any(|w| w == b"\r\n\r\n") {
                        break;
                    }
                }
                Ok::<_, std::io::Error>(())
            })
            .await;
            if !matches!(read, Ok(Ok(()))) {
                return;
            }
            let head = String::from_utf8_lossy(&buf[..n]);
            let mut parts = head.lines().next().unwrap_or("").split_whitespace();
            let (m, t) = (parts.next().unwrap_or(""), parts.next().unwrap_or("/"));
            let (code, ct, body) = route(&st, m, t).await;
            let reason = match code {
                200 => "OK",
                202 => "Accepted",
                400 => "Bad Request",
                404 => "Not Found",
                _ => "Service Unavailable",
            };
            let resp = format!(
                "HTTP/1.1 {code} {reason}\r\ncontent-type: {ct}\r\ncontent-length: {}\r\ncache-control: no-store\r\nx-content-type-options: nosniff\r\nconnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = sock.write_all(resp.as_bytes()).await;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state() -> (AppState, mpsc::Receiver<Command>) {
        let (tx, rx) = mpsc::channel(4);
        let wd = Arc::new(Watchdog::new(None, 0));
        wd.register(
            "feed.pumpportal",
            Some(1000),
            crate::watchdog::StageState::Up,
            crate::now_ms(),
        );
        wd.beat("feed.pumpportal", crate::now_ms());
        (
            AppState {
                wd,
                stats: Default::default(),
                credits: Arc::new(CreditMeter::new(25_000, None)),
                scout_latency: Default::default(),
                e2e_latency: Default::default(),
                decisions: Default::default(),
                reject_counts: Default::default(),
                strategies: Mutex::new(Value::Null),
                cmds: tx,
                positions: Default::default(),
            },
            rx,
        )
    }

    #[tokio::test]
    async fn routes() {
        let (st, mut rx) = state();
        let (c, _, b) = route(&st, "GET", "/health").await;
        assert_eq!(c, 200);
        let v: Value = serde_json::from_str(&b).unwrap();
        assert_eq!(v["status"], "ok");
        assert_eq!(v["trading_mode"], "paper");
        assert_eq!(route(&st, "GET", "/stats").await.0, 200);
        assert_eq!(route(&st, "GET", "/").await.0, 200);
        assert_eq!(route(&st, "GET", "/nope").await.0, 404);
        assert_eq!(route(&st, "POST", "/admin/kill-feed").await.0, 400);
        assert_eq!(
            route(&st, "POST", "/admin/kill-feed?feed=pumpportal&hold_s=3")
                .await
                .0,
            202
        );
        match rx.recv().await {
            Some(Command::Kill { feed, hold_ms }) => {
                assert_eq!((feed.as_str(), hold_ms), ("pumpportal", 3000))
            }
            None => panic!("no command"),
        }
        assert_eq!(esc("<b>"), "&lt;b&gt;");
    }
}
