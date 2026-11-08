//! IPC surface. Each command is individually permissioned (see build.rs + capabilities/).
//! Reads come from the local mirror (`Engine`); every mutation goes to the backend through the
//! [`Transport`](crate::backend::Transport) and comes back as wire events on the stream.

use crate::backend::{ApiFailure, Transport, CLIENT_MODE};
use crate::error::{AppError, AppResult};
use crate::events::{dispatch, Out};
use crate::model::*;
use crate::state::AppState;
use crate::util::is_valid_mint;
use crate::view::*;
use tauri::{AppHandle, Emitter, Manager, Runtime, State, Window};

fn idem_key(state: &AppState) -> String {
    format!("desk-{}", state.engine.lock().unwrap().rng.hex(24))
}

/// Map a failed write to the UI. 409 → conflict toast (`write:conflict`) + refresh from the
/// server's `current` resource; 428 → client bug (logged, never retried blindly).
fn on_write_error<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
    resource: &str,
    id: &str,
    e: ApiFailure,
) -> AppError {
    match &e {
        ApiFailure::Conflict(c) => {
            let view = ConflictView {
                code: c.code.clone(),
                resource: resource.into(),
                resource_id: id.into(),
                base_rev: c.base_rev,
                current_rev: c.current_rev,
                changed_fields: c
                    .changed_fields
                    .iter()
                    .map(|f| crate::model::plain_text(f, 40))
                    .collect(),
                changed_via: c
                    .changed_by
                    .as_ref()
                    .and_then(|b| b.via.as_deref().map(|v| crate::model::plain_text(v, 16))),
                changed_at: c.changed_at.clone(),
                restart_confirmation: e.restart_confirmation(),
                message: e.to_string(),
            };
            let mut outs = vec![Out::Conflict(view)];
            if resource == "strategy" {
                if let Some(cur) = c
                    .current
                    .clone()
                    .and_then(|v| serde_json::from_value::<StrategySummary>(v).ok())
                {
                    outs.push(state.engine.lock().unwrap().set_strategies(&[cur]));
                } else {
                    state.engine.lock().unwrap().refetch_strategies = true;
                }
            }
            let note = state
                .engine
                .lock()
                .unwrap()
                .note(Actor::User, Tone::Bad, e.to_string());
            outs.push(note);
            dispatch(app, outs);
        }
        ApiFailure::PreconditionRequired => {
            log::error!("428 on {resource} {id}: write sent without If-Match")
        }
        _ => {}
    }
    e.into()
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_snapshot(state: State<'_, AppState>) -> Snapshot {
    state.engine.lock().unwrap().snapshot()
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_candles(state: State<'_, AppState>, mint: String) -> AppResult<Vec<CandleView>> {
    if !is_valid_mint(&mint) {
        return Err(AppError::Invalid("mint".into()));
    }
    Ok(state.engine.lock().unwrap().candles(&mint))
}

/// GET /approvals/{id} (fresh single-use token + rev) → POST /decision with `If-Match: "<rev>"` +
/// `expected_rev` (1.1.2). One retry on VERSION_CONFLICT (refetch), per API_ENDPOINTS §2. The retry
/// has a different body (new token / rev) so it gets a **fresh** Idempotency-Key — reusing a key
/// with a different body is 422 IDEMPOTENCY_KEY_REUSED. Actor / channel come from the JWT.
async fn decide(
    state: &AppState,
    id: &str,
    decision: Decision,
    reject_reason: Option<ApprovalRejectReason>,
) -> AppResult<()> {
    // 1.1.3: reject_reason only with reject (the server answers 422 VALIDATION_FAILED otherwise).
    let reject_reason = if decision == Decision::Reject {
        Some(reject_reason.unwrap_or(crate::rejmap::map().default))
    } else {
        None
    };
    let t = state.transport.clone();
    for attempt in 0..2 {
        let key = idem_key(state);
        let a = t.get_approval(id).await?;
        state
            .engine
            .lock()
            .unwrap()
            .observe_server_now(&a.server_now);
        let Some(token) = a.data.decision_token else {
            return Err(AppError::SignalNotPending);
        };
        let req = ApprovalDecisionRequest {
            decision: decision.clone(),
            token,
            expected_rev: a.data.version,
            reason: None,
            reject_reason,
        };
        match t.decide(id, &key, req).await {
            Ok(r) => {
                state
                    .engine
                    .lock()
                    .unwrap()
                    .observe_server_now(&r.server_now);
                return Ok(());
            }
            Err(ref e) if e.code() == "VERSION_CONFLICT" && attempt == 0 => continue,
            Err(e) => return Err(e.into()),
        }
    }
    Err(AppError::Api("VERSION_CONFLICT".into()))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn approve_signal<R: Runtime>(
    window: Window<R>,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    {
        let e = state.engine.lock().unwrap();
        crate::state::check_approve_origin(window.label(), e.mode)?;
        let pick = e.check_pending(&id)?;
        // WF-20: a not-tradeable coin can never be approved (UI disables the button too).
        e.check_tradeable(&pick.mint)?;
    }
    let r = decide(&state, &id, Decision::Approve, None).await;
    // 1.1.4: 409 QUOTE_MISSING_OR_STALE (Real only on the server) → the card switches to "refresh quote".
    if let Err(AppError::Api(m)) = &r {
        if m.starts_with("QUOTE_MISSING_OR_STALE") {
            let outs = state.engine.lock().unwrap().mark_quote_stale(&id);
            crate::events::dispatch(window.app_handle(), outs);
        }
    }
    r
}

/// Refresh a proposal's quote (CTA `review.quote.refresh`): re-read `GET /approvals/{id}`, which carries
/// the current quote and rev (the server refreshes quotes itself and announces them with the silent
/// `proposal.updated`). Clears the stale flag when the quote is fresh again.
#[tauri::command(rename_all = "snake_case")]
pub async fn refresh_quote<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    state.engine.lock().unwrap().check_pending(&id)?; // known + pending (validates the id)
    let a = state.transport.get_approval(&id).await?;
    let outs = {
        let mut e = state.engine.lock().unwrap();
        e.observe_server_now(&a.server_now);
        e.apply_quote(&id, a.data.version, &a.data.quote)
    };
    crate::events::dispatch(&app, outs);
    Ok(())
}

/// Outcome of a strategy settings patch for the UI: a guard-loosening patch is **waiting for approval**
/// (202, nothing applied), never shown as success.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum PatchOutcome {
    Applied {
        rev: u64,
    },
    PendingApproval {
        proposal_id: String,
        expires_at: String,
        fields: Vec<String>,
    },
}

/// `PATCH /strategies/{id}` with the cached rev as If-Match. Only plain JSON objects with at most 32 keys
/// are accepted (the server validates every field again).
#[tauri::command(rename_all = "snake_case")]
pub async fn patch_strategy<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    id: String,
    settings_patch: serde_json::Value,
) -> AppResult<PatchOutcome> {
    let obj = settings_patch
        .as_object()
        .ok_or_else(|| AppError::Invalid("settings_patch must be an object".into()))?;
    if obj.is_empty()
        || obj.len() > 32
        || obj.keys().any(|k| {
            k.len() > 64
                || !k
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
        })
    {
        return Err(AppError::Invalid("settings_patch keys".into()));
    }
    let rev = state
        .engine
        .lock()
        .unwrap()
        .strategy_rev(&id)
        .ok_or_else(|| AppError::Invalid("unknown strategy".into()))?;
    let key = idem_key(&state);
    match state
        .transport
        .patch_strategy(&id, &key, Some(rev), settings_patch)
        .await?
    {
        crate::backend::StrategyPatch::Applied(s) => {
            let out = state
                .engine
                .lock()
                .unwrap()
                .set_strategies(std::slice::from_ref(&s.data));
            crate::events::dispatch(&app, vec![out]);
            Ok(PatchOutcome::Applied { rev: s.data.rev })
        }
        crate::backend::StrategyPatch::PendingApproval {
            proposal,
            guard_change,
            ..
        } => {
            let fields = guard_change["fields"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(str::to_owned))
                        .collect()
                })
                .unwrap_or_default();
            Ok(PatchOutcome::PendingApproval {
                proposal_id: proposal.proposal_id,
                expires_at: proposal.expires_at.0,
                fields,
            })
        }
    }
}

/// Skip (reject). Allowed on not-tradeable picks (UX Rev 4.4: skipping is not a trade). Contracts
/// 1.1.3 `reject_reason`: `not_tradeable` for a not-tradeable pick (the UI preselects
/// `queue.skip_reason.not_tradeable`), `user_declined` for a normal skip.
#[tauri::command(rename_all = "snake_case")]
pub async fn skip_signal(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let reason = {
        let e = state.engine.lock().unwrap();
        let pick = e.check_pending(&id)?;
        skip_reason(e.check_tradeable(&pick.mint).is_ok())
    };
    decide(&state, &id, Decision::Reject, Some(reason)).await
}

/// `reject_reason` for a skip (1.1.3), from i18n `reject_reasons.map.json` (chip `not_tradeable`, else `default`).
pub fn skip_reason(tradeable: bool) -> ApprovalRejectReason {
    crate::rejmap::skip(tradeable).0
}

/// Batch approve (UX: Practice picks only; API `/batch-decision` is buy_pick-only). The mock
/// transport has no batch endpoint yet, so items are decided one by one.
#[tauri::command(rename_all = "snake_case")]
pub async fn approve_many<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> AppResult<()> {
    if ids.len() > 20 {
        return Err(AppError::Invalid("max 20 per batch".into()));
    }
    if state.engine.lock().unwrap().mode != Mode::Practice || CLIENT_MODE != Mode::Practice {
        return Err(AppError::Invalid("batch approve is Practice-only".into()));
    }
    let mut failed = 0;
    for id in &ids {
        let ok = {
            let e = state.engine.lock().unwrap();
            e.check_pending(id)
                .and_then(|p| e.check_tradeable(&p.mint))
                .is_ok()
        };
        if !ok || decide(&state, id, Decision::Approve, None).await.is_err() {
            failed += 1;
        }
    }
    if failed > 0 {
        let o = state.engine.lock().unwrap().note(
            Actor::User,
            Tone::Bad,
            format!(
                "Batch: {failed}/{} gagal (sudah diputus/expired)",
                ids.len()
            ),
        );
        dispatch(&app, vec![o]);
    }
    Ok(())
}

/// Step 1 of 2: local confirmation gate (nonce + estimate). Nothing is sent to the backend.
#[tauri::command(rename_all = "snake_case")]
pub fn request_sell(
    state: State<'_, AppState>,
    position_key: String,
    pct: u8,
) -> AppResult<SellQuote> {
    if position_key.len() > 80 {
        return Err(AppError::Invalid("position_key".into()));
    }
    state
        .engine
        .lock()
        .unwrap()
        .request_sell(&position_key, pct)
}

/// Step 2 of 2: consume the nonce, then `POST /v1/workspaces/{ws}/positions/{id}/close
/// {fraction_bps}` + `If-Match: "<position rev>"` + `Idempotency-Key` (contracts 1.1.2). Blocked locally when the coin
/// is not tradeable (WF-20).
#[tauri::command(rename_all = "snake_case")]
pub async fn confirm_sell<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    nonce: String,
) -> AppResult<()> {
    let (key, pos_id, pct, rev) = state.engine.lock().unwrap().take_quote(&nonce)?;
    let bps = pct_to_bps(pct).ok_or_else(|| AppError::Invalid("pct".into()))?;
    // One key per distinct close (nonce is one-shot, so a new confirm = a new body).
    let idem = idem_key(&state);
    match state.transport.close(&pos_id, &idem, rev, bps).await {
        Ok(r) => {
            let out = {
                let mut e = state.engine.lock().unwrap();
                e.observe_server_now(&r.server_now);
                e.apply_close(&r)
            };
            dispatch(&app, out.into_iter().collect());
            Ok(())
        }
        Err(e) => Err(on_write_error(&app, &state, "position", &key, e)),
    }
}

/// Pause / resume a strategy: `POST /strategies/{id}/pause|resume` with `If-Match: "<rev>"`
/// = the rev the UI was showing. Stale → 409 conflict toast + refresh.
#[tauri::command(rename_all = "snake_case")]
pub async fn set_strategy_paused<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    id: String,
    paused: bool,
    base_rev: u64,
) -> AppResult<StrategyView> {
    if id.len() > 64 {
        return Err(AppError::Invalid("id".into()));
    }
    let idem = idem_key(&state);
    match state
        .transport
        .set_strategy_paused(&id, &idem, Some(base_rev), paused)
        .await
    {
        Ok(r) => {
            let out = {
                let mut e = state.engine.lock().unwrap();
                e.observe_server_now(&r.server_now);
                e.set_strategies(std::slice::from_ref(&r.data))
            };
            dispatch(&app, vec![out]);
            let v = state
                .engine
                .lock()
                .unwrap()
                .strategies_vec()
                .into_iter()
                .find(|s| s.id == id);
            v.ok_or(AppError::Invalid("strategy".into()))
        }
        Err(e) => Err(on_write_error(&app, &state, "strategy", &id, e)),
    }
}

/// Per-strategy mode (contracts 1.1.6). Paper = wire `practice`. Real is never reached from this build
/// (see `strategy_mode`): a locked strategy → `MODE_NOT_ALLOWED` without any request. `hold_ms` = how long the
/// user held the control (Real needs 2.5 s).
#[tauri::command(rename_all = "snake_case")]
pub async fn set_strategy_mode(
    state: State<'_, AppState>,
    id: String,
    mode: String,
    hold_ms: u32,
) -> AppResult<StrategyView> {
    let to = match mode.as_str() {
        "practice" => crate::model::Mode::Practice,
        "real" => crate::model::Mode::Real,
        _ => return Err(AppError::Invalid("mode".into())),
    };
    let view = state
        .engine
        .lock()
        .unwrap()
        .strategies_vec()
        .into_iter()
        .find(|s| s.id == id);
    match crate::strategy_mode::decide(view.as_ref(), to, hold_ms) {
        Ok(crate::strategy_mode::Decision::NoChange) => {
            view.ok_or(AppError::Invalid("strategy".into()))
        }
        Err((code, detail)) => Err(AppError::Api(format!("{code}: {detail}"))),
    }
}

/// `POST /workspaces/{ws}/practice/reset` with `If-Match` workspace rev. The UI asks for an
/// explicit confirmation first; the result arrives as `practice.reset` on the stream.
#[tauri::command(rename_all = "snake_case")]
pub async fn reset_practice<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let (mode, rev) = {
        let e = state.engine.lock().unwrap();
        (e.mode, e.account.workspace_rev)
    };
    if mode != Mode::Practice {
        return Err(AppError::Invalid("practice reset is Practice-only".into()));
    }
    let idem = idem_key(&state);
    match state.transport.reset_practice(&idem, rev).await {
        Ok(r) => {
            state
                .engine
                .lock()
                .unwrap()
                .observe_server_now(&r.server_now);
            crate::sync::refresh(&app, &state.transport, false, true).await;
            Ok(())
        }
        Err(e) => {
            if e.conflict().is_some() {
                crate::sync::refresh(&app, &state.transport, false, true).await;
            }
            Err(on_write_error(&app, &state, "workspace", "practice", e))
        }
    }
}

/// `GET /coins/{mint}/timeline` → activity rows (plain text) for the quick-look/chart.
#[tauri::command(rename_all = "snake_case")]
pub async fn get_coin_timeline(
    state: State<'_, AppState>,
    mint: String,
) -> AppResult<Vec<TimelineItem>> {
    if !is_valid_mint(&mint) {
        return Err(AppError::Invalid("mint".into()));
    }
    let r = state.transport.coin_timeline(&mint).await?;
    Ok(r.items
        .iter()
        .rev()
        .take(50)
        .map(|e| TimelineItem {
            seq: e.seq,
            ts: e.ts.clone(),
            kind: e.kind.clone(),
            actor: e.actor,
        })
        .collect())
}

/// `GET /stats/exit-reasons?window=24h`.
#[tauri::command(rename_all = "snake_case")]
pub async fn get_exit_reason_stats(
    state: State<'_, AppState>,
) -> AppResult<Vec<ExitReasonStatView>> {
    let r = state.transport.exit_reason_stats("24h").await?;
    Ok(r.data
        .iter()
        .map(|x| ExitReasonStatView {
            exit_reason: x.exit_reason,
            label: crate::keys::exit_label(x.exit_reason).into(),
            count: x.count,
            pnl_lamports: x.pnl_lamports,
            avg_pnl_pct: x.avg_pnl_pct,
            win_rate_pct: x.win_rate_pct,
            avg_hold_s: x.avg_hold_s,
        })
        .collect())
}

/// PnL report (0022): `/stats/pnl` + first closed-ledger page + per-exit-reason stats in one IPC call.
/// The window is validated here; an unknown value falls back to the API default (`7d`).
/// F4: the server's absolute `from`/`to` are pinned here and echoed to the UI; `get_pnl_page`
/// reuses them instead of rebuilding a relative window.
#[tauri::command(rename_all = "snake_case")]
pub async fn get_pnl_report(
    state: State<'_, AppState>,
    window: String,
) -> AppResult<PnlReportView> {
    let w = if ["24h", "7d", "30d", "all"].contains(&window.as_str()) {
        window
    } else {
        "7d".to_owned()
    };
    let summary = state.transport.pnl_summary(&w).await?;
    let (from, to) = pnl_range(&w, &summary);
    let cursor = None;
    let page = state
        .transport
        .closed_positions(ClosedQuery {
            window: (from.is_none() && to.is_none()).then_some(w.clone()),
            from: from.as_ref().map(|x| x.0.clone()),
            to: to.as_ref().map(|x| x.0.clone()),
            cursor,
            limit: PNL_PAGE_SIZE,
        })
        .await?;
    let stats = state.transport.exit_reason_stats(&w).await?;
    Ok(PnlReportView {
        summary: PnlSummaryView {
            mode: summary.mode,
            practice_epoch: summary.practice_epoch,
            window: summary.window,
            from,
            to,
            unrealized_pnl_lamports: summary.unrealized_pnl_lamports,
            realized_pnl_lamports: summary.realized_pnl_lamports,
            total_pnl_lamports: summary.total_pnl_lamports,
            realized_pnl_window_lamports: summary.realized_pnl_window_lamports,
            closed_count: summary.closed_count,
            win_count: summary.win_count,
            win_rate_pct: summary.win_rate_pct,
            avg_hold_s: summary.avg_hold_s,
            fees_lamports: summary.fees_lamports,
            best_pnl_lamports: summary.best_pnl_lamports,
            worst_pnl_lamports: summary.worst_pnl_lamports,
        },
        closed: page.items.into_iter().map(closed_view).collect(),
        next_cursor: page.next_cursor,
        exit_stats: stats
            .data
            .iter()
            .map(|x| ExitReasonStatView {
                exit_reason: x.exit_reason,
                label: crate::keys::exit_label(x.exit_reason).into(),
                count: x.count,
                pnl_lamports: x.pnl_lamports,
                avg_pnl_pct: x.avg_pnl_pct,
                win_rate_pct: x.win_rate_pct,
                avg_hold_s: x.avg_hold_s,
            })
            .collect(),
    })
}

/// Ledger page size. One page is 50 closes; `next_cursor` drives "Load more".
const PNL_PAGE_SIZE: usize = 50;

/// F4: absolute bounds for the report. `from` is the server echo; if an old server omits it, derive
/// it once from the reported `ts` and the requested window. `to` falls back to `ts` so rows added
/// while the user pages cannot shift the boundary.
fn pnl_range(window: &str, summary: &PnlSummary) -> (Option<IsoTs>, Option<IsoTs>) {
    let to = summary.to.clone().or_else(|| summary.ts.clone());
    let span = match window {
        "24h" => Some(86_400_000i64),
        "7d" => Some(7 * 86_400_000),
        "30d" => Some(30 * 86_400_000),
        _ => None,
    };
    let from = summary
        .from
        .clone()
        .or_else(|| match (span, to.as_ref().and_then(|t| t.ms())) {
            (Some(d), Some(t)) => Some(IsoTs::from_ms(t - d)),
            _ => None,
        });
    (from, to)
}

fn closed_view(c: ClosedPositionRow) -> ClosedTradeView {
    ClosedTradeView {
        id: c.id,
        position_key: c.position_key,
        mint: c.mint,
        logo_hash: c.logo_hash,
        strategy_id: c.strategy_id,
        exit_reason: c.exit_reason,
        opened_at: c.opened_at,
        closed_at: c.closed_at,
        sol_in_lamports: c.sol_in_lamports,
        sol_out_lamports: c.sol_out_lamports,
        fees_lamports: c.fees_lamports,
        avg_entry_price_sol: c.avg_entry_price_sol,
        exit_price_sol: c.exit_price_sol,
        pnl_lamports: c.pnl_lamports,
        pnl_pct: c.pnl_pct,
        hold_seconds: c.hold_seconds,
    }
}

/// Next closed-ledger page. `from`/`to` must be the values echoed by `get_pnl_report`; a relative
/// `window` is only used when the caller has no pinned range (never recomputed per page).
#[tauri::command(rename_all = "snake_case")]
pub async fn get_pnl_page(
    state: State<'_, AppState>,
    window: Option<String>,
    from: Option<String>,
    to: Option<String>,
    cursor: Option<String>,
) -> AppResult<ClosedPageView> {
    let w = window.filter(|x| ["24h", "7d", "30d", "all"].contains(&x.as_str()));
    let pinned = from.is_some() || to.is_some();
    let page = state
        .transport
        .closed_positions(ClosedQuery {
            window: (!pinned).then(|| w.unwrap_or_else(|| "7d".to_owned())),
            from,
            to,
            cursor: cursor.filter(|c| !c.is_empty()),
            limit: PNL_PAGE_SIZE,
        })
        .await?;
    Ok(ClosedPageView {
        items: page.items.into_iter().map(closed_view).collect(),
        next_cursor: page.next_cursor,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn open_chart_window<R: Runtime>(app: AppHandle<R>, mint: String) -> AppResult<()> {
    crate::windows::open_chart(&app, &mint)
}

#[tauri::command(rename_all = "snake_case")]
pub fn open_activity_window<R: Runtime>(app: AppHandle<R>) -> AppResult<()> {
    crate::windows::open_activity(&app)
}

#[tauri::command(rename_all = "snake_case")]
pub fn open_approval_window<R: Runtime>(app: AppHandle<R>) -> AppResult<()> {
    crate::windows::open_approval_popup(&app, true)
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_settings<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    mut settings: Settings,
) -> AppResult<Settings> {
    // C19: popup cannot be enabled where the no-focus-steal test has not passed yet.
    settings.approval_popup &= crate::windows::POPUP_SUPPORTED;
    crate::hotkeys::apply(&app, &settings.shortcuts)?;
    state.engine.lock().unwrap().settings = settings.clone();
    if !settings.approval_popup {
        crate::windows::close_approval_popup(&app);
    }
    dispatch(&app, vec![Out::Settings(settings.clone())]);
    Ok(settings)
}

/// Popup → main hand-off ("Buka untuk approve ↗"): focus the terminal and ask it to open the
/// pick with the normal confirmation. Never approves anything itself.
#[tauri::command(rename_all = "snake_case")]
pub fn focus_main_for_signal<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    let known = state
        .engine
        .lock()
        .unwrap()
        .signals
        .iter()
        .any(|s| s.id == id);
    if !known {
        return Err(AppError::SignalNotPending);
    }
    crate::windows::focus_main(&app);
    app.emit_to("main", crate::events::FOCUS_SIGNAL, &id)?;
    Ok(())
}

/// Esc in the popup: hide until the next new pick (no window-API permission needed in the popup).
#[tauri::command(rename_all = "snake_case")]
pub fn hide_approval_popup<R: Runtime>(app: AppHandle<R>) {
    crate::windows::hide_approval_popup(&app);
}

// ---------------------------------------------------------------------------------------------
// Wallet login (SIWS through the system browser). The webview learns only the state + address.
// ---------------------------------------------------------------------------------------------

/// Event carrying [`crate::auth::AuthState`] after every change.
pub const AUTH_STATE: &str = "auth://state";

/// `{mode: "mock"|"static"|"siws", ...AuthState}`. Mock and dev-token builds report `signed_in`.
#[tauri::command(rename_all = "snake_case")]
pub fn auth_status(state: State<'_, AppState>) -> serde_json::Value {
    match state.transport.session() {
        Some(s) => {
            let mut v = serde_json::to_value(s.state()).unwrap_or_default();
            v["mode"] = "siws".into();
            v
        }
        None => {
            serde_json::json!({"mode": state.transport.label(), "state": "signed_in", "address": null, "workspace_id": null})
        }
    }
}

/// Where this run's data comes from + the saved connection settings (Settings → "Koneksi paper").
/// `active` is what is *actually* in use, never what the file says: a failed save must not look connected.
#[tauri::command(rename_all = "snake_case")]
pub fn connection_status(
    state: State<'_, AppState>,
    conn: State<'_, crate::config::ConnectionState>,
) -> serde_json::Value {
    let saved = conn.conn.lock().map(|c| c.clone()).unwrap_or_default();
    let err = conn.error.lock().ok().and_then(|e| e.clone());
    let env_override = std::env::var(crate::config::ENV_BACKEND)
        .map(|v| !v.trim().is_empty() && v.trim() != "mock")
        .unwrap_or(false);
    let active_backend = state.transport.base().map(str::to_owned);
    // True when the saved file names a different API than this run uses: a relaunch is still due.
    let restart_required = !env_override && active_backend != saved.backend;
    serde_json::json!({
        "active": state.transport.label(),
        "active_backend": active_backend,
        "saved_backend": saved.backend,
        "login_url": saved.login_url,
        "error": err,
        // A launcher-set env var always wins; the card then shows "set outside the app" and save is disabled.
        "env_override": env_override,
        "restart_required": restart_required,
    })
}

/// Save the paper API base + login page. A changed API base needs a restart (the transport is built
/// once at startup), and the stored session is dropped so a token from another server is never sent.
/// The login page alone applies immediately.
#[tauri::command(rename_all = "snake_case")]
pub async fn save_connection<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    conn: State<'_, crate::config::ConnectionState>,
    backend: Option<String>,
    login_url: Option<String>,
) -> AppResult<serde_json::Value> {
    if std::env::var(crate::config::ENV_BACKEND)
        .map(|v| !v.trim().is_empty() && v.trim() != "mock")
        .unwrap_or(false)
    {
        return Err(AppError::Invalid(
            "connection is set by CENTURION_BACKEND outside the app".into(),
        ));
    }
    // A page supplied by a dev launcher counts, so the saved file need not repeat it.
    let env_login = std::env::var(crate::config::ENV_LOGIN_URL)
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false);
    let next = crate::config::Connection { backend, login_url }
        .validated_for_save(env_login)
        .map_err(AppError::Invalid)?;
    let active = state.transport.base().map(str::to_owned);
    let backend_changed = active != next.backend;
    if backend_changed {
        // Drop the old session BEFORE the file names the new server: a crash between the two steps
        // must not leave a token for server A next to a config that points at server B.
        if let Some(sm) = state.transport.session().cloned() {
            sm.logout().await;
            use tauri::Emitter;
            let _ = app.emit(AUTH_STATE, sm.state());
        }
    }
    crate::config::save(&next).map_err(AppError::Invalid)?;
    if let Some(page) = next.login_page() {
        std::env::set_var(crate::config::ENV_LOGIN_URL, page);
    } else {
        std::env::remove_var(crate::config::ENV_LOGIN_URL);
    }
    *conn.conn.lock().unwrap() = next;
    *conn.error.lock().unwrap() = None;
    Ok(serde_json::json!({ "saved": true, "restart_required": backend_changed }))
}

/// Start a browser login: bind the loopback, open the system browser, return at once. The result
/// arrives as [`AUTH_STATE`] events (`signed_in` / `wallet_not_allowed` / `failed` / `signed_out`).
#[tauri::command(rename_all = "snake_case")]
pub async fn auth_login<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    use tauri::Emitter;
    let Some(sm) = state.transport.session().cloned() else {
        return Ok(());
    };
    if matches!(sm.state(), crate::auth::AuthState::WaitingForBrowser) {
        return Ok(()); // one login at a time
    }
    let page = match std::env::var(crate::config::ENV_LOGIN_URL) {
        Ok(v) if !v.trim().is_empty() => v,
        // Only reached with a wallet session, i.e. a paper API. Saving such a config now requires
        // the page, so this is a hand-edited file or a removed env var: say so instead of opening
        // the placeholder host and waiting five minutes for a callback.
        _ => return Err(AppError::Invalid("login_page_required".into())),
    };
    if crate::deeplink::handoff_enabled() {
        // API 4.1.1 deep-link hand-off: state + PKCE (S256) made here; the browser returns only a one-time code.
        let pending = app.state::<crate::deeplink::PendingLogins>();
        let (st, challenge) = pending.start().map_err(AppError::Invalid)?;
        let url = crate::auth::handoff_url(&page, &st, &challenge).map_err(AppError::Invalid)?;
        if let Err(e) = crate::auth::open_system_browser(&url) {
            pending.cancel();
            return Err(AppError::Invalid(e));
        }
        sm.set_state(crate::auth::AuthState::WaitingForBrowser);
        let _ = app.emit(AUTH_STATE, sm.state());
        return Ok(());
    }
    let lb = crate::auth::Loopback::bind()
        .await
        .map_err(AppError::Invalid)?;
    let url =
        crate::auth::login_url(&page, &lb.redirect_uri(), lb.state()).map_err(AppError::Invalid)?;
    crate::auth::open_system_browser(&url).map_err(AppError::Invalid)?;
    sm.set_state(crate::auth::AuthState::WaitingForBrowser);
    let _ = app.emit(AUTH_STATE, sm.state());
    let domain = crate::auth::login_domain(&page);
    tauri::async_runtime::spawn(async move {
        let st = match lb.wait(crate::auth::LOGIN_TIMEOUT).await {
            Ok(cb) => sm.complete(&cb, &domain).await,
            Err(code) => {
                let st = if code == "user_rejected" {
                    crate::auth::AuthState::SignedOut { reason: Some(code) }
                } else {
                    crate::auth::AuthState::Failed { code }
                };
                sm.set_state(st.clone());
                st
            }
        };
        let _ = app.emit(AUTH_STATE, st);
    });
    Ok(())
}

/// A `centurion://auth?code=&state=` URL from the OS (second-launch argv). Strict local checks (scheme, host,
/// path, exactly code+state, state match, 43-char code, single use, TTL), then ONE exchange; a refused code is
/// never retried (state `sign_in_again`). Anything else is logged and dropped (no state change).
pub fn handle_deep_link<R: Runtime>(app: &AppHandle<R>, url: &str) {
    use tauri::{Emitter, Manager};
    let st = app.state::<AppState>();
    let Some(sm) = st.transport.session().cloned() else {
        return log::warn!("deep link ignored: not a SIWS build");
    };
    let accepted = app.state::<crate::deeplink::PendingLogins>().accept(url);
    let code = match accepted {
        Ok(c) => c,
        Err(why) => return log::warn!("deep link refused: {why}"), // never log the URL (it carries the code)
    };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let st = sm.complete_exchange(&code).await;
        let _ = app.emit(AUTH_STATE, st);
    });
}

/// Revoke the refresh token on the server (best effort) and clear the keychain entry.
#[tauri::command(rename_all = "snake_case")]
pub async fn auth_logout<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    use tauri::Emitter;
    if let Some(sm) = state.transport.session().cloned() {
        sm.logout().await;
        let _ = app.emit(AUTH_STATE, sm.state());
    }
    Ok(())
}

/// STOP (one command for every entry point; see `stop.rs`): pause every running strategy in the current
/// mode with If-Match = its cached rev. Already paused strategies are left alone. Validated arguments only.
#[tauri::command(rename_all = "snake_case")]
pub async fn stop_trading<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    mode: String,
    source: String,
    confirm: String,
) -> AppResult<crate::stop::StopResult> {
    let (current, strategies) = {
        let e = state.engine.lock().unwrap();
        (e.mode, e.strategies_vec())
    };
    let req = crate::stop::StopRequest::parse(&mode, current, &source, &confirm)
        .map_err(|w| AppError::Invalid(format!("stop: {w}")))?;
    log::info!("stop requested via {:?} in {:?}", req.source, req.mode);
    let mut out = crate::stop::StopResult::default();
    for s in strategies {
        if s.status == "paused" {
            out.already_paused.push(s.id);
            continue;
        }
        let idem = idem_key(&state);
        match state
            .transport
            .set_strategy_paused(&s.id, &idem, Some(s.rev), true)
            .await
        {
            Ok(r) => {
                let o = {
                    let mut e = state.engine.lock().unwrap();
                    e.observe_server_now(&r.server_now);
                    e.set_strategies(std::slice::from_ref(&r.data))
                };
                dispatch(&app, vec![o]);
                out.paused.push(s.id);
            }
            Err(e) => out.failed.push((s.id, e.code().to_owned())),
        }
    }
    Ok(out)
}
