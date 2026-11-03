//! Ingest bytes/day meter: raw bytes received per source (`pumpportal`, `helius`, `helius_rpc`,
//! `yellowstone`, ...) per **UTC day**. Cheap (one mutex-guarded map add per frame), process wide.
//!
//! Exposed three ways: `snapshot()` (metrics), a `tracing` line per source when a UTC day closes
//! and every `log_every` (logs), and an optional Postgres sink (`public.ingest_bytes_add`, table
//! `public.ingest_bytes_daily`, read by the API `/readyz` detail).

use std::collections::BTreeMap;
use std::sync::{Mutex, OnceLock};

use chrono::{DateTime, NaiveDate, Utc};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Counter {
    pub bytes: u64,
    pub frames: u64,
}

/// (UTC day, source) -> counter. Days older than `keep_days` are dropped.
#[derive(Debug, Default)]
pub struct ByteMeter {
    inner: Mutex<MeterState>,
}

#[derive(Debug, Default)]
struct MeterState {
    days: BTreeMap<(NaiveDate, &'static str), Counter>,
    /// Not yet flushed to the DB sink.
    pending: BTreeMap<(NaiveDate, &'static str), Counter>,
    current_day: Option<NaiveDate>,
}

const KEEP_DAYS: i64 = 7;

impl ByteMeter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Count `bytes` received by `source` at `now`. Returns the counters of the UTC day that just
    /// closed, if this call rolled the day over (the caller logs them).
    pub fn add_at(
        &self,
        source: &'static str,
        bytes: usize,
        now: DateTime<Utc>,
    ) -> Vec<(&'static str, Counter)> {
        let day = now.date_naive();
        let mut s = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        let mut closed = Vec::new();
        if let Some(prev) = s.current_day.filter(|d| *d < day) {
            closed = s
                .days
                .iter()
                .filter(|((d, _), _)| *d == prev)
                .map(|((_, src), c)| (*src, *c))
                .collect();
            let cutoff = day - chrono::Duration::days(KEEP_DAYS);
            s.days.retain(|(d, _), _| *d > cutoff);
        }
        if s.current_day.is_none_or(|d| d < day) {
            s.current_day = Some(day);
        }
        let st = &mut *s;
        for m in [&mut st.days, &mut st.pending] {
            let c = m.entry((day, source)).or_default();
            c.bytes = c.bytes.saturating_add(bytes as u64);
            c.frames = c.frames.saturating_add(1);
        }
        closed
    }

    pub fn add(&self, source: &'static str, bytes: usize) {
        let now = Utc::now();
        for (src, c) in self.add_at(source, bytes, now) {
            tracing::info!(source = src, bytes = c.bytes, frames = c.frames, day = %(now.date_naive() - chrono::Duration::days(1)), "ingest bytes/day (closed)");
        }
    }

    /// Counters of one UTC day, per source.
    pub fn day(&self, day: NaiveDate) -> BTreeMap<&'static str, Counter> {
        let s = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        s.days
            .iter()
            .filter(|((d, _), _)| *d == day)
            .map(|((_, src), c)| (*src, *c))
            .collect()
    }

    pub fn today(&self) -> BTreeMap<&'static str, Counter> {
        self.day(Utc::now().date_naive())
    }

    /// Take the deltas not yet written to the DB sink (re-added with `restore` on a failed flush).
    pub fn take_pending(&self) -> Vec<(NaiveDate, &'static str, Counter)> {
        let mut s = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        std::mem::take(&mut s.pending)
            .into_iter()
            .map(|((d, src), c)| (d, src, c))
            .collect()
    }

    pub fn restore(&self, rows: Vec<(NaiveDate, &'static str, Counter)>) {
        let mut s = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        for (d, src, c) in rows {
            let e = s.pending.entry((d, src)).or_default();
            e.bytes = e.bytes.saturating_add(c.bytes);
            e.frames = e.frames.saturating_add(c.frames);
        }
    }

    /// One log line per source for today (periodic summary).
    pub fn log_today(&self) {
        for (src, c) in self.today() {
            tracing::info!(
                source = src,
                bytes = c.bytes,
                frames = c.frames,
                "ingest bytes/day (so far, UTC)"
            );
        }
    }
}

/// The process-wide meter every source counts into.
pub fn global() -> &'static ByteMeter {
    static M: OnceLock<ByteMeter> = OnceLock::new();
    M.get_or_init(ByteMeter::new)
}

/// Write pending deltas with `select public.ingest_bytes_add($1::date, $2, $3, $4)`.
pub async fn flush_pg(
    meter: &ByteMeter,
    client: &tokio_postgres::Client,
) -> Result<usize, tokio_postgres::Error> {
    let rows = meter.take_pending();
    let n = rows.len();
    for (i, (d, src, c)) in rows.iter().enumerate() {
        let r = client
            .execute(
                "select public.ingest_bytes_add($1::text::date, $2, $3, $4)",
                &[&d.to_string(), &src, &(c.bytes as i64), &(c.frames as i64)],
            )
            .await;
        if let Err(e) = r {
            meter.restore(rows[i..].to_vec());
            return Err(e);
        }
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn at(y: i32, m: u32, d: u32, h: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(y, m, d, h, 0, 0).single().expect("ts")
    }

    #[test]
    fn counts_per_source_per_utc_day_and_reports_closed_day() {
        let m = ByteMeter::new();
        assert!(m.add_at("helius", 100, at(2026, 11, 1, 23)).is_empty());
        m.add_at("helius", 50, at(2026, 11, 1, 23));
        m.add_at("pumpportal", 7, at(2026, 11, 1, 23));
        let d1 = m.day(at(2026, 11, 1, 0).date_naive());
        assert_eq!(
            d1["helius"],
            Counter {
                bytes: 150,
                frames: 2
            }
        );
        assert_eq!(
            d1["pumpportal"],
            Counter {
                bytes: 7,
                frames: 1
            }
        );
        // 00:00 UTC rolls the day (07:00 WIB): the closed day is returned once
        let closed = m.add_at("helius", 1, at(2026, 11, 2, 0));
        assert_eq!(closed.len(), 2);
        assert!(closed.contains(&(
            "helius",
            Counter {
                bytes: 150,
                frames: 2
            }
        )));
        assert!(m.add_at("helius", 1, at(2026, 11, 2, 1)).is_empty());
        assert_eq!(m.day(at(2026, 11, 2, 0).date_naive())["helius"].bytes, 2);
    }

    #[test]
    fn old_days_are_dropped_and_pending_restores() {
        let m = ByteMeter::new();
        m.add_at("helius", 10, at(2026, 10, 1, 0));
        m.add_at("helius", 10, at(2026, 11, 1, 0));
        assert!(
            m.day(at(2026, 10, 1, 0).date_naive()).is_empty(),
            "older than 7 days"
        );
        let p = m.take_pending();
        assert_eq!(p.len(), 2);
        assert!(m.take_pending().is_empty());
        m.restore(p);
        assert_eq!(m.take_pending().len(), 2);
    }

    #[tokio::test]
    async fn pg_sink_accumulates() {
        let Ok(url) = std::env::var("CENTURION_PG_TEST_URL") else {
            return;
        };
        let (c, conn) = tokio_postgres::connect(&url, tokio_postgres::NoTls)
            .await
            .expect("connect");
        tokio::spawn(conn);
        let probe = c
            .query_opt(
                "select to_regprocedure('public.ingest_bytes_add(date,text,bigint,bigint)')::text",
                &[],
            )
            .await
            .expect("q");
        if probe.and_then(|r| r.get::<_, Option<String>>(0)).is_none() {
            return; // migrations not applied to this DB
        }
        c.execute(
            "delete from public.ingest_bytes_daily where source = 'test_meter'",
            &[],
        )
        .await
        .expect("clean");
        let m = ByteMeter::new();
        m.add_at("test_meter", 100, at(2026, 11, 1, 3));
        assert_eq!(flush_pg(&m, &c).await.expect("flush"), 1);
        m.add_at("test_meter", 23, at(2026, 11, 1, 4));
        flush_pg(&m, &c).await.expect("flush");
        let r = c
            .query_one("select bytes, frames from public.ingest_bytes_daily where source = 'test_meter' and day = '2026-11-01'", &[])
            .await
            .expect("row");
        assert_eq!((r.get::<_, i64>(0), r.get::<_, i64>(1)), (123, 2));
        c.execute(
            "delete from public.ingest_bytes_daily where source = 'test_meter'",
            &[],
        )
        .await
        .expect("clean");
    }
}
