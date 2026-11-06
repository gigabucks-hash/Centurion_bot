//! `agent_settings.buys_paused` reader for the paper pipeline (docs/BUYS_PAUSED_OPTIONS.md, A/A/A).
//!
//! Paper policy: the first value is `false` (nothing is paused until the DB says so) and a failed
//! read keeps the last known value, so a transient DB error does not silently change a trading gate.
//! Phase 7 / real money must NOT inherit this: a real executor needs an explicit fail-closed gate.
//!
//! Ingest-owned poller (option 3A): a 1 s loop keeps a `watch::Receiver<bool>` current. The API
//! already owns the write path (`agent_settings`); this only reads it.

use std::time::Duration;

use tokio::sync::watch;

/// Poll cadence. The pause switch is human-driven; one second is well below any visible lag.
pub const POLL_INTERVAL: Duration = Duration::from_secs(1);

const SQL: &str = "select coalesce((select s.buys_paused from public.agent_settings s where s.workspace_id = $1::uuid), false) as buys_paused";

/// True for the canonical 8-4-4-4-12 hex uuid form (either case). A non-uuid workspace
/// (`local-dev`, `example`) has no settings row and therefore no pause switch.
pub fn is_uuid(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 36 {
        return false;
    }
    for (i, ch) in b.iter().enumerate() {
        match i {
            8 | 13 | 18 | 23 => {
                if *ch != b'-' {
                    return false;
                }
            }
            _ => {
                if !ch.is_ascii_hexdigit() {
                    return false;
                }
            }
        }
    }
    true
}

/// Spawn the 1 s poller and return the receiver the pipeline reads.
///
/// `None` when there is no usable source of truth (non-uuid workspace or no `DATABASE_URL`): the
/// paper pipeline then runs unpaused, which is the documented A policy. Callers must not treat
/// `None` as "not paused" for real execution.
pub fn spawn_buys_paused_watch(
    database_url: &str,
    workspace_id: &str,
) -> Option<watch::Receiver<bool>> {
    if !is_uuid(workspace_id) {
        tracing::info!(
            workspace_id,
            "buys_paused off: workspace is not a uuid (no agent_settings row)"
        );
        return None;
    }
    if database_url.is_empty() {
        tracing::warn!(
            workspace_id,
            "buys_paused off: DATABASE_URL not set; paper buys stay enabled"
        );
        return None;
    }
    let (tx, rx) = watch::channel(false);
    let url = database_url.to_string();
    let ws = workspace_id.to_string();
    tokio::spawn(async move {
        let mut client: Option<tokio_postgres::Client> = None;
        let mut last = false;
        loop {
            match read_once(&mut client, &url, &ws).await {
                Ok(v) => {
                    if v != last {
                        tracing::info!(workspace_id = %ws, buys_paused = v, "workspace buy switch changed");
                    }
                    last = v;
                }
                Err(e) => {
                    // Paper: keep the last value (A). The next tick reconnects.
                    client = None;
                    tracing::warn!(error = %e, buys_paused = last, "agent_settings read failed; keeping last value");
                }
            }
            if tx.send(last).is_err() {
                return; // pipeline dropped
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    });
    Some(rx)
}

async fn read_once(
    client: &mut Option<tokio_postgres::Client>,
    url: &str,
    workspace_id: &str,
) -> Result<bool, tokio_postgres::Error> {
    if client.is_none() {
        let (c, conn) = tokio_postgres::connect(url, tokio_postgres::NoTls).await?;
        // The driver ends by itself when the client is dropped or the connection closes.
        tokio::spawn(async move {
            if let Err(e) = conn.await {
                tracing::debug!(error = %e, "agent_settings connection closed");
            }
        });
        *client = Some(c);
    }
    let Some(c) = client.as_ref() else {
        return Ok(false);
    };
    let row = c.query_one(SQL, &[&workspace_id]).await?;
    Ok(row.get::<_, bool>("buys_paused"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uuid_shape() {
        assert!(is_uuid("10000000-0000-0000-0000-0000000000a1"));
        assert!(is_uuid("ABCDEF01-2345-6789-abcd-ef0123456789"));
        for bad in [
            "",
            "ws",
            "local-dev",
            "10000000-0000-0000-0000-0000000000a",   // short
            "10000000-0000-0000-0000-0000000000a1f", // long
            "10000000-0000-0000-0000-0000000000zz",
            "10000000000000000000000000000000----",
            "10000000-0000-0000-0000-00000000000a-",
            "100000000-000-0000-0000-0000000000a1",
        ] {
            assert!(!is_uuid(bad), "{bad:?} must not be a uuid");
        }
    }

    #[test]
    fn no_poller_without_a_uuid_or_a_database() {
        assert!(spawn_buys_paused_watch("postgres://x/y", "local-dev").is_none());
        assert!(spawn_buys_paused_watch("", "10000000-0000-0000-0000-0000000000a1").is_none());
    }
}
