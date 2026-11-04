import type { ActivityView, Actor, Tone } from "../api";
import { Activity } from "lucide-react";
import { renderMsg, useLang, useT } from "../i18n";
import { useTerm } from "../state/store";
import { CoinAvatar } from "./CoinAvatar";
import { Icon } from "./Icon";
import { fmtTime } from "./format";
import { useCoinLogo } from "./useCoinLogo";

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
 * Activity feed. Text comes from @centurion/i18n when Rust sends a structured `i18n` message
 * (numbers formatted in the UI locale), else Rust's plain-text `message`. `symbol`/`message`
 * may contain untrusted token text → rendered as text nodes only.
 *
 * Every coin-bearing row shows its logo (Boss req): `logo_hash` is resolved from the view that owns
 * the mint; ActivityView has no hash of its own, so the row looks it up (identicon when unknown).
 */
export function ActivityFeed({ items }: { items: ActivityView[] }) {
  const t = useT();
  const lang = useLang();
  const paper = useTerm((s) => s.mode) === "practice";
  if (!items.length) return <div className="empty"><Icon glyph={Activity} size={32} />Activity kosong</div>;
  return (
    <div role="log" aria-live="polite">
      {items.map((e) => {
        const text = (e.i18n && renderMsg(e.i18n, lang, paper)) ?? e.message;
        return (
          <div key={e.id} className={`feed-item k-${e.kind.replace(/\./g, "-")}`} title={e.seq != null ? `seq ${e.seq} · ${e.kind}` : `lokal · ${e.kind}`}>
            <span className="num dim">{fmtTime(e.ts_ms)}</span>
            <span className="actor">{ACTOR_KEY[e.actor] ? t(ACTOR_KEY[e.actor]) : e.actor}</span>
            <span className={TONE[e.tone]}>
              {e.mint ? <FeedCoin mint={e.mint} symbol={!e.i18n?.args?.coin ? e.symbol : null} /> : e.symbol && !e.i18n?.args?.coin ? <span className="mono">{e.symbol} </span> : null}
              {text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Row coin cell: avatar + optional symbol text (symbol may be absent on system events). */
function FeedCoin({ mint, symbol }: { mint: string; symbol: string | null }) {
  const logoHash = useCoinLogo(mint);
  return (
    <span className="coin-sym feed-coin">
      <CoinAvatar mint={mint} symbol={symbol ?? mint.slice(0, 2)} logoHash={logoHash} size={20} />
      {symbol ? <span className="mono">{symbol} </span> : null}
    </span>
  );
}
