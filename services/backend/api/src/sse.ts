// SSE: GET /v1/workspaces/{ws}/events/stream?mode=practice&after_seq=&include=marks,clock
// - event frames: `id: <seq string>`, `event: <type>`, `data: <envelope>`; only seq <= events_safe_seq(),
//   strictly ascending, so a client can always resume from the last `id` (Last-Event-ID or after_seq).
// - include=marks: `event: mark` frames (MarkMessage, no id), fed by Postgres NOTIFY on SSE_MARKS_CHANNEL.
// - include=clock: `event: clock` frames every SSE_CLOCK_MS with {server_now, safe_seq} (no id).
// - `: hb` comment every SSE_HEARTBEAT_MS. The stream ends when the access token expires.
import pg from "pg";
import { ApiError } from "./errors.ts";
import { asUser, requireMember } from "./db.ts";
import { baseHeaders, serverNow, type Ctx } from "./http.ts";
import type { Principal } from "./jwt.ts";
import { seqParam } from "./rules.ts";
import { EVENT_COLUMNS, eventWire, type EventRow } from "./wire.ts";
import type { Deps } from "./routes.ts";

export interface MarkMessage {
  mint: string;
  price_usd: string;
  price_sol: string;
  liquidity_usd: number;
  slot: number;
  ts: string;
  position_ids: string[];
}
type MarkListener = (m: MarkMessage) => void;

/**
 * Fan-out of mark prices. Producers publish
 * `select pg_notify('<channel>', '{"workspace_id": "...", "mode": "practice", "mark": {...MarkMessage}}')`.
 * One LISTEN connection per API process; marks are never persisted and never move the watermark.
 */
export class MarkHub {
  private subs = new Map<string, Set<MarkListener>>();
  private client: pg.Client | null = null;
  private readonly url: string;
  private readonly channel: string;
  constructor(url: string, channel: string) {
    this.url = url;
    this.channel = channel;
  }
  async start(): Promise<void> {
    const c = new pg.Client({ connectionString: this.url });
    c.on("error", (e) => console.error("marks listener error:", e.message));
    await c.connect();
    c.on("notification", (n) => this.dispatch(n.payload ?? ""));
    await c.query(`listen ${this.channel}`);
    this.client = c;
  }
  async stop(): Promise<void> {
    await this.client?.end().catch(() => undefined);
    this.client = null;
  }
  subscribe(ws: string, mode: string, fn: MarkListener): () => void {
    const k = `${ws}:${mode}`;
    let set = this.subs.get(k);
    if (!set) this.subs.set(k, (set = new Set()));
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.subs.delete(k);
    };
  }
  dispatch(raw: string): void {
    let v: { workspace_id?: unknown; mode?: unknown; mark?: Record<string, unknown> };
    try {
      v = JSON.parse(raw) as typeof v;
    } catch {
      return;
    }
    const m = v.mark;
    if (typeof v.workspace_id !== "string" || typeof v.mode !== "string" || !m || typeof m.mint !== "string") return;
    const set = this.subs.get(`${v.workspace_id}:${v.mode}`);
    if (!set) return;
    // only MarkMessage fields leave the server
    const mark: MarkMessage = {
      mint: m.mint,
      price_usd: String(m.price_usd ?? ""),
      price_sol: String(m.price_sol ?? ""),
      liquidity_usd: Number(m.liquidity_usd ?? 0),
      slot: Number(m.slot ?? 0),
      ts: typeof m.ts === "string" ? m.ts : serverNow(),
      position_ids: Array.isArray(m.position_ids) ? m.position_ids.filter((x): x is string => typeof x === "string") : [],
    };
    for (const fn of set) fn(mark);
  }
}

function frame(event: string | null, data: unknown, id?: string): string {
  return `${id !== undefined ? `id: ${id}\n` : ""}${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`;
}

export async function streamEvents(ctx: Ctx, d: Deps, p: Principal, ws: string, mode: "practice"): Promise<void> {
  const q = ctx.url.searchParams;
  const include = new Set((q.get("include") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  for (const i of include) {
    if (i !== "marks" && i !== "clock") throw new ApiError("VALIDATION_FAILED", { field: "include", allowed: ["marks", "clock"] });
  }
  const lastId = ctx.req.headers["last-event-id"];
  // Last-Event-ID (browser reconnect) wins over after_seq (first connect)
  const resume = seqParam(typeof lastId === "string" ? lastId.trim() : null, "Last-Event-ID") ?? seqParam(q.get("after_seq"), "after_seq");

  let cursor = await asUser(d.db, p.claims, async (c) => {
    await requireMember(c, ws);
    if (resume !== null) return resume;
    const r = await c.query<{ s: string }>("select public.events_safe_seq()::text as s");
    return r.rows[0]?.s ?? "0"; // no cursor: live only, from the current watermark
  });
  let safeSeq = cursor;

  const res = ctx.res;
  res.writeHead(200, {
    ...baseHeaders(ctx, serverNow()),
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.socket?.setNoDelay(true);
  res.write(`retry: 3000\n: sentra events after_seq=${cursor}\n\n`);

  let closed = false;
  const timers: NodeJS.Timeout[] = [];
  let unsubscribe: (() => void) | null = null;
  const close = () => {
    if (closed) return;
    closed = true;
    timers.forEach(clearInterval);
    timers.forEach(clearTimeout);
    unsubscribe?.();
    res.end();
  };
  ctx.req.on("close", close);
  res.on("error", close);

  // token expiry ends the stream; the client reconnects with a fresh token and Last-Event-ID
  const msLeft = p.claims.exp * 1000 - Date.now();
  timers.push(setTimeout(close, Math.max(0, Math.min(msLeft, 2_147_000_000))));

  let polling = false;
  const poll = async () => {
    if (closed || polling) return;
    polling = true;
    try {
      const { rows, safe } = await asUser(d.db, p.claims, async (c) => {
        const s = await c.query<{ s: string }>("select public.events_safe_seq()::text as s");
        const safe = s.rows[0]?.s ?? "0";
        const r = await c.query(
          `select ${EVENT_COLUMNS} from public.events
            where workspace_id = $1 and mode = $2::public.trade_mode and seq > $3::bigint and seq <= $4::bigint
            order by seq asc limit 500`,
          [ws, mode, cursor, safe],
        );
        return { rows: r.rows as EventRow[], safe };
      });
      if (closed) return;
      const now = serverNow();
      for (const e of rows) {
        res.write(frame(e.type, eventWire(e, now), String(e.seq)));
        cursor = String(e.seq);
      }
      if (BigInt(safe) > BigInt(safeSeq)) safeSeq = safe;
      if (rows.length === 500) setImmediate(poll); // backlog: keep draining
    } catch (e) {
      // membership revoked etc.: end the stream; the client reconnects and gets the real status
      console.error("sse poll failed:", e instanceof Error ? e.message : e);
      close();
    } finally {
      polling = false;
    }
  };
  timers.push(setInterval(poll, d.cfg.ssePollMs));
  void poll();

  if (include.has("clock")) {
    const tick = () => {
      if (!closed) res.write(frame("clock", { server_now: serverNow(), safe_seq: safeSeq }));
    };
    timers.push(setInterval(tick, d.cfg.sseClockMs));
  }
  if (include.has("marks")) {
    unsubscribe = d.marks.subscribe(ws, mode, (m) => {
      if (!closed) res.write(frame("mark", { ...m, server_now: serverNow() }));
    });
  }
  timers.push(setInterval(() => !closed && res.write(": hb\n\n"), d.cfg.sseHeartbeatMs));
}
