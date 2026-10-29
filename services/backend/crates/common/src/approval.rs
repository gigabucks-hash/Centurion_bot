//! Approval (proposal) model. One model for both clients:
//! * Web: `POST /v1/approvals/{id}/decision` with `Idempotency-Key` + `expected_version`.
//! * Flutter: Supabase RPC `decide_approval(p_approval_id, p_token, p_decision, p_expected_rev, p_client)`.
//!
//! Both end in the SQL function `public.decide_approval` (supabase/migrations/0001_init.sql), which
//! implements exactly [`decide`]. The *backend* owns `expires_at`; the worker owns expiry
//! transitions ([`expire`]); no DB trigger moves state.
use serde::{Deserialize, Serialize};

use crate::{error_codes::ErrorCode, ExpireReason, TsMs};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalKind {
    /// A buy of a pick (strategy) or a portfolio pick. `first_buy` flags the first one.
    BuyPick,
    /// Strategy settings change; `weakening` marks guard/screener loosening.
    GuardChange,
    /// sell_all, stop_all, resume_all, reset_paper (payload.action).
    TeamAction,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalStatus {
    Pending,
    Approved,
    /// UI label: "Skipped".
    Rejected,
    Expired,
}

impl ApprovalStatus {
    /// Mirrors the SQL `approvals_guard` transition table. `approved -> expired` covers an approved
    /// buy whose strategy is retired before the job executes.
    pub fn can_transition_to(self, next: ApprovalStatus) -> bool {
        use ApprovalStatus::*;
        matches!(
            (self, next),
            (Pending, Approved | Rejected | Expired) | (Approved, Expired)
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Decision {
    Approve,
    Reject,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DecidedVia {
    Web,
    Mobile,
    Desktop,
    Mcp,
    Push,
}

/// Strategy/portfolio setting `approval_mode`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalMode {
    Off,
    #[default]
    AskFirstBuy,
    AskEveryBuy,
}

/// Does this buy need a human approval?
/// `ask_first_buy` covers BOTH the first buy of the strategy/portfolio and the first buy of each
/// coin. A themed portfolio in `ask` autonomy passes `AskEveryBuy`; its first buy is never exempt.
pub fn buy_needs_approval(
    mode: ApprovalMode,
    first_buy_of_owner: bool,
    first_buy_of_coin: bool,
) -> bool {
    match mode {
        ApprovalMode::Off => false,
        ApprovalMode::AskEveryBuy => true,
        ApprovalMode::AskFirstBuy => first_buy_of_owner || first_buy_of_coin,
    }
}

/// Server-side TTLs (per workspace, from `workspaces.*_ttl_seconds`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApprovalTtls {
    pub pick_seconds: u32,
    pub guard_change_seconds: u32,
    pub team_action_seconds: u32,
}

impl Default for ApprovalTtls {
    fn default() -> Self {
        Self {
            pick_seconds: 600,
            guard_change_seconds: 86_400,
            team_action_seconds: 3_600,
        }
    }
}

impl ApprovalTtls {
    pub fn expires_at(&self, kind: ApprovalKind, created_at: TsMs) -> TsMs {
        let secs = match kind {
            ApprovalKind::BuyPick => self.pick_seconds,
            ApprovalKind::GuardChange => self.guard_change_seconds,
            ApprovalKind::TeamAction => self.team_action_seconds,
        };
        created_at + i64::from(secs) * 1000
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Approval {
    pub kind: ApprovalKind,
    pub status: ApprovalStatus,
    pub version: u32,
    pub expires_at: TsMs,
    /// sha256 of the single-use decision token in the DB; compared in constant time.
    pub token_hash: String,
    pub expire_reason: Option<ExpireReason>,
    /// Guard weakening and team actions must be decided in a first-party app (not MCP).
    pub requires_app: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecisionRequest {
    pub token_hash: String,
    pub decision: Decision,
    pub expected_version: u32,
    pub via: DecidedVia,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DecisionOutcome {
    pub status: ApprovalStatus,
    pub version: u32,
    /// Same token + same decision seen before: return the stored result (idempotent).
    pub replayed: bool,
}

/// Apply a user decision (reference semantics for `public.decide_approval`).
pub fn decide(
    a: &mut Approval,
    r: &DecisionRequest,
    now: TsMs,
) -> Result<DecisionOutcome, ErrorCode> {
    if !ct_eq(a.token_hash.as_bytes(), r.token_hash.as_bytes()) {
        return Err(ErrorCode::ApprovalTokenInvalid);
    }
    if a.requires_app && r.via == DecidedVia::Mcp {
        return Err(ErrorCode::ApprovalRequiresApp);
    }
    match (a.status, r.decision) {
        (ApprovalStatus::Approved, Decision::Approve)
        | (ApprovalStatus::Rejected, Decision::Reject) => {
            return Ok(DecisionOutcome {
                status: a.status,
                version: a.version,
                replayed: true,
            })
        }
        (ApprovalStatus::Approved | ApprovalStatus::Rejected, _) => {
            return Err(ErrorCode::ApprovalAlreadyDecided)
        }
        (ApprovalStatus::Expired, _) => return Err(ErrorCode::ApprovalExpired),
        (ApprovalStatus::Pending, _) => {}
    }
    if now >= a.expires_at {
        // Sweeper hasn't run yet; refuse without mutating (the worker owns expiry).
        return Err(ErrorCode::ApprovalExpired);
    }
    if r.expected_version != a.version {
        return Err(ErrorCode::VersionConflict);
    }
    a.status = match r.decision {
        Decision::Approve => ApprovalStatus::Approved,
        Decision::Reject => ApprovalStatus::Rejected,
    };
    a.version += 1;
    Ok(DecisionOutcome {
        status: a.status,
        version: a.version,
        replayed: false,
    })
}

/// Worker-owned transition (sweeper or `retire_strategy`). Returns false if not expirable.
pub fn expire(a: &mut Approval, reason: ExpireReason) -> bool {
    if !a.status.can_transition_to(ApprovalStatus::Expired) {
        return false;
    }
    a.status = ApprovalStatus::Expired;
    a.expire_reason = Some(reason);
    a.version += 1;
    true
}

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pending() -> Approval {
        Approval {
            kind: ApprovalKind::BuyPick,
            status: ApprovalStatus::Pending,
            version: 1,
            expires_at: ApprovalTtls::default().expires_at(ApprovalKind::BuyPick, 0),
            token_hash: "h1".into(),
            expire_reason: None,
            requires_app: false,
        }
    }
    fn req(d: Decision, v: u32) -> DecisionRequest {
        DecisionRequest {
            token_hash: "h1".into(),
            decision: d,
            expected_version: v,
            via: DecidedVia::Mobile,
        }
    }

    #[test]
    fn ask_first_buy_covers_first_portfolio_buy() {
        assert!(buy_needs_approval(ApprovalMode::AskFirstBuy, true, false));
        assert!(buy_needs_approval(ApprovalMode::AskFirstBuy, false, true));
        assert!(!buy_needs_approval(ApprovalMode::AskFirstBuy, false, false));
        assert!(buy_needs_approval(ApprovalMode::AskEveryBuy, false, false));
        assert!(!buy_needs_approval(ApprovalMode::Off, true, true));
    }

    #[test]
    fn ttls_are_server_side_defaults() {
        let t = ApprovalTtls::default();
        assert_eq!(t.expires_at(ApprovalKind::BuyPick, 0), 600_000);
        assert_eq!(t.expires_at(ApprovalKind::GuardChange, 0), 86_400_000);
    }

    #[test]
    fn transitions_match_sql() {
        use ApprovalStatus::*;
        assert!(Pending.can_transition_to(Expired));
        assert!(Approved.can_transition_to(Expired));
        assert!(!Approved.can_transition_to(Rejected));
        assert!(!Expired.can_transition_to(Approved));
    }

    #[test]
    fn approve_is_idempotent_by_token() {
        let mut a = pending();
        let o = decide(&mut a, &req(Decision::Approve, 1), 1).expect("approve");
        assert_eq!(
            (o.status, o.version, o.replayed),
            (ApprovalStatus::Approved, 2, false)
        );
        let o2 = decide(&mut a, &req(Decision::Approve, 1), 2).expect("replay");
        assert!(o2.replayed);
        assert_eq!(o2.version, 2);
    }

    #[test]
    fn conflicts_are_409() {
        let mut a = pending();
        assert_eq!(
            decide(&mut a, &req(Decision::Approve, 9), 1),
            Err(ErrorCode::VersionConflict)
        );
        decide(&mut a, &req(Decision::Approve, 1), 1).expect("approve");
        assert_eq!(
            decide(&mut a, &req(Decision::Reject, 2), 1),
            Err(ErrorCode::ApprovalAlreadyDecided)
        );
        assert_eq!(ErrorCode::VersionConflict.http_status(), 409);
        assert_eq!(ErrorCode::ApprovalAlreadyDecided.http_status(), 409);
    }

    #[test]
    fn expiry_token_and_mcp_rules() {
        let mut a = pending();
        assert_eq!(
            decide(&mut a, &req(Decision::Approve, 1), 600_000),
            Err(ErrorCode::ApprovalExpired)
        );
        let mut bad = req(Decision::Approve, 1);
        bad.token_hash = "nope".into();
        assert_eq!(
            decide(&mut a, &bad, 1),
            Err(ErrorCode::ApprovalTokenInvalid)
        );
        let mut g = pending();
        g.requires_app = true;
        let mut m = req(Decision::Approve, 1);
        m.via = DecidedVia::Mcp;
        assert_eq!(decide(&mut g, &m, 1), Err(ErrorCode::ApprovalRequiresApp));
        assert!(expire(&mut a, ExpireReason::StrategyDeleted));
        assert!(!expire(&mut a, ExpireReason::Timeout));
        assert_eq!(a.expire_reason, Some(ExpireReason::StrategyDeleted));
    }
}
