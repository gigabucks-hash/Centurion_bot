import type { ActivityView, Actor, Tone } from "../api";
import { fmtTime } from "./format";

const ACTOR_LABEL: Record<Actor, string> = {
  ingest: "Ingest",
  screener: "Screener",
  guard: "Guard",
  entry: "Entry",
  executor: "Executor",
  exit: "Exit",
  user: "You",
  system: "System",
};
const TONE: Record<Tone, string> = { neutral: "", good: "pos", bad: "neg", guard: "guard", info: "" };

/** Activity feed. `symbol`/`message` may contain untrusted token text → text nodes only. */
export function ActivityFeed({ items }: { items: ActivityView[] }) {
  if (!items.length) return <div className="empty">Activity kosong</div>;
  return (
    <div role="log" aria-live="polite">
      {items.map((e) => (
        <div key={e.id} className={`feed-item k-${e.kind.replace(/\./g, "-")}`} title={e.seq != null ? `seq ${e.seq}` : "lokal"}>
          <span className="num dim">{fmtTime(e.ts_ms)}</span>
          <span className="actor">{ACTOR_LABEL[e.actor] ?? e.actor}</span>
          <span className={TONE[e.tone]}>
            <b>{e.kind}</b> {e.symbol ? <span className="mono">{e.symbol}</span> : null} {e.message}
          </span>
        </div>
      ))}
    </div>
  );
}
