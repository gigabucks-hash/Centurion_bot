//! Single source of truth for cash / equity / drawdown. The worker calls [`compute_snapshot`]
//! after every fill (and every <= 60 s with fresh marks) and appends the result to
//! `portfolio_snapshots`; every API surface (overview, stats, equity chart, `portfolio.snapshot`
//! event) reads that table, so the numbers can never disagree. Integer maths only; the CHECK
//! constraints in SQL recompute the same identities.
use crate::{Lamports, SignedLamports};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OpenLot {
    /// SOL spent on the remaining qty (incl. fees), lamports.
    pub cost_lamports: u64,
    /// Remaining qty valued at the latest mark, lamports.
    pub value_lamports: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotInputs {
    pub start_lamports: u64,
    /// Sum of sell proceeds net of fees.
    pub sell_proceeds_lamports: u64,
    /// Sum of buy costs incl. swap + network/priority fees.
    pub buy_cost_lamports: u64,
    pub realized_pnl_lamports: i64,
    pub open: Vec<OpenLot>,
    pub prev_peak_equity_lamports: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Snapshot {
    pub cash: Lamports,
    pub positions_cost: Lamports,
    pub positions_value: Lamports,
    pub equity: Lamports,
    pub peak_equity: Lamports,
    pub drawdown_bps: u32,
    pub realized_pnl: SignedLamports,
    pub unrealized_pnl: SignedLamports,
    pub open_positions: u32,
}

impl Snapshot {
    /// `drawdown_pct` wire value, e.g. 841 bps -> "8.41".
    pub fn drawdown_pct_string(&self) -> String {
        format!("{}.{:02}", self.drawdown_bps / 100, self.drawdown_bps % 100)
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum SnapshotError {
    #[error("paper cash went negative ({0} lamports): accounting bug or overspend")]
    NegativeCash(i128),
}

pub fn compute_snapshot(i: &SnapshotInputs) -> Result<Snapshot, SnapshotError> {
    let cash = i128::from(i.start_lamports) + i128::from(i.sell_proceeds_lamports) - i128::from(i.buy_cost_lamports);
    if cash < 0 {
        return Err(SnapshotError::NegativeCash(cash));
    }
    let value: u128 = i.open.iter().map(|p| u128::from(p.value_lamports)).sum();
    let cost: u128 = i.open.iter().map(|p| u128::from(p.cost_lamports)).sum();
    let equity = cash as u128 + value;
    let peak = equity.max(u128::from(i.prev_peak_equity_lamports)).max(u128::from(i.start_lamports));
    let drawdown_bps = if peak == 0 { 0 } else { ((peak - equity) * 10_000 / peak) as u32 };
    Ok(Snapshot {
        cash: Lamports(cash as u64),
        positions_cost: Lamports(cost as u64),
        positions_value: Lamports(value as u64),
        equity: Lamports(equity as u64),
        peak_equity: Lamports(peak as u64),
        drawdown_bps,
        realized_pnl: SignedLamports(i.realized_pnl_lamports),
        unrealized_pnl: SignedLamports(value as i64 - cost as i64),
        open_positions: i.open.len() as u32,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equity_and_drawdown_match_sql_identities() {
        let s = compute_snapshot(&SnapshotInputs {
            start_lamports: 30_000_000_000,
            sell_proceeds_lamports: 10_000_000_000,
            buy_cost_lamports: 13_708_000_000,
            realized_pnl_lamports: -2_506_000_000,
            open: vec![OpenLot { cost_lamports: 1_202_000_000, value_lamports: 1_186_000_000 }],
            prev_peak_equity_lamports: 30_000_000_000,
        })
        .expect("snapshot");
        assert_eq!(s.cash, Lamports(26_292_000_000));
        assert_eq!(s.equity.0, s.cash.0 + s.positions_value.0);
        assert_eq!(s.equity, Lamports(27_478_000_000));
        assert_eq!(s.unrealized_pnl, SignedLamports(-16_000_000));
        assert_eq!(s.drawdown_bps, 840); // integer division, same as SQL ::int cast of (30e9-27.478e9)*1e4/30e9
        assert_eq!(s.drawdown_pct_string(), "8.40");
    }

    #[test]
    fn negative_cash_is_an_error() {
        let r = compute_snapshot(&SnapshotInputs {
            start_lamports: 1,
            sell_proceeds_lamports: 0,
            buy_cost_lamports: 2,
            realized_pnl_lamports: 0,
            open: vec![],
            prev_peak_equity_lamports: 0,
        });
        assert!(r.is_err());
    }
}
