use common::{CoinKey, Dec, Lamports, Mint, RawAmount, TsMs};
use serde_json::Value;

/// Mirrors SQL enum `pick_stage`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PickStage {
    Found,
    Rejected,
    Blocked,
    Passed,
    AwaitingApproval,
    Armed,
    Expired,
    Bought,
    Closed,
}

impl PickStage {
    pub fn as_str(self) -> &'static str {
        match self {
            PickStage::Found => "found",
            PickStage::Rejected => "rejected",
            PickStage::Blocked => "blocked",
            PickStage::Passed => "passed",
            PickStage::AwaitingApproval => "awaiting_approval",
            PickStage::Armed => "armed",
            PickStage::Expired => "expired",
            PickStage::Bought => "bought",
            PickStage::Closed => "closed",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct PickRecord {
    pub ck: CoinKey,
    pub workspace_id: String,
    pub strategy_id: String,
    pub mint: Mint,
    pub stage: PickStage,
    pub score: Option<f64>,
    pub pass_mark: Option<f64>,
    pub checks: Value,
    pub guard: Value,
    pub updated_at: TsMs,
}

/// Mirrors `public.fills` (integers for amounts, numeric for prices).
#[derive(Debug, Clone, PartialEq)]
pub struct FillRecord {
    pub position_key: String,
    pub workspace_id: String,
    pub side: &'static str,
    pub simulated: bool,
    pub tx_sig: Option<String>,
    pub sol_lamports: Lamports,
    pub token_amount_raw: RawAmount,
    pub exec_price_sol: Dec,
    pub swap_fee_lamports: Lamports,
    pub network_fee_lamports: Lamports,
    pub slippage_bps: Dec,
    pub latency_ms: u64,
    pub ts: TsMs,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobStatus {
    Queued,
    Running,
    Done,
    Failed,
    Dead,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Job {
    pub id: i64,
    pub workspace_id: String,
    pub kind: String,
    pub payload: Value,
    pub status: JobStatus,
    pub attempts: u32,
    pub max_attempts: u32,
    pub dedupe_key: Option<String>,
}
