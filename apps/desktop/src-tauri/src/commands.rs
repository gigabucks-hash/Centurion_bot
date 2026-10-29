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
use tauri::{AppHandle, Emitter, Runtime, State, Window};

fn idem_key(state: &AppState) -> String {
    format!("desk-{}", state.engine.lock().unwrap().rng.hex(24))
}

/// Map a failed write to the UI. 409 → conflict toast (`write:conflict`) + refresh from the
/// server's `current` resource; 428 → client bug (logged, never retried blindly).
fn on_write_error<R: Runtime>(app: &AppHandle<R>, state: &AppState, resource: &str, id: &str, e: ApiFailure) -> AppError {
    match &e {
        ApiFailure::Conflict(c) => {
            let view = ConflictView {
                code: c.code.clone(),
                resource: resource.into(),
                resource_id: id.into(),
                base_rev: c.base_rev,
                current_rev: c.current_rev,
                changed_fields: c.changed_fields.iter().map(|f| crate::model::plain_text(f, 40)).collect(),
                changed_via: c.changed_by.as_ref().and_then(|b| b.via.as_deref().map(|v| crate::model::plain_text(v, 16))),
                changed_at: c.changed_at.clone(),
                restart_confirmation: e.restart_confirmation(),
                message: e.to_string(),
            };
            let mut outs = vec![Out::Conflict(view)];
            if resource == "strategy" {
                if let Some(cur) = c.current.clone().and_then(|v| serde_json::from_value::<StrategySummary>(v).ok()) {
                    outs.push(state.engine.lock().unwrap().set_strategies(&[cur]));
                } else {
                    state.engine.lock().unwrap().refetch_strategies = true;
                }
            }
            let note = state.engine.lock().unwrap().note(Actor::User, Tone::Bad, e.to_string());
            outs.push(note);
            dispatch(app, outs);
        }
        ApiFailure::PreconditionRequired => log::error!("428 on {resource} {id}: write sent without If-Match"),
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
async fn decide(state: &AppState, id: &str, decision: Decision) -> AppResult<()> {
    let t = state.transport.clone();
    for attempt in 0..2 {
        let key = idem_key(state);
        let a = t.get_approval(id).await?;
        state.engine.lock().unwrap().observe_server_now(&a.server_now);
        let Some(token) = a.data.decision_token else { return Err(AppError::SignalNotPending) };
        let req = ApprovalDecisionRequest { decision: decision.clone(), token, expected_rev: a.data.version, reason: None };
        match t.decide(id, &key, req).await {
            Ok(r) => {
                state.engine.lock().unwrap().observe_server_now(&r.server_now);
                return Ok(());
            }
            Err(ref e) if e.code() == "VERSION_CONFLICT" && attempt == 0 => continue,
            Err(e) => return Err(e.into()),
        }
    }
    Err(AppError::Api("VERSION_CONFLICT".into()))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn approve_signal<R: Runtime>(window: Window<R>, state: State<'_, AppState>, id: String) -> AppResult<()> {
    {
        let e = state.engine.lock().unwrap();
        crate::state::check_approve_origin(window.label(), e.mode)?;
        let pick = e.check_pending(&id)?;
        // WF-20: a not-tradeable coin can never be approved (UI disables the button too).
        e.check_tradeable(&pick.mint)?;
    }
    decide(&state, &id, Decision::Approve).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn skip_signal(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.engine.lock().unwrap().check_pending(&id)?;
    decide(&state, &id, Decision::Reject).await
}

/// Batch approve (UX: Practice picks only; API `/batch-decision` is buy_pick-only). The mock
/// transport has no batch endpoint yet, so items are decided one by one.
#[tauri::command(rename_all = "snake_case")]
pub async fn approve_many<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>, ids: Vec<String>) -> AppResult<()> {
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
            e.check_pending(id).and_then(|p| e.check_tradeable(&p.mint)).is_ok()
        };
        if !ok || decide(&state, id, Decision::Approve).await.is_err() {
            failed += 1;
        }
    }
    if failed > 0 {
        let o = state.engine.lock().unwrap().note(Actor::User, Tone::Bad, format!("Batch: {failed}/{} gagal (sudah diputus/expired)", ids.len()));
        dispatch(&app, vec![o]);
    }
    Ok(())
}

/// Step 1 of 2: local confirmation gate (nonce + estimate). Nothing is sent to the backend.
#[tauri::command(rename_all = "snake_case")]
pub fn request_sell(state: State<'_, AppState>, position_key: String, pct: u8) -> AppResult<SellQuote> {
    if position_key.len() > 80 {
        return Err(AppError::Invalid("position_key".into()));
    }
    state.engine.lock().unwrap().request_sell(&position_key, pct)
}

/// Step 2 of 2: consume the nonce, then `POST /v1/workspaces/{ws}/positions/{id}/close
/// {fraction_bps}` + `If-Match: "<position rev>"` + `Idempotency-Key` (contracts 1.1.2). Blocked locally when the coin
/// is not tradeable (WF-20).
#[tauri::command(rename_all = "snake_case")]
pub async fn confirm_sell<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>, nonce: String) -> AppResult<()> {
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
pub async fn set_strategy_paused<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>, id: String, paused: bool, base_rev: u64) -> AppResult<StrategyView> {
    if id.len() > 64 {
        return Err(AppError::Invalid("id".into()));
    }
    let idem = idem_key(&state);
    match state.transport.set_strategy_paused(&id, &idem, Some(base_rev), paused).await {
        Ok(r) => {
            let out = {
                let mut e = state.engine.lock().unwrap();
                e.observe_server_now(&r.server_now);
                e.set_strategies(std::slice::from_ref(&r.data))
            };
            dispatch(&app, vec![out]);
            let v = state.engine.lock().unwrap().strategies_vec().into_iter().find(|s| s.id == id);
            v.ok_or(AppError::Invalid("strategy".into()))
        }
        Err(e) => Err(on_write_error(&app, &state, "strategy", &id, e)),
    }
}

/// `POST /workspaces/{ws}/practice/reset` with `If-Match` workspace rev. The UI asks for an
/// explicit confirmation first; the result arrives as `practice.reset` on the stream.
#[tauri::command(rename_all = "snake_case")]
pub async fn reset_practice<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>) -> AppResult<()> {
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
            state.engine.lock().unwrap().observe_server_now(&r.server_now);
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
pub async fn get_coin_timeline(state: State<'_, AppState>, mint: String) -> AppResult<Vec<TimelineItem>> {
    if !is_valid_mint(&mint) {
        return Err(AppError::Invalid("mint".into()));
    }
    let r = state.transport.coin_timeline(&mint).await?;
    Ok(r.items.iter().rev().take(50).map(|e| TimelineItem { seq: e.seq, ts: e.ts.clone(), kind: e.kind.clone(), actor: e.actor }).collect())
}

/// `GET /stats/exit-reasons?window=24h`.
#[tauri::command(rename_all = "snake_case")]
pub async fn get_exit_reason_stats(state: State<'_, AppState>) -> AppResult<Vec<ExitReasonStatView>> {
    let r = state.transport.exit_reason_stats("24h").await?;
    Ok(r.data.iter().map(|x| ExitReasonStatView { exit_reason: x.exit_reason, label: crate::keys::exit_label(x.exit_reason).into(), count: x.count, pnl_lamports: x.pnl_lamports, avg_pnl_pct: x.avg_pnl_pct, win_rate_pct: x.win_rate_pct, avg_hold_s: x.avg_hold_s }).collect())
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
pub fn set_settings<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>, mut settings: Settings) -> AppResult<Settings> {
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
pub fn focus_main_for_signal<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>, id: String) -> AppResult<()> {
    let known = state.engine.lock().unwrap().signals.iter().any(|s| s.id == id);
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
