"use client";
/**
 * Realtime adapter (EVENTS_SCHEMA §3). One interface, three transports, chosen by NEXT_PUBLIC_REALTIME:
 * - "mock" (default): this app's mock SSE at /api/v1/workspaces/{ws}/events/stream?mode=&include=marks,clock.
 * - "sse": backend SSE at NEXT_PUBLIC_SSE_BASE + /v1/workspaces/{ws}/events/stream (contracts 1.1.2 SSE_PATH).
 * - "supabase": Supabase Realtime skeleton — postgres_changes on `events` (filter workspace_id + mode),
 *   Broadcast `marks:<ws>:<mode>` (MarkMessage, never persisted) and a 15 s ClockMessage heartbeat.
 *   Not wired in this build (no Supabase client / keys); it reports itself unavailable and falls back to SSE.
 * SSE frames (1.1.2): `event: <envelope type>` + `id: <seq string>`; `event: mark`; `event: clock` every 5 s.
 * Resume (N1): the resume point is `min(highest applied seq, clock.safe_seq)` — see lib/realtime-watermark.ts.
 * `clock.safe_seq` alone never moves it, and a reconnect fills the gap through `catchUp(after_seq)` before the new
 * stream opens (backend `events_safe_seq()` can lag committed rows; replaying is deduped by exact seq).
 * Every `server_now` / clock frame updates lib/clock.ts.
 */
import type { AnyEvent, ClockMessage, EventEnvelope, MarkMessage, Mode, ProposalUpdated } from "@centurion/contracts/wire";
import { observeServerNow } from "./clock";
import { envelopeToTradeEvent } from "./contracts";
import { initialWatermark, isBehind, noteCatchUp, noteClock, noteEvent, resumeAfter, type Watermark } from "./realtime-watermark";
import { isSeq, type Seq } from "./seq";
import type { ConnectionState, TradeEvent } from "./types";

/** Broadcast clock heartbeat (15 s). */
export const CLOCK_INTERVAL_MS = 15_000;
/** SSE `event: clock` cadence with include=clock (5 s). */
export const SSE_CLOCK_INTERVAL_MS = 5_000;

export interface RealtimeHandlers {
  onEvent: (e: TradeEvent) => void;
  onStatus: (s: ConnectionState) => void;
  onMark?: (m: MarkMessage) => void;
  /** 1.1.4 proposal.updated (quote refreshed, rev + 1): patch the approval in place. */
  onProposalUpdated?: (p: ProposalUpdated) => void;
  onClock?: (c: ClockMessage) => void;
}

export interface RealtimeAdapter {
  readonly kind: "mock" | "sse" | "supabase";
  subscribe(h: RealtimeHandlers): () => void;
}

/**
 * One REST catch-up page (`GET /events?after_seq=`). `next` is the server's `next_after_seq`: on an empty page it is
 * `safe_seq`, which proves there are no further events *of this mode* in that range, so the consumer may advance.
 */
export interface CatchUpPage {
  items: AnyEvent[];
  next: Seq | null;
}

export interface RealtimeOptions {
  workspaceId: string;
  mode: Mode;
  /** Last applied seq (resume point). */
  afterSeq?: Seq;
  /** REST gap fill used after a reconnect and while `safe_seq` runs ahead of the applied events. */
  catchUp?: (after: Seq) => Promise<CatchUpPage>;
}

/** Channel names the Supabase adapter will use (shared by web and desktop). */
export function supabaseChannels(ws: string, mode: Mode) {
  return { events: `events:${ws}:${mode}`, marks: `marks:${ws}:${mode}`, table: "events", filter: `workspace_id=eq.${ws}` };
}

function sseAdapter(kind: "mock" | "sse", baseUrl: string, o: RealtimeOptions): RealtimeAdapter {
  return {
    kind,
    subscribe(h) {
      h.onStatus("connecting");
      let wm: Watermark = initialWatermark(o.afterSeq);
      let es: EventSource | null = null;
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      let reopen: ReturnType<typeof setTimeout> | undefined;
      let closed = false;
      let opening = false;
      let catchingUp = false;
      let lastCatchAt = 0;
      /** Exact seqs already handed to the UI in this subscription (replay after a safe-seq reconnect is expected). */
      const seen = new Set<string>();

      const remember = (seq: Seq) => {
        seen.add(seq);
        if (seen.size > 2000) {
          const it = seen.values();
          for (let i = 0; i < 1000; i++) {
            const v = it.next().value;
            if (v != null) seen.delete(v);
          }
        }
      };

      const applyEnvelope = (env: AnyEvent) => {
        if (env.mode !== o.mode) return; // never mix Practice and Real
        observeServerNow(env.server_now);
        const seq = isSeq(env.seq) ? env.seq : null;
        if (seq && seen.has(seq)) return;
        if (seq) remember(seq);
        wm = noteEvent(wm, env.seq);
        if (env.type === "proposal.updated") {
          h.onProposalUpdated?.(env.payload as ProposalUpdated);
          return;
        }
        const e = envelopeToTradeEvent(env);
        if (e) h.onEvent(e);
      };

      /** Loads everything the server has not delivered yet, then moves `applied` from the page's own next cursor. */
      const runCatchUp = async (after: Seq | null) => {
        if (!o.catchUp || closed || catchingUp || after == null) return;
        const now = Date.now();
        if (now - lastCatchAt < 2_000) return;
        catchingUp = true;
        lastCatchAt = now;
        try {
          const page = await o.catchUp(after);
          for (const env of page.items) applyEnvelope(env);
          // `next_after_seq` = last row, or safe_seq when the page is empty: nothing of this mode remains in range.
          wm = noteCatchUp(wm, page.next);
        } catch {
          /* the live stream still runs; the next clock retries the gap fill */
        } finally {
          catchingUp = false;
        }
      };

      const arm = () => {
        clearTimeout(watchdog);
        // No clock frame for 2 heartbeats → treat as lost and reconnect (resumes from the safe watermark).
        watchdog = setTimeout(() => {
          h.onStatus("disconnected");
          void open();
        }, SSE_CLOCK_INTERVAL_MS * 2 + 2000);
      };

      const open = async () => {
        if (closed || opening) return;
        opening = true;
        try {
          clearTimeout(reopen);
          es?.close();
          es = null;
          // Fill the gap before listening again: the backend may still have rows we have not seen, and
          // `after_seq` must be the safe point, not the furthest id the browser happened to parse.
          if (o.catchUp) await runCatchUp(resumeAfter(wm));
          if (closed) return;
          const resume = resumeAfter(wm);
          const q = new URLSearchParams({ mode: o.mode, include: "marks,clock", ...(resume != null ? { after_seq: resume } : {}) });
          const source = new EventSource(`${baseUrl}/api/v1/workspaces/${o.workspaceId}/events/stream?${q}`);
          es = source;
          source.onopen = () => {
            if (closed || es !== source) return;
            h.onStatus("connected");
            arm();
          };
          source.onerror = () => {
            if (closed || es !== source) return;
            // Do NOT let the browser reconnect with its own Last-Event-ID: that cursor may sit past safe_seq.
            // Close it and reopen ourselves with the watermark-derived after_seq.
            h.onStatus("connecting");
            source.close();
            es = null;
            clearTimeout(watchdog);
            clearTimeout(reopen);
            reopen = setTimeout(() => void open(), 1_000);
          };
          source.addEventListener("clock", (msg) => {
            try {
              const c = JSON.parse((msg as MessageEvent).data) as ClockMessage;
              observeServerNow(c.server_now);
              wm = noteClock(wm, c.safe_seq);
              h.onClock?.(c);
              arm();
              if (isBehind(wm)) void runCatchUp(resumeAfter(wm));
            } catch {
              /* ignore */
            }
          });
          source.addEventListener("proposal.updated", (msg) => {
            try {
              applyEnvelope(JSON.parse((msg as MessageEvent).data) as EventEnvelope<"proposal.updated", ProposalUpdated>);
            } catch {
              /* ignore malformed */
            }
          });
          source.addEventListener("mark", (msg) => {
            try {
              h.onMark?.(JSON.parse((msg as MessageEvent).data) as MarkMessage);
            } catch {
              /* ignore */
            }
          });
          // One listener per envelope type the feed renders (SSE names the event after its type).
          for (const type of FEED_TYPES) {
            source.addEventListener(type, (msg) => {
              try {
                applyEnvelope(JSON.parse((msg as MessageEvent).data) as AnyEvent);
              } catch {
                /* ignore malformed */
              }
            });
          }
        } finally {
          opening = false;
        }
      };
      void open();
      return () => {
        closed = true;
        clearTimeout(watchdog);
        clearTimeout(reopen);
        es?.close();
      };
    },
  };
}

/** Envelope types the feed renders; each is its own SSE `event:` name. Unknown types are ignored on the stream. */
const FEED_TYPES = [
  "coin.detected",
  "screener.scored",
  "guard.result",
  "entry.armed",
  "entry.expired",
  "proposal.created",
  "proposal.approved",
  "proposal.rejected",
  "proposal.expired",
  "position.opened",
  "position.closed",
  "exit.triggered",
] as const;

function supabaseAdapter(o: RealtimeOptions): RealtimeAdapter | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  // Skeleton only: wiring needs @supabase/supabase-js + a user session. Shape:
  //   supabase.channel(ch.events).on("postgres_changes", {event: "INSERT", schema: "public", table: "events", filter: ch.filter}, ...)
  //   supabase.channel(ch.marks).on("broadcast", {event: "mark"}, ...).on("broadcast", {event: "clock"}, ...)
  //   on (re)subscribe: GET /events?after_seq=<lastSeq> to fill the gap, then apply realtime rows with seq > lastSeq.
  void supabaseChannels(o.workspaceId, o.mode);
  return null;
}

export function createRealtime(o: RealtimeOptions): RealtimeAdapter {
  const kind = process.env.NEXT_PUBLIC_REALTIME;
  if (kind === "supabase") return supabaseAdapter(o) ?? sseAdapter("sse", process.env.NEXT_PUBLIC_SSE_BASE ?? "", o);
  if (kind === "sse") return sseAdapter("sse", process.env.NEXT_PUBLIC_SSE_BASE ?? "", o);
  return sseAdapter("mock", "", o);
}
