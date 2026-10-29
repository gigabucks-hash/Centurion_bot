//! `order.failed` payloads: every rejected simulated fill is reported with a stable reason code
//! from `errors.json` (UX notification N-05).
use common::{ErrorCode, Lamports, Mode, QuoteAsset};
use serde::Serialize;

use crate::executor::ExecError;
use crate::model::{Order, PoolState, Side, SimError};

impl SimError {
    pub fn reason_code(&self) -> ErrorCode {
        match self {
            SimError::InvalidOrder(_) => ErrorCode::ValidationFailed,
            SimError::EmptyPool => ErrorCode::PoolStale,
            SimError::SlippageExceeded { .. } => ErrorCode::SlippageExceeded,
            SimError::UnsupportedQuoteMint { .. } => ErrorCode::UnsupportedQuoteMint,
        }
    }
}

impl ExecError {
    pub fn reason_code(&self) -> ErrorCode {
        match self {
            ExecError::Sim(e) => e.reason_code(),
            ExecError::LiveDisabled => ErrorCode::ModeNotAllowed,
        }
    }
}

/// Wire payload of `order.failed`. Token metadata (symbol) travels in the envelope's `untrusted` field.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct OrderFailed {
    pub order_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proposal_id: Option<String>,
    pub mint: String,
    pub side: Side,
    /// Buys: SOL in, as a lamport string. Sells: `null` (see `qty_raw`).
    pub amount_lamports: Option<String>,
    /// Sells: tokens in, raw units as a string.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qty_raw: Option<String>,
    pub reason_code: ErrorCode,
    pub detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quote_mint: Option<String>,
    pub mode: Mode,
    pub server_now: String,
}

/// Reason a buy could not even be simulated because no usable pool exists.
pub fn no_pool_reason(quote_mint: Option<&str>) -> ErrorCode {
    if common::is_sol_quote(quote_mint) {
        ErrorCode::PoolStale
    } else {
        ErrorCode::UnsupportedQuoteMint
    }
}

#[allow(clippy::too_many_arguments)]
pub fn order_failed(
    order_id: &str,
    proposal_id: Option<&str>,
    mint: &str,
    order: &Order,
    token_decimals: u8,
    reason_code: ErrorCode,
    detail: String,
    pool: Option<&PoolState>,
    quote_mint: Option<&str>,
    server_now: String,
) -> OrderFailed {
    let (amount_lamports, qty_raw) = match order.side {
        Side::Buy => (
            Lamports::from_sol_f64(order.amount_in)
                .ok()
                .map(|l| l.0.to_string()),
            None,
        ),
        Side::Sell => (
            None,
            Some(format!(
                "{:.0}",
                order.amount_in * 10f64.powi(i32::from(token_decimals))
            )),
        ),
    };
    let quote = quote_mint.map(str::to_string).or_else(|| {
        pool.filter(|p| p.quote != QuoteAsset::Sol)
            .map(|p| p.quote.mint())
    });
    OrderFailed {
        order_id: order_id.to_string(),
        proposal_id: proposal_id.map(str::to_string),
        mint: mint.to_string(),
        side: order.side,
        amount_lamports,
        qty_raw,
        reason_code,
        detail,
        quote_mint: quote,
        mode: Mode::Practice,
        server_now,
    }
}

/// Build the `order.failed` payload for an executor error.
#[allow(clippy::too_many_arguments)]
pub fn order_failed_from(
    order_id: &str,
    proposal_id: Option<&str>,
    mint: &str,
    order: &Order,
    token_decimals: u8,
    pool: &PoolState,
    err: &ExecError,
    server_now: String,
) -> OrderFailed {
    order_failed(
        order_id,
        proposal_id,
        mint,
        order,
        token_decimals,
        err.reason_code(),
        err.to_string(),
        Some(pool),
        None,
        server_now,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::executor::{Executor, PaperExecutor};

    const MINT: &str = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";

    async fn fail(pool: PoolState, order: Order) -> serde_json::Value {
        // adverse drift so a tight max slippage trips deterministically
        let ex = PaperExecutor::new(crate::model::SimConfig {
            adverse_drift_bps_per_sec: 100.0,
            ..Default::default()
        });
        let err = ex.execute(&order, &pool).await.expect_err("must fail");
        let p = order_failed_from(
            "ord_1",
            Some("prop_1"),
            MINT,
            &order,
            6,
            &pool,
            &err,
            "2026-10-29T09:00:00.000Z".into(),
        );
        let v = serde_json::to_value(&p).expect("ser");
        common::units::assert_wire_numbers(&v);
        v
    }

    #[tokio::test]
    async fn rejected_fills_map_to_reason_codes() {
        let sol = PoolState {
            sol_reserve: 30.0,
            token_reserve: 1e9,
            quote: QuoteAsset::Sol,
        };
        let buy = |sol: f64, bps| Order {
            side: Side::Buy,
            amount_in: sol,
            max_slippage_bps: bps,
        };

        let v = fail(sol, buy(25.0, 10)).await;
        assert_eq!(v["reason_code"], "SLIPPAGE_EXCEEDED");
        assert_eq!(v["amount_lamports"], "25000000000");
        assert_eq!(v["side"], "buy");
        assert_eq!(v["mode"], "practice");
        assert_eq!(v["proposal_id"], "prop_1");

        let q = QuoteAsset::parse("pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn").expect("q");
        let v = fail(PoolState { quote: q, ..sol }, buy(0.1, 1500)).await;
        assert_eq!(v["reason_code"], "UNSUPPORTED_QUOTE_MINT");
        assert_eq!(
            v["quote_mint"],
            "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn"
        );

        let v = fail(
            PoolState {
                sol_reserve: 0.0,
                ..sol
            },
            buy(0.1, 1500),
        )
        .await;
        assert_eq!(v["reason_code"], "POOL_STALE");

        let v = fail(sol, buy(-1.0, 1500)).await;
        assert_eq!(v["reason_code"], "VALIDATION_FAILED");
        assert_eq!(v["amount_lamports"], serde_json::Value::Null);

        let sell = Order {
            side: Side::Sell,
            amount_in: 0.0,
            max_slippage_bps: 1500,
        };
        let v = fail(sol, sell).await;
        assert_eq!(v["qty_raw"], "0");
        assert_eq!(v["amount_lamports"], serde_json::Value::Null);
    }

    #[test]
    fn no_pool_reason_respects_quote() {
        assert_eq!(no_pool_reason(None), ErrorCode::PoolStale);
        assert_eq!(
            no_pool_reason(Some(common::WSOL_MINT)),
            ErrorCode::PoolStale
        );
        assert_eq!(
            no_pool_reason(Some("pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn")),
            ErrorCode::UnsupportedQuoteMint
        );
    }
}
