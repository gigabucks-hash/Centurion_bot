//! Fixed-bucket latency recorder (microseconds) with p50/p95/p99/max, lock-free enough for M1:
//! a mutex around a small bucket array, touched once per evaluation.
use serde::Serialize;
use std::sync::Mutex;

/// Bucket upper bounds in microseconds (log-ish spacing up to 1 s).
const BOUNDS_US: [u64; 20] = [
    1,
    2,
    5,
    10,
    20,
    50,
    100,
    200,
    500,
    1_000,
    2_000,
    5_000,
    10_000,
    20_000,
    50_000,
    100_000,
    200_000,
    500_000,
    1_000_000,
    u64::MAX,
];

#[derive(Default)]
struct Inner {
    counts: [u64; 20],
    n: u64,
    sum_us: u64,
    max_us: u64,
}

#[derive(Default)]
pub struct Latency(Mutex<Inner>);

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LatencySummary {
    pub n: u64,
    pub mean_us: f64,
    /// Upper bound of the bucket holding the percentile (conservative).
    pub p50_us: u64,
    pub p95_us: u64,
    pub p99_us: u64,
    pub max_us: u64,
}

impl Latency {
    pub fn record_us(&self, us: u64) {
        let Ok(mut g) = self.0.lock() else { return };
        let i = BOUNDS_US
            .iter()
            .position(|b| us <= *b)
            .unwrap_or(BOUNDS_US.len() - 1);
        g.counts[i] += 1;
        g.n += 1;
        g.sum_us = g.sum_us.saturating_add(us);
        g.max_us = g.max_us.max(us);
    }
    pub fn summary(&self) -> LatencySummary {
        let g = match self.0.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        let pct = |q: f64| -> u64 {
            if g.n == 0 {
                return 0;
            }
            let target = ((g.n as f64) * q).ceil() as u64;
            let mut acc = 0;
            for (i, c) in g.counts.iter().enumerate() {
                acc += c;
                if acc >= target {
                    return BOUNDS_US[i].min(g.max_us);
                }
            }
            g.max_us
        };
        LatencySummary {
            n: g.n,
            mean_us: if g.n == 0 {
                0.0
            } else {
                g.sum_us as f64 / g.n as f64
            },
            p50_us: pct(0.50),
            p95_us: pct(0.95),
            p99_us: pct(0.99),
            max_us: g.max_us,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn percentiles() {
        let l = Latency::default();
        assert_eq!(l.summary().n, 0);
        for _ in 0..95 {
            l.record_us(3);
        }
        for _ in 0..5 {
            l.record_us(40_000);
        }
        let s = l.summary();
        assert_eq!(s.n, 100);
        assert_eq!(s.p50_us, 5);
        assert_eq!(s.p95_us, 5);
        assert_eq!(s.p99_us, 40_000);
        assert_eq!(s.max_us, 40_000);
    }
}
