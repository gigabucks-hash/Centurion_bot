import type { ActivityEvent } from "../api";
import { fmtTime } from "./format";

const ACTOR_LABEL: Record<ActivityEvent["actor"], string> = {
  screener: "Screener",
  guard: "Guard",
  entry: "Entry",
  executor: "Executor",
  exit: "Exit",
  you: "You",
  system: "System",
};
const tone: Partial<Record<ActivityEvent["kind"], string>> = { bought: "pos", blocked: "guard" };

export function ActivityFeed({ items }: { items: ActivityEvent[] }) {
  if (!items.length) return <div className="empty">Activity kosong</div>;
  return (
    <div role="log" aria-live="polite">
      {items.map((e) => (
        <div key={e.id} className={`feed-item k-${e.kind}`}>
          <span className="num dim">{fmtTime(e.ts)}</span>
          <span className="actor">{ACTOR_LABEL[e.actor]}</span>
          <span className={tone[e.kind] ?? ""}>
            <b>{e.kind}</b> {e.symbol ? <span className="mono">{e.symbol}</span> : null} {e.message}
          </span>
        </div>
      ))}
    </div>
  );
}
