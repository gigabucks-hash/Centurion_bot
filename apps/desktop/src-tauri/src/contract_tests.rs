//! Contract test: the Rust wire mirror (`model.rs`) must accept the **published samples and
//! vocabularies** of `packages/contracts` (v1.1.x) as they sit in the monorepo — EVENTS_SCHEMA.md
//! JSON examples, the API_ENDPOINTS.md 409 body, errors.json, and the TS unions in
//! `src/wire/events.ts`. A Backend change that the desktop cannot read fails `cargo test`.

use crate::backend::ApiFailure;
use crate::model::*;
use std::path::PathBuf;

fn contracts() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../packages/contracts")
}
fn read(rel: &str) -> String {
    std::fs::read_to_string(contracts().join(rel)).unwrap_or_else(|e| panic!("read {rel}: {e}"))
}
/// All values inside ```json fences (a fence may hold several concatenated objects).
fn json_blocks(md: &str) -> Vec<Vec<serde_json::Value>> {
    let mut out = Vec::new();
    let mut rest = md;
    while let Some(i) = rest.find("```json") {
        let body = &rest[i + 7..];
        let j = body.find("```").expect("closed fence");
        let vals = serde_json::Deserializer::from_str(&body[..j]).into_iter::<serde_json::Value>().collect::<Result<Vec<_>, _>>().expect("valid JSON in fence");
        out.push(vals);
        rest = &body[j + 3..];
    }
    out
}
/// String literals of a TS union / array: `export type Name = | "a" | "b";` or `NAME: ... = [ "a", ... ]`.
fn ts_literals(src: &str, start: &str) -> Vec<String> {
    let i = src.find(start).unwrap_or_else(|| panic!("{start} not in events.ts"));
    let tail = &src[i + start.len()..];
    let end = tail.find(';').unwrap();
    tail[..end].split('"').skip(1).step_by(2).map(str::to_owned).collect()
}

#[test]
fn contracts_version_is_what_we_mirror() {
    let ts = read("src/wire/events.ts");
    let published = ts.split("CONTRACTS_VERSION = \"").nth(1).and_then(|t| t.split('"').next()).expect("CONTRACTS_VERSION in events.ts");
    let mm = |v: &str| v.split('.').take(2).collect::<Vec<_>>().join(".");
    // Patch releases are additive/no-shape; a minor/major bump must be reviewed here.
    assert_eq!(mm(published), mm(CONTRACTS_VERSION), "contracts {published} published, desktop mirrors {CONTRACTS_VERSION} — review CHANGELOG + model.rs");
    assert!(ts.contains(&format!("EVENT_SCHEMA_VERSION = {EVENT_SCHEMA_VERSION}")));
}

#[test]
fn events_schema_examples_deserialize() {
    let md = read("EVENTS_SCHEMA.md");
    let blocks = json_blocks(&md);
    let mut seen = (0, 0, 0, 0, 0, 0);
    for vals in &blocks {
        for v in vals {
            if v.get("seq").is_some() && v.get("payload").is_some() {
                // Envelope (generic example and proposal.expired example).
                let env: EventEnvelope = serde_json::from_value(v.clone()).expect("envelope");
                assert_eq!(env.mode, Mode::Practice);
                assert!(env.server_now.as_ref().and_then(|t| t.ms()).is_some(), "server_now parses");
                if env.kind == "proposal.expired" {
                    match KnownEvent::decode(&env).unwrap().expect("decodes") {
                        KnownEvent::ProposalExpired(x) => assert_eq!(x.reason, ProposalExpiredReason::StrategyDeleted),
                        k => panic!("{k:?}"),
                    }
                    seen.1 += 1;
                } else {
                    seen.0 += 1;
                }
            } else if v.get("event").and_then(|e| e.as_str()) == Some("mark") {
                let m: MarkMessage = serde_json::from_value(v["payload"].clone()).expect("mark");
                assert_eq!(m.price_sol.to_string(), "0.0000002134");
                seen.2 += 1;
            } else if v.get("event").and_then(|e| e.as_str()) == Some("clock") {
                let c: ClockMessage = serde_json::from_value(v["payload"].clone()).expect("clock");
                assert!(c.safe_seq > 0);
                seen.2 += 1;
            } else if v.get("mark_price_sol").is_some() {
                let f: FillSimulated = serde_json::from_value(v.clone()).expect("fill.simulated");
                assert_eq!(f.sol_lamports, Lamports(250_000_000));
                assert_eq!(f.token_amount_raw, RawQty(980_392_156));
                seen.3 += 1;
            } else if v.get("cash_lamports").is_some() {
                let p: PortfolioSnapshot = serde_json::from_value(v.clone()).expect("portfolio.snapshot");
                assert_eq!(p.equity_lamports, Lamports(27_478_000_000));
                assert_eq!(p.drawdown_pct, 8.4);
                seen.4 += 1;
            } else if v.get("deep_link").is_some() {
                // Push payload (§6): mobile-only; desktop just checks it is versioned and practice.
                // 1.1.1: number; 1.1.2: every FCM data value is a string ("1").
                assert!(v["v"] == 1 || v["v"] == "1", "push v");
                assert_eq!(v["mode"], "practice");
                seen.5 += 1;
            }
        }
    }
    assert_eq!(seen, (1, 1, 2, 1, 1, 1), "every EVENTS_SCHEMA.md example recognised (envelope, expired, mark+clock, fill, portfolio, push)");
}

#[test]
fn api_endpoints_409_body_maps_to_conflict() {
    let md = read("API_ENDPOINTS.md");
    let body = json_blocks(&md)
        .into_iter()
        .flatten()
        .find(|v| v["error"]["code"] == "STRATEGY_REV_CONFLICT")
        .expect("409 example in API_ENDPOINTS.md");
    // v1.1 puts merge data next to `error`; 1.1.2 moves it inside `error` — both must map.
    let _typed: ConflictBody = serde_json::from_value(body.clone()).expect("ConflictBody");
    let f = ApiFailure::from_body(409, &body);
    let c = f.conflict().expect("conflict");
    assert!(c.current_rev > c.base_rev, "current_rev > base_rev");
    assert!(!c.changed_fields.is_empty() && c.current.is_some() && c.changed_by.is_some());
    let cur: StrategySummary = serde_json::from_value(c.current.clone().unwrap()).expect("current is a strategy");
    assert_eq!(Some(cur.rev), c.current_rev);
}

#[test]
fn errors_json_has_the_codes_the_desktop_handles() {
    // errors.json v4 (contracts 1.1.2): single registry, every code has kind / sqlstate / messages.en|id.
    let v: serde_json::Value = serde_json::from_str(&read("errors.json")).unwrap();
    assert_eq!(v["version"], 4, "errors.json version");
    let codes = v["codes"].as_array().unwrap();
    for c in codes {
        let code = c["code"].as_str().unwrap();
        let kind = c["kind"].as_str().unwrap_or_else(|| panic!("{code} kind"));
        assert!(["error", "notice", "skip"].contains(&kind), "{code} kind {kind}");
        assert!(c["sqlstate"].as_str().is_some_and(|s| s.starts_with("P0")), "{code} sqlstate");
        for loc in ["en", "id"] {
            assert!(c["messages"][loc].as_str().is_some_and(|m| !m.is_empty()), "{code} messages.{loc}");
        }
        // the desktop's classification must agree with the registry for every code it knows
        let ours = match crate::keys::code_kind(code) {
            crate::keys::CodeKind::Error => "error",
            crate::keys::CodeKind::Notice => "notice",
            crate::keys::CodeKind::Skip => "skip",
        };
        assert_eq!(ours, kind, "{code}: keys::code_kind disagrees with errors.json");
    }
    let find = |code: &str| codes.iter().find(|c| c["code"] == code);
    assert!(find("TELEGRAM_AUTH_INVALID").is_none(), "removed in 1.1.2");
    assert!(find("PAPER_CASH_INSUFFICIENT").is_none(), "renamed PRACTICE_CASH_INSUFFICIENT");
    for (code, http, kind) in [
        ("VERSION_CONFLICT", 409, "error"),
        ("STRATEGY_REV_CONFLICT", 409, "error"),
        ("CONFIRMATION_RESTART_REQUIRED", 409, "error"),
        ("PRECONDITION_REQUIRED", 428, "error"),
        ("RESET_COOLDOWN", 429, "error"),
        ("IDEMPOTENCY_KEY_REUSED", 422, "error"),
        ("POSITION_ALREADY_CLOSED", 409, "error"),
        ("INVALID_FRACTION", 422, "error"),
        ("UNSUPPORTED_QUOTE_MINT", 0, "skip"),
        ("PRACTICE_CASH_INSUFFICIENT", 0, "notice"),
        ("REAL_SOL_DISABLED", 0, "error"),
        ("APPROVAL_EXPIRED", 0, "error"),
        ("APPROVAL_TOKEN_INVALID", 0, "error"),
    ] {
        let c = find(code).unwrap_or_else(|| panic!("{code} missing from errors.json"));
        if http != 0 {
            assert_eq!(c["http"], http, "{code} http");
        }
        assert_eq!(c["kind"], kind, "{code} kind");
    }
}

#[test]
fn ts_vocabularies_match_rust_enums() {
    let ts = read("src/wire/events.ts");
    let de = |s: &str| serde_json::Value::String(s.to_owned());
    for r in ts_literals(&ts, "export const EXIT_REASONS: readonly ExitReason[] =") {
        serde_json::from_value::<ExitReason>(de(&r)).unwrap_or_else(|_| panic!("ExitReason {r}"));
        let _ = crate::keys::exit_label(serde_json::from_value(de(&r)).unwrap());
    }
    for r in ts_literals(&ts, "export type ProposalExpiredReason =") {
        serde_json::from_value::<ProposalExpiredReason>(de(&r)).unwrap_or_else(|_| panic!("ProposalExpiredReason {r}"));
    }
    for r in ts_literals(&ts, "export type Venue =") {
        serde_json::from_value::<Venue>(de(&r)).unwrap_or_else(|_| panic!("Venue {r}"));
    }
    for r in ts_literals(&ts, "export type Actor =") {
        serde_json::from_value::<Actor>(de(&r)).unwrap_or_else(|_| panic!("Actor {r}"));
    }
    for r in ts_literals(&ts, "export type DecidedVia =") {
        serde_json::from_value::<DecidedVia>(de(&r)).unwrap_or_else(|_| panic!("DecidedVia {r}"));
    }
    // Every event type in EventPayloads is decoded by the desktop, except the ones it
    // deliberately ignores (guard changes are a Web/Mobile flow).
    let i = ts.find("export interface EventPayloads {").unwrap();
    let block = &ts[i..i + ts[i..].find('}').unwrap()];
    let types: Vec<&str> = block.split('"').skip(1).step_by(2).collect();
    assert!(types.len() >= 28, "parsed {} types", types.len());
    const IGNORED: &[&str] = &["guard.changed"];
    for t in types {
        let env = EventEnvelope {
            id: "x".into(), seq: 1, kind: t.into(), version: 1, workspace_id: "w".into(), strategy_id: None, ck: None, mint: None,
            ts: IsoTs::from_ms(0), actor: Actor::System, mode: Mode::Practice, payload: serde_json::json!({}), untrusted: Untrusted::default(), server_now: None,
        };
        assert_eq!(KnownEvent::decode(&env).is_some(), !IGNORED.contains(&t), "desktop decoder coverage for {t}");
    }
}

/// 1.1.2 typed wire: the published `PlanState` / `FillWire` examples and both API error bodies
/// decode into the Rust mirror (no opaque JSON left for these).
#[test]
fn contracts_1_1_2_typed_examples_decode() {
    let mut seen = (0, 0);
    for v in json_blocks(&read("EVENTS_SCHEMA.md")).into_iter().flatten() {
        if v.get("steps").is_some() && v.get("preset").is_some() {
            let p: PlanState = serde_json::from_value(v.clone()).expect("PlanState");
            assert!(!p.steps.is_empty() && !p.steps.iter().any(|s| matches!(s, PlanStep::Unknown)), "every PlanStep kind known");
            seen.0 += 1;
        } else if v.get("mid_price_sol").is_some() && v.get("practice_epoch").is_some() {
            let f: FillWire = serde_json::from_value(v.clone()).expect("FillWire");
            assert!(f.id.is_some() && f.practice_epoch.is_some() && f.created_at.is_some());
            seen.1 += 1;
        }
    }
    assert_eq!(seen, (1, 1), "PlanState + FillWire examples present");
    let errs: Vec<_> = json_blocks(&read("API_ENDPOINTS.md")).into_iter().flatten().filter(|v| v.get("error").is_some()).collect();
    assert!(errs.len() >= 2);
    for b in &errs {
        let e: ApiError = serde_json::from_value(b.clone()).expect("ApiError {error:{code,message,...,server_now}, server_now}");
        assert!(!e.error.code.is_empty());
        if b["error"].get("current_rev").is_some() {
            let c: ConflictBody = serde_json::from_value(b.clone()).expect("ConflictBody (details inside error)");
            assert!(c.error.current_rev > c.error.base_rev);
            if c.error.code == "STRATEGY_REV_CONFLICT" {
                assert!(!c.error.current.is_null() && c.error.changed_by.is_some());
            }
        }
    }
    // seq / job_id are int64 strings; numbers are still accepted on input
    let j: JobWire = serde_json::from_value(serde_json::json!({"id": "9007199254740993", "kind": "close_position", "status": "done", "attempts": 1,
        "last_error": null, "created_at": "2026-10-29T10:00:00Z", "updated_at": "2026-10-29T10:00:01Z"})).unwrap();
    assert_eq!(j.id, 9_007_199_254_740_993, "beyond 2^53: exact");
    assert_eq!(serde_json::to_value(&j).unwrap()["id"], "9007199254740993");
}
