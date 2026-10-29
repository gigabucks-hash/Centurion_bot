//! Replays a JSONL file of [`IngestEvent`]s. Used for tests, demos and (Phase 8)
//! backtests. Fully implemented.
use async_trait::async_trait;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::{mpsc, watch};

use super::{IngestEvent, SourceError, StreamSource};

pub struct ReplaySource {
    pub path: String,
}

#[async_trait]
impl StreamSource for ReplaySource {
    fn name(&self) -> &'static str {
        "replay"
    }
    async fn run(
        &self,
        tx: mpsc::Sender<IngestEvent>,
        shutdown: watch::Receiver<bool>,
    ) -> Result<(), SourceError> {
        let f = tokio::fs::File::open(&self.path).await?;
        let mut lines = BufReader::new(f).lines();
        let mut n = 0usize;
        while let Some(line) = lines.next_line().await? {
            if *shutdown.borrow() {
                break;
            }
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            n += 1;
            let ev: IngestEvent = serde_json::from_str(line)
                .map_err(|e| SourceError::Decode(format!("line {n}: {e}")))?;
            tx.send(ev).await.map_err(|_| SourceError::ChannelClosed)?;
        }
        tracing::info!(events = n, path = %self.path, "replay finished");
        Ok(())
    }
}
