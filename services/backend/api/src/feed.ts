// Shared per-workspace event poller for SSE. One service-role poll loop per (workspace, mode) with at least
// one subscriber, instead of one DB poll per connection. Each subscriber first catches up from the database
// *as the user* (RLS), while already registered so nothing the shared loop fetches in the meantime is lost
// (it is queued and de-duplicated by seq). Membership is re-checked per subscriber on SSE_MEMBER_CHECK_MS.
import type { Db } from "./db.ts";
import { asService } from "./db.ts";
import { EVENT_COLUMNS, type EventRow } from "./wire.ts";

export interface FeedBatch {
  rows: EventRow[];
  safe: string;
}
export type FeedListener = (b: FeedBatch) => void;

const PAGE = 500;

class Feed {
  readonly subs = new Set<FeedListener>();
  cursor: string;
  safe: string;
  timer: NodeJS.Timeout | null = null;
  polling = false;
  constructor(start: string) {
    this.cursor = start;
    this.safe = start;
  }
}

export class FeedHub {
  private feeds = new Map<string, Feed>();
  private readonly db: Db;
  private readonly pollMs: number;
  /** Number of DB polls run (for tests and metrics). */
  polls = 0;
  constructor(db: Db, pollMs: number) {
    this.db = db;
    this.pollMs = pollMs;
  }

  activeFeeds(): number {
    return this.feeds.size;
  }

  /**
   * Register a listener; returns the shared feed's current watermark and an unsubscribe function.
   * Batches only ever contain rows with seq > the watermark at the time they were fetched.
   */
  async subscribe(ws: string, mode: string, fn: FeedListener): Promise<{ unsubscribe: () => void; safe: string }> {
    const k = `${ws}:${mode}`;
    let f = this.feeds.get(k);
    if (!f) {
      const s = await asService(this.db, async (c) => (await c.query<{ s: string }>("select public.events_safe_seq()::text as s")).rows[0]?.s ?? "0");
      f = this.feeds.get(k); // another subscriber may have raced us
      if (!f) {
        const nf = new Feed(s);
        nf.timer = setInterval(() => void this.poll(ws, mode, nf), this.pollMs);
        this.feeds.set(k, nf);
        f = nf;
      }
    }
    const feed = f;
    feed.subs.add(fn);
    return {
      safe: feed.safe,
      unsubscribe: () => {
        feed.subs.delete(fn);
        if (feed.subs.size === 0 && this.feeds.get(k) === feed) {
          if (feed.timer) clearInterval(feed.timer);
          this.feeds.delete(k);
        }
      },
    };
  }

  private async poll(ws: string, mode: string, f: Feed): Promise<void> {
    if (f.polling || f.subs.size === 0) return;
    f.polling = true;
    try {
      for (;;) {
        this.polls++;
        const { rows, safe } = await asService(this.db, async (c) => {
          const s = (await c.query<{ s: string }>("select public.events_safe_seq()::text as s")).rows[0]?.s ?? "0";
          const r = await c.query(
            `select ${EVENT_COLUMNS} from public.events
              where workspace_id = $1 and mode = $2::public.trade_mode and seq > $3::bigint and seq <= $4::bigint
              order by seq asc limit ${PAGE}`,
            [ws, mode, f.cursor, s],
          );
          return { rows: r.rows as EventRow[], safe: s };
        });
        if (rows.length) f.cursor = String(rows[rows.length - 1]!.seq);
        if (BigInt(safe) > BigInt(f.safe)) f.safe = safe;
        if (!rows.length && BigInt(safe) > BigInt(f.cursor)) f.cursor = safe; // nothing for us below the watermark
        const batch = { rows, safe: f.safe };
        for (const fn of f.subs) {
          try {
            fn(batch);
          } catch (e) {
            console.error("feed listener failed:", e instanceof Error ? e.message : e);
          }
        }
        if (rows.length < PAGE) break;
      }
    } catch (e) {
      console.error("feed poll failed:", e instanceof Error ? e.message : e);
    } finally {
      f.polling = false;
    }
  }

  stop(): void {
    for (const f of this.feeds.values()) if (f.timer) clearInterval(f.timer);
    this.feeds.clear();
  }
}
