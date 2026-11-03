//! Real-transport smoke test against `services/backend/api` (contracts 1.1.3). `#[ignore]`: run by
//! `apps/desktop/scripts/smoke-real.sh`, which creates a throwaway database, seeds it, starts the API
//! with `TRADING_MODE=paper` and a dev JWT secret from `.env.local`, and exports:
//! `CENTURION_BACKEND`, `CENTURION_WORKSPACE_ID`, `CENTURION_BACKEND_TOKEN`, `SMOKE_DB` (+ PGHOST/PGPORT/PGUSER).
//! Every case prints `PASS|FAIL <case>: …`; contract deviations print `MISMATCH <endpoint>: expected … got …`.
use super::http::{etag_rev, HttpTransport};
use super::{ApiFailure, Inbound, Transport};
use crate::model::*;
use reqwest::Method;
use serde_json::{json, Value};
use std::time::Duration;

// Seed ids (services/backend/api/test/seed.sql + apps/desktop/scripts/dev-seed/desktop_seed.sql).
const APPROVAL_APPROVE: &str = "30000000-0000-0000-0000-0000000000a1";
const APPROVAL_SKIP: &str = "30000000-0000-0000-0000-0000000000a2";
const APPROVAL_ERRORS: &str = "30000000-0000-0000-0000-0000000000d1";
const POSITION: &str = "60000000-0000-0000-0000-0000000000a1";
const STRATEGY: &str = "20000000-0000-0000-0000-0000000000a1";
const MINT: &str = "Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump";

#[derive(Default)]
struct Report {
    fails: Vec<String>,
    mismatches: Vec<String>,
}
impl Report {
    fn check(&mut self, case: &str, ok: bool, detail: impl std::fmt::Display) {
        println!("{} {case}: {detail}", if ok { "PASS" } else { "FAIL" });
        if !ok {
            self.fails.push(case.to_owned());
        }
    }
    fn mismatch(&mut self, endpoint: &str, expected: &str, got: impl std::fmt::Display) {
        let l = format!("{endpoint}: expected {expected}; got {got}");
        println!("MISMATCH {l}");
        self.mismatches.push(l);
    }
}

fn key(tag: &str) -> String {
    format!("smoke-{tag}-{}", crate::util::now_ms())
}

fn code(e: &ApiFailure) -> String {
    e.code().to_owned()
}

async fn rev_of(t: &HttpTransport, path: &str) -> (u64, Value) {
    let (_, h, v) = t.raw(Method::GET, path, None, &[]).await.expect(path);
    let rev = v["data"]["rev"].as_u64().unwrap_or(0);
    if etag_rev(&h) != Some(rev) {
        println!(
            "MISMATCH GET {path}: expected ETag \"{rev}\"; got {:?}",
            h.get("etag")
        );
    }
    (rev, v)
}

async fn drain(rx: &mut tokio::sync::mpsc::Receiver<Inbound>, ms: u64) -> Vec<Inbound> {
    let mut out = Vec::new();
    let deadline = tokio::time::Instant::now() + Duration::from_millis(ms);
    while let Ok(Some(m)) = tokio::time::timeout_at(deadline, rx.recv()).await {
        let stop = matches!(m, Inbound::Disconnected);
        out.push(m);
        if stop {
            break;
        }
    }
    out
}

fn seqs(v: &[Inbound]) -> Vec<i64> {
    v.iter()
        .filter_map(|m| {
            if let Inbound::Event(e) = m {
                Some(e.seq)
            } else {
                None
            }
        })
        .collect()
}

fn psql(sql: &str) -> bool {
    let db = std::env::var("SMOKE_DB").unwrap_or_default();
    std::process::Command::new("psql")
        .args(["-q", "-X", "-v", "ON_ERROR_STOP=1", "-d", &db, "-c", sql])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "needs a running Centurion API: apps/desktop/scripts/smoke-real.sh"]
async fn smoke_real_transport() {
    let t = HttpTransport::from_env()
        .expect("CENTURION_BACKEND / CENTURION_WORKSPACE_ID / CENTURION_BACKEND_TOKEN");
    let ws = t.workspace_id().to_owned();
    let p = |r: &str| super::ws_path(&ws, r);
    let mut r = Report::default();
    println!();

    // ---- 0. health + reads (shape decode against the desktop mirror) ---------------------------
    let (_, h, v) = t
        .raw(Method::GET, "/healthz", None, &[])
        .await
        .expect("healthz");
    let sv = v["contracts_version"].as_str().unwrap_or("").to_owned();
    let minor_ok = sv
        .strip_prefix("1.1.")
        .and_then(|p| p.parse::<u32>().ok())
        .is_some_and(|p| p >= 3);
    r.check(
        "healthz",
        minor_ok && v["mode"] == "practice" && v["real_enabled"] == false,
        format!("contracts_version={sv} mode={}", v["mode"]),
    );
    if sv != CONTRACTS_VERSION {
        println!("NOTE server contracts_version {sv} != desktop mirror {CONTRACTS_VERSION} (additive 1.1.x; unknown fields are ignored)");
    }
    if h.get("x-server-now").is_none() {
        r.mismatch("GET /healthz", "X-Server-Now header", "absent");
    }
    match t.get_workspace().await {
        Ok(w) => r.check(
            "read workspace",
            w.data.id == ws,
            format!("rev={} epoch={:?}", w.data.rev, w.data.practice_epoch),
        ),
        Err(e) => r.check("read workspace", false, e),
    }
    match t.get_portfolio().await {
        Ok(pf) => r.check(
            "read portfolio",
            true,
            format!(
                "cash={} equity={}",
                pf.data.cash_lamports.0, pf.data.equity_lamports.0
            ),
        ),
        Err(e) => r.check("read portfolio", false, e),
    }
    match t.list_strategies().await {
        Ok(s) => r.check(
            "read strategies",
            s.data.iter().any(|x| x.id == STRATEGY),
            format!("{} strategies", s.data.len()),
        ),
        Err(e) => r.check("read strategies", false, e),
    }
    match t.exit_reason_stats("24h").await {
        Ok(s) => r.check(
            "read exit-reasons",
            !s.data.is_empty(),
            format!("{} rows", s.data.len()),
        ),
        Err(e) => r.check("read exit-reasons", false, e),
    }
    match t.coin_timeline(MINT).await {
        Ok(c) => r.check(
            "read coin timeline",
            true,
            format!("{} events", c.items.len()),
        ),
        Err(e) => r.check("read coin timeline", false, e),
    }
    let (_, _, page) = t
        .raw(
            Method::GET,
            &p("/events?mode=practice&after_seq=0&limit=2"),
            None,
            &[],
        )
        .await
        .expect("events");
    for k in ["items", "next_after_seq", "safe_seq", "server_now"] {
        if page.get(k).is_none() {
            r.mismatch("GET /events", k, "absent");
        }
    }
    if !page["next_after_seq"].is_string() || !page["safe_seq"].is_string() {
        r.mismatch(
            "GET /events",
            "next_after_seq/safe_seq int64 strings",
            format!("{} / {}", page["next_after_seq"], page["safe_seq"]),
        );
    }
    let start = match t.list_events(0, 500).await {
        Ok(pg) => {
            r.check(
                "read events page",
                pg.items.iter().all(|e| e.seq > 0),
                format!("{} events, safe_seq={}", pg.items.len(), pg.safe_seq),
            );
            pg.items.last().map(|e| e.seq).unwrap_or(0)
        }
        Err(e) => {
            r.check("read events page", false, e);
            0
        }
    };

    // ---- 1. approve (If-Match + expected_rev + Idempotency-Key; replay; key reuse) --------------
    let a = t
        .get_approval(APPROVAL_APPROVE)
        .await
        .expect("approval detail")
        .data;
    let tok = a.decision_token.clone().unwrap_or_default();
    r.check(
        "approval detail token",
        !tok.is_empty() && a.status == ProposalStatus::Pending,
        format!(
            "rev={} token={}",
            a.version,
            if tok.is_empty() { "none" } else { "issued" }
        ),
    );
    let k1 = key("approve");
    let req = ApprovalDecisionRequest {
        decision: Decision::Approve,
        token: tok.clone(),
        expected_rev: a.version,
        reason: None,
        reject_reason: None,
    };
    match t.decide(APPROVAL_APPROVE, &k1, req.clone()).await {
        Ok(d) => r.check(
            "approve",
            d.data.status == ProposalStatus::Approved
                && d.data.version == a.version + 1
                && d.data.reject_reason.is_none()
                && !d.data.replayed,
            format!(
                "status={:?} rev={} reject_reason={:?}",
                d.data.status, d.data.version, d.data.reject_reason
            ),
        ),
        Err(e) => r.check("approve", false, e),
    }
    match t.decide(APPROVAL_APPROVE, &k1, req.clone()).await {
        Ok(d) => r.check(
            "approve replay (same key + body)",
            d.data.replayed,
            format!("replayed={}", d.data.replayed),
        ),
        Err(e) => r.check("approve replay (same key + body)", false, e),
    }
    let other = ApprovalDecisionRequest {
        decision: Decision::Reject,
        reject_reason: Some(ApprovalRejectReason::Other),
        ..req.clone()
    };
    match t.decide(APPROVAL_APPROVE, &k1, other).await {
        Err(e) => r.check(
            "same key + different body → 422",
            code(&e) == "IDEMPOTENCY_KEY_REUSED",
            e,
        ),
        Ok(_) => r.check("same key + different body → 422", false, "accepted"),
    }

    // ---- 2. skip with reject_reason=not_tradeable (and validation) ------------------------------
    let e = t
        .get_approval(APPROVAL_ERRORS)
        .await
        .expect("approval d1")
        .data;
    let etok = e.decision_token.clone().unwrap_or_default();
    let bad = ApprovalDecisionRequest {
        decision: Decision::Approve,
        token: etok.clone(),
        expected_rev: e.version,
        reason: None,
        reject_reason: Some(ApprovalRejectReason::NotTradeable),
    };
    match t.decide(APPROVAL_ERRORS, &key("aprr"), bad).await {
        Err(x) => r.check(
            "approve + reject_reason → 422",
            code(&x) == "VALIDATION_FAILED",
            &x,
        ),
        Ok(_) => r.check("approve + reject_reason → 422", false, "accepted"),
    }
    let raw = json!({"decision": "reject", "token": etok, "expected_rev": e.version, "reject_reason": "bored"});
    match t
        .raw(
            Method::POST,
            &p(&format!("/approvals/{APPROVAL_ERRORS}/decision")),
            Some(&raw),
            &[("Idempotency-Key", key("rrbad"))],
        )
        .await
    {
        Err(x) => r.check(
            "unknown reject_reason → 422",
            code(&x) == "VALIDATION_FAILED",
            &x,
        ),
        Ok(_) => r.check("unknown reject_reason → 422", false, "accepted"),
    }
    let s = t
        .get_approval(APPROVAL_SKIP)
        .await
        .expect("approval a2")
        .data;
    let skip = ApprovalDecisionRequest {
        decision: Decision::Reject,
        token: s.decision_token.clone().unwrap_or_default(),
        expected_rev: s.version,
        reason: None,
        reject_reason: Some(crate::commands::skip_reason(false)),
    };
    match t.decide(APPROVAL_SKIP, &key("skip"), skip).await {
        Ok(d) => r.check(
            "skip (reject_reason=not_tradeable)",
            d.data.status == ProposalStatus::Rejected
                && d.data.reject_reason == Some(ApprovalRejectReason::NotTradeable),
            format!(
                "status={:?} reject_reason={:?}",
                d.data.status, d.data.reject_reason
            ),
        ),
        Err(x) => r.check("skip (reject_reason=not_tradeable)", false, x),
    }
    let (_, _, ad) = t
        .raw(
            Method::GET,
            &p(&format!("/approvals/{APPROVAL_SKIP}")),
            None,
            &[],
        )
        .await
        .expect("approval a2 after");
    if ad["data"]["reject_reason"] != "not_tradeable" {
        r.mismatch(
            "GET /approvals/{id}",
            "ApprovalWire.reject_reason=not_tradeable after skip",
            &ad["data"]["reject_reason"],
        );
    }

    // ---- 3. 428 missing precondition + 409 conflict (current required) --------------------------
    match t.close(POSITION, &key("c428"), None, 5_000).await {
        Err(x) => r.check(
            "close without If-Match → 428",
            x == ApiFailure::PreconditionRequired,
            &x,
        ),
        Ok(_) => r.check("close without If-Match → 428", false, "accepted"),
    }
    let raw = json!({"decision": "reject", "token": e.decision_token.clone().unwrap_or_default()});
    match t
        .raw(
            Method::POST,
            &p(&format!("/approvals/{APPROVAL_ERRORS}/decision")),
            Some(&raw),
            &[("Idempotency-Key", key("d428"))],
        )
        .await
    {
        Err(x) => r.check(
            "decide without rev → 428",
            x == ApiFailure::PreconditionRequired,
            &x,
        ),
        Ok(_) => r.check("decide without rev → 428", false, "accepted"),
    }
    match t
        .raw(
            Method::POST,
            &p(&format!("/positions/{POSITION}/close")),
            Some(&json!({"fraction_bps": 5000, "expected_rev": 1})),
            &[],
        )
        .await
    {
        Err(x) => r.check(
            "close without Idempotency-Key → rejected",
            matches!(
                code(&x).as_str(),
                "PRECONDITION_REQUIRED" | "VALIDATION_FAILED" | "IDEMPOTENCY_KEY_REQUIRED"
            ),
            format!("{} ({x})", code(&x)),
        ),
        Ok(_) => r.check(
            "close without Idempotency-Key → rejected",
            false,
            "accepted",
        ),
    }
    let (prev, _) = rev_of(&t, &p(&format!("/positions/{POSITION}"))).await;
    match t
        .close(POSITION, &key("c409"), Some(prev + 50), 5_000)
        .await
    {
        Err(x) => {
            let c = x.conflict();
            r.check(
                "close stale rev → 409 with current",
                c.is_some_and(|c| c.current.is_some() && c.current_rev == Some(prev)),
                format!(
                    "{} current_rev={:?} current={}",
                    code(&x),
                    c.and_then(|c| c.current_rev),
                    c.is_some_and(|c| c.current.is_some())
                ),
            );
        }
        Ok(_) => r.check("close stale rev → 409 with current", false, "accepted"),
    }
    let stale = ApprovalDecisionRequest {
        decision: Decision::Reject,
        token: e.decision_token.clone().unwrap_or_default(),
        expected_rev: e.version + 7,
        reason: None,
        reject_reason: Some(ApprovalRejectReason::UserDeclined),
    };
    match t.decide(APPROVAL_ERRORS, &key("d409"), stale).await {
        Err(x) => r.check(
            "decide stale rev → 409 VERSION_CONFLICT with current",
            x.conflict().is_some_and(|c| c.current.is_some()) && code(&x) == "VERSION_CONFLICT",
            &x,
        ),
        Ok(_) => r.check(
            "decide stale rev → 409 VERSION_CONFLICT with current",
            false,
            "accepted",
        ),
    }
    let srev = t
        .list_strategies()
        .await
        .ok()
        .and_then(|s| s.data.into_iter().find(|x| x.id == STRATEGY))
        .map(|s| s.rev)
        .unwrap_or(1);
    match t
        .set_strategy_paused(STRATEGY, &key("p409"), Some(srev + 9), true)
        .await
    {
        Err(x) => r.check(
            "pause stale rev → 409 STRATEGY_REV_CONFLICT with current",
            code(&x) == "STRATEGY_REV_CONFLICT"
                && x.conflict().is_some_and(|c| c.current.is_some()),
            &x,
        ),
        Ok(_) => r.check(
            "pause stale rev → 409 STRATEGY_REV_CONFLICT with current",
            false,
            "accepted",
        ),
    }
    match t
        .set_strategy_paused(STRATEGY, &key("p428"), None, true)
        .await
    {
        Err(x) => r.check(
            "pause without rev → 428",
            x == ApiFailure::PreconditionRequired,
            &x,
        ),
        Ok(_) => r.check("pause without rev → 428", false, "accepted"),
    }
    match t
        .set_strategy_paused(STRATEGY, &key("pause"), Some(srev), true)
        .await
    {
        Ok(s) => r.check(
            "pause with rev",
            s.data.rev == srev + 1 && s.data.status.as_deref() == Some("paused"),
            format!("rev {srev}→{} status={:?}", s.data.rev, s.data.status),
        ),
        Err(x) => r.check("pause with rev", false, x),
    }

    // ---- 4. SSE: live from start, then resume with Last-Event-ID ---------------------------------
    let mut rx = t.open_stream(start, Some(start)).await.expect("sse open");
    let first = drain(&mut rx, 1_500).await;
    let s1 = seqs(&first);
    let ordered = s1.windows(2).all(|w| w[0] < w[1]);
    r.check(
        "sse catch-up after Last-Event-ID",
        !s1.is_empty() && s1.iter().all(|s| *s > start) && ordered,
        format!(
            "{} events after seq {start} (approve/skip/pause), ordered={ordered}",
            s1.len()
        ),
    );
    // mark via pg_notify (display-only; never persisted)
    let mark = json!({"workspace_id": ws, "mode": "practice", "mark": {"mint": MINT, "price_usd": "0.000041230000", "price_sol": "0.000000213400", "liquidity_usd": 48211.5, "slot": 301223344, "ts": "2026-10-29T08:42:01.020Z", "position_ids": [POSITION]}});
    let notified = psql(&format!(
        "select pg_notify('centurion_marks', '{}')",
        mark.to_string().replace('\'', "''")
    ));
    let mid = drain(&mut rx, 6_000).await; // clock every 5 s by default
    let got_mark = mid
        .iter()
        .any(|m| matches!(m, Inbound::Mark(x) if x.mint == MINT));
    let got_clock = mid.iter().any(|m| matches!(m, Inbound::Clock(_)));
    r.check(
        "sse mark frame (pg_notify)",
        notified && got_mark,
        format!("notify={notified} mark={got_mark}"),
    );
    r.check("sse clock frame", got_clock, format!("clock={got_clock}"));
    let last = s1.last().copied().unwrap_or(start);
    drop(rx); // disconnect
              // write while disconnected: close 50 % (fraction_bps)
    let (prev, _) = rev_of(&t, &p(&format!("/positions/{POSITION}"))).await;
    let ck = key("close");
    match t.close(POSITION, &ck, Some(prev), 5_000).await {
        Ok(c) => {
            r.check(
                "close fraction_bps=5000",
                c.order.fraction_bps == 5_000
                    && !c.replayed
                    && matches!(c.status.as_str(), "queued" | "filled" | "failed"),
                format!(
                    "status={} order={} position.rev={} fill={} job_id={:?}",
                    c.status,
                    c.order_id,
                    c.position.rev,
                    c.fill.is_some(),
                    c.job_id
                ),
            );
            match t.close(POSITION, &ck, Some(prev), 5_000).await {
                Ok(c2) => r.check(
                    "close replay",
                    c2.replayed && c2.order_id == c.order_id,
                    format!("replayed={}", c2.replayed),
                ),
                Err(x) => r.check("close replay", false, x),
            }
        }
        Err(x) => r.check("close fraction_bps=5000", false, x),
    }
    let (prev2, _) = rev_of(&t, &p(&format!("/positions/{POSITION}"))).await;
    for bps in [0u16, 10_001] {
        match t.close(POSITION, &key("cbad"), Some(prev2), bps).await {
            Err(x) => r.check(
                &format!("close fraction_bps={bps} → 422"),
                code(&x) == "INVALID_FRACTION",
                &x,
            ),
            Ok(_) => r.check(
                &format!("close fraction_bps={bps} → 422"),
                false,
                "accepted",
            ),
        }
    }
    let mut rx = t.open_stream(0, Some(last)).await.expect("sse resume");
    let resumed = drain(&mut rx, 2_000).await;
    let s2 = seqs(&resumed);
    let kinds: Vec<String> = resumed
        .iter()
        .filter_map(|m| {
            if let Inbound::Event(e) = m {
                Some(e.kind.clone())
            } else {
                None
            }
        })
        .collect();
    r.check(
        "sse resume (Last-Event-ID wins over after_seq=0)",
        !s2.is_empty() && s2.iter().all(|s| *s > last) && !s2.iter().any(|s| s1.contains(s)),
        format!("{} new events after {last}: {}", s2.len(), kinds.join(",")),
    );
    if !kinds
        .iter()
        .any(|k| k.starts_with("order.") || k.starts_with("position."))
    {
        r.mismatch(
            "SSE after close",
            "order.* / position.* events (API_ENDPOINTS 4.4)",
            kinds.join(","),
        );
    }
    drop(rx);
    // decoded events carry reject_reason on proposal.rejected
    if let Ok(pg) = t.list_events(start, 500).await {
        match pg.items.iter().find(|e| e.kind == "proposal.rejected") {
            Some(ev) if ev.payload["reject_reason"] == "not_tradeable" => {
                r.check("proposal.rejected.reject_reason", true, "not_tradeable")
            }
            Some(ev) => r.check("proposal.rejected.reject_reason", false, &ev.payload),
            None => r.check(
                "proposal.rejected.reject_reason",
                false,
                "no proposal.rejected event",
            ),
        }
        for ev in &pg.items {
            if let Some(Err(e)) = KnownEvent::decode(ev) {
                r.mismatch(
                    &format!("event {}", ev.kind),
                    "decodes with the 1.1.3 payload type",
                    e,
                );
            }
        }
    }

    // ---- 5. practice reset (+ 429 cooldown with Retry-After) -----------------------------------
    let wrev = t.get_workspace().await.map(|w| w.data.rev).ok();
    let rk = key("reset");
    match t.reset_practice(&rk, wrev).await {
        Ok(x) => r.check(
            "practice reset",
            x.data.starting_balance_lamports == Lamports(30_000_000_000),
            format!(
                "epoch={} next_allowed_at={}",
                x.data.epoch, x.data.next_allowed_at.0
            ),
        ),
        Err(x) => r.check("practice reset", false, x),
    }
    match t
        .raw(
            Method::POST,
            &p("/practice/reset"),
            Some(&json!({})),
            &[("Idempotency-Key", rk.clone())],
        )
        .await
    {
        Ok((_, h, v)) => r.check(
            "practice reset replay",
            v["replayed"] == true && h.get("idempotent-replayed").is_some(),
            format!("replayed={}", v["replayed"]),
        ),
        Err(x) => r.check("practice reset replay", false, x),
    }
    let (st, h, v) = match t
        .client_raw_status(&p("/practice/reset"), &key("reset2"))
        .await
    {
        Ok(x) => x,
        Err(x) => {
            r.check("practice reset cooldown → 429", false, x);
            (0, reqwest::header::HeaderMap::new(), Value::Null)
        }
    };
    let ra = h
        .get("retry-after")
        .and_then(|x| x.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok());
    r.check(
        "practice reset cooldown → 429 + Retry-After",
        st == 429
            && v["error"]["code"] == "RESET_COOLDOWN"
            && ra.is_some_and(|s| s > 0)
            && v["error"]["next_allowed_at"].is_string(),
        format!(
            "status={st} code={} Retry-After={ra:?} next_allowed_at={}",
            v["error"]["code"], v["error"]["next_allowed_at"]
        ),
    );
    match t.reset_practice(&key("reset3"), wrev).await {
        Err(x) => {
            let tagged = x.to_string();
            r.check(
                "cooldown surfaced to UI tags",
                tagged.contains("[next_allowed_at=") && tagged.contains("[retry_after_s="),
                tagged,
            );
        }
        Ok(_) => r.check("cooldown surfaced to UI tags", false, "accepted"),
    }

    // ---- 6. contract scans over every raw body / frame seen ------------------------------------
    let seen = super::http::CAPTURE.lock().unwrap().clone();
    let ts_ok = |s: &str| {
        let b = s.as_bytes();
        s.len() == 24
            && b[4] == b'-'
            && b[10] == b'T'
            && b[19] == b'.'
            && b[23] == b'Z'
            && s[..4].chars().all(|c| c.is_ascii_digit())
    };
    fn walk(v: &Value, path: &str, out: &mut Vec<(String, String)>) {
        match v {
            Value::Object(m) => {
                for (k, x) in m {
                    let p = format!("{path}.{k}");
                    if let Value::String(s) = x {
                        if k.ends_with("_at")
                            || k == "ts"
                            || k == "server_now"
                            || k.ends_with("_until")
                        {
                            out.push((p.clone(), s.clone()));
                        }
                    }
                    walk(x, &p, out);
                }
            }
            Value::Array(a) => a.iter().for_each(|x| walk(x, &format!("{path}[]"), out)),
            _ => {}
        }
    }
    let mut bad_ts = std::collections::BTreeMap::new();
    for (what, v) in &seen {
        let mut out = Vec::new();
        walk(v, "", &mut out);
        for (field, s) in out {
            if !ts_ok(&s) {
                bad_ts.entry((what.clone(), field)).or_insert(s);
            }
        }
    }
    for ((what, field), s) in &bad_ts {
        r.mismatch(
            what,
            &format!("{field} RFC 3339 UTC ms (EVENTS_SCHEMA §1, \"2026-10-29T08:42:00.123Z\")"),
            s,
        );
    }
    for (what, v) in &seen {
        if what.starts_with("POST")
            && what.contains("/decision")
            && what.ends_with("200")
            && v["data"].get("reject_reason").is_none()
        {
            r.mismatch(
                what,
                "data.reject_reason key (1.1.3 ApprovalDecisionResponse)",
                "absent",
            );
        }
        if what.ends_with("409") {
            let cur = &v["error"]["current"];
            if what.contains("/decision")
                && serde_json::from_value::<ApprovalWire>(cur.clone()).is_err()
            {
                r.mismatch(
                    what,
                    "error.current = ApprovalWire (1.1.3)",
                    serde_json::from_value::<ApprovalWire>(cur.clone()).unwrap_err(),
                );
            }
            if what.contains("/close")
                && serde_json::from_value::<PositionWire>(cur.clone()).is_err()
            {
                r.mismatch(
                    what,
                    "error.current = PositionWire",
                    serde_json::from_value::<PositionWire>(cur.clone()).unwrap_err(),
                );
            }
            if what.contains("/strategies/")
                && serde_json::from_value::<StrategySummary>(cur.clone()).is_err()
            {
                r.mismatch(
                    what,
                    "error.current = strategy",
                    serde_json::from_value::<StrategySummary>(cur.clone()).unwrap_err(),
                );
            }
            if v["error"].get("request_id").is_none() {
                r.mismatch(
                    what,
                    "error.request_id (ConflictError, 1.1.3 required)",
                    "absent",
                );
            }
        }
        if what.starts_with("SSE ")
            && !matches!(what.as_str(), "SSE mark" | "SSE clock")
            && !v["seq"].is_string()
        {
            r.mismatch(what, "seq int64 string", &v["seq"]);
        }
    }
    println!("scanned {} raw bodies/frames", seen.len());

    // ---- SIWS (wallet-only login), non-signing paths: the desktop pre-check must accept the server's
    // own message format; strangers get wallet_not_allowed; bad signature / refresh are 401 with reasons.
    if let (Ok(domain), Ok(owner)) = (
        std::env::var("SMOKE_SIWS_DOMAIN"),
        std::env::var("SMOKE_OWNER_WALLET"),
    ) {
        let ac = crate::auth::AuthClient::new(t.base()).expect("auth client");
        match ac.nonce(&owner, &domain).await {
            Ok(v) => {
                let msg = v["data"]["message"].as_str().unwrap_or("").to_owned();
                let pre =
                    crate::auth::check_message(&msg, &domain, &owner, crate::util::now_ms() as i64);
                r.check(
                    "siws nonce (owner) + desktop message pre-check",
                    pre.is_ok(),
                    format!("{pre:?} expires_at={}", v["data"]["expires_at"]),
                );
                match ac.verify(&owner, &msg, &"1".repeat(88)).await {
                    Err(e) => r.check(
                        "siws verify bad signature → 401",
                        e.code().starts_with("SIWS_") || e.code() == "UNAUTHENTICATED",
                        format!("{} {:?}", e.code(), e),
                    ),
                    Ok(_) => r.check("siws verify bad signature → 401", false, "accepted!"),
                }
            }
            Err(e) => r.check("siws nonce (owner) + desktop message pre-check", false, e),
        }
        let stranger = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
        match ac.nonce(stranger, &domain).await {
            Err(e) => {
                let reason = if let ApiFailure::Api {
                    details: Some(d), ..
                } = &e
                {
                    d["reason"].as_str().unwrap_or("").to_owned()
                } else {
                    String::new()
                };
                r.check(
                    "siws nonce (stranger) → 403 wallet_not_allowed",
                    e.code() == "FORBIDDEN_ROLE" && reason == "wallet_not_allowed",
                    format!("{} reason={reason}", e.code()),
                );
            }
            Ok(_) => r.check(
                "siws nonce (stranger) → 403 wallet_not_allowed",
                false,
                "nonce issued",
            ),
        }
        match ac.refresh("srt_notarealtoken0000000000000000").await {
            Err(e) => {
                let reason = if let ApiFailure::Api {
                    details: Some(d), ..
                } = &e
                {
                    d["reason"].as_str().unwrap_or("").to_owned()
                } else {
                    String::new()
                };
                r.check(
                    "siws refresh unknown token → 401",
                    e.code() == "UNAUTHENTICATED",
                    format!("{} reason={reason}", e.code()),
                );
            }
            Ok(_) => r.check("siws refresh unknown token → 401", false, "refreshed!"),
        }
        let lo = ac.logout("srt_notarealtoken0000000000000000").await;
        r.check(
            "siws logout unknown token (idempotent or 401)",
            lo.is_ok()
                || lo
                    .as_ref()
                    .err()
                    .is_some_and(|e| e.code() == "UNAUTHENTICATED"),
            format!("{lo:?}"),
        );
    }

    println!(
        "SUMMARY fails={} mismatches={}",
        r.fails.len(),
        r.mismatches.len()
    );
    for m in &r.mismatches {
        println!("  mismatch: {m}");
    }
    assert!(r.fails.is_empty(), "failed cases: {:?}", r.fails);
}
