//! Early-buy analysis: bundled (same-slot) buys and same-size clusters.
use std::collections::{BTreeMap, HashMap, HashSet};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EarlyBuy {
    pub slot: u64,
    pub wallet: String,
    /// Tokens received as % of total supply.
    pub supply_pct: f64,
    pub sol_in: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct EarlyBuyStats {
    /// % of supply bought by wallets that landed in a slot with >= `min_wallets` distinct buyers.
    pub bundled_pct: f64,
    pub bundled_wallets: usize,
    /// Largest group of distinct wallets that spent (almost) the same SOL amount.
    pub same_size_cluster: usize,
}

/// `min_wallets`: distinct buyers in one slot to count as a bundle (typ. 3).
/// `size_tolerance`: relative tolerance for same-size buys (typ. 0.01 = 1%).
pub fn analyze_early_buys(
    buys: &[EarlyBuy],
    min_wallets: usize,
    size_tolerance: f64,
) -> EarlyBuyStats {
    let mut by_slot: BTreeMap<u64, Vec<&EarlyBuy>> = BTreeMap::new();
    for b in buys {
        by_slot.entry(b.slot).or_default().push(b);
    }
    let mut bundled: HashMap<&str, f64> = HashMap::new();
    for group in by_slot.values() {
        let wallets: HashSet<&str> = group.iter().map(|b| b.wallet.as_str()).collect();
        if wallets.len() >= min_wallets {
            for b in group {
                *bundled.entry(b.wallet.as_str()).or_default() += b.supply_pct;
            }
        }
    }

    let mut sizes: Vec<(&str, f64)> = buys
        .iter()
        .filter(|b| b.sol_in > 0.0)
        .map(|b| (b.wallet.as_str(), b.sol_in))
        .collect();
    sizes.sort_by(|a, b| a.1.total_cmp(&b.1));
    let mut best = 0usize;
    for i in 0..sizes.len() {
        let base = sizes[i].1;
        let mut ws = HashSet::new();
        for s in &sizes[i..] {
            if (s.1 - base) / base > size_tolerance {
                break;
            }
            ws.insert(s.0);
        }
        best = best.max(ws.len());
    }

    EarlyBuyStats {
        bundled_pct: bundled.values().sum(),
        bundled_wallets: bundled.len(),
        same_size_cluster: best,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn b(slot: u64, w: &str, pct: f64, sol: f64) -> EarlyBuy {
        EarlyBuy {
            slot,
            wallet: w.into(),
            supply_pct: pct,
            sol_in: sol,
        }
    }

    #[test]
    fn detects_same_slot_bundle() {
        let buys = vec![
            b(100, "a", 3.0, 1.0),
            b(100, "b", 3.0, 1.0),
            b(100, "c", 3.0, 1.005),
            b(101, "d", 1.0, 0.3),
            b(102, "e", 1.0, 2.0),
        ];
        let s = analyze_early_buys(&buys, 3, 0.01);
        assert!((s.bundled_pct - 9.0).abs() < 1e-9);
        assert_eq!(s.bundled_wallets, 3);
        assert_eq!(s.same_size_cluster, 3);
    }

    #[test]
    fn organic_flow_has_no_bundle() {
        let buys = vec![
            b(1, "a", 1.0, 0.1),
            b(2, "b", 1.0, 0.5),
            b(3, "c", 1.0, 2.0),
        ];
        let s = analyze_early_buys(&buys, 3, 0.01);
        assert_eq!(s.bundled_pct, 0.0);
        assert_eq!(s.same_size_cluster, 1);
    }
}
