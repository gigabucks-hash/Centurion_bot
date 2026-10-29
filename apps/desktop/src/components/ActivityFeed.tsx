import type { ActivityView, Actor, Tone } from "../api";
import { renderMsg, useLang, useT } from "../i18n";
import { useTerm } from "../state/store";
import { fmtTime } from "./format";

const ACTOR_KEY: Record<Actor, string> = {
  ingest: "feed.actor.ingest",
  screener: "feed.actor.screener",
  guard: "feed.actor.guard",
  entry: "feed.actor.entry",
  executor: "feed.actor.executor",
  exit: "feed.actor.exit",
  user: "feed.actor.you",
  system: "feed.actor.system",
};
const TONE: Record<Tone, string> = { neutral: "", good: "pos", bad: "neg", guard: "guard", info: "" };

/**
 * Activity feed. Text comes from @sentra/i18n when Rust sends a structured `i18n` message
 * (numbers formatted in the UI locale), else Rust's plain-text `message`. `symbol`/`message`
 * may contain untrusted token text → rendered as text nodes only.
 */
export function ActivityFeed({ items }: { items: ActivityView[] }) {
  const t = useT();
  const lang = useLang();
  const paper = useTerm((s) => s.mode) === "practice";
  if (!items.length) return <div className="empty">Activity kosong</div>;
  return (
    <div role="log" aria-live="polite">
      {items.map((e) => {
        const text = (e.i18n && renderMsg(e.i18n, lang, paper)) ?? e.message;
        return (
          <div key={e.id} className={`feed-item k-${e.kind.replace(/\./g, "-")}`} title={e.seq != null ? `seq ${e.seq} · ${e.kind}` : `lokal · ${e.kind}`}>
            <span className="num dim">{fmtTime(e.ts_ms)}</span>
            <span className="actor">{ACTOR_KEY[e.actor] ? t(ACTOR_KEY[e.actor]) : e.actor}</span>
            <span className={TONE[e.tone]}>
              {e.symbol && !e.i18n?.args?.coin ? <span className="mono">{e.symbol} </span> : null}{text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
