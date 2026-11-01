"use client";
/**
 * Realtime adapter (EVENTS_SCHEMA §3). One interface, three transports, chosen by NEXT_PUBLIC_REALTIME:
 * - "mock" (default): this app's mock SSE at /api/v1/workspaces/{ws}/events/stream?mode=&include=marks,clock.
 * - "sse": backend SSE at NEXT_PUBLIC_SSE_BASE + /v1/workspaces/{ws}/events/stream (contracts 1.1.2 SSE_PATH).
 * - "supabase": Supabase Realtime skeleton — postgres_changes on `events` (filter workspace_id + mode),
 *   Broadcast `marks:<ws>:<mode>` (MarkMessage, never persisted) and a 15 s ClockMessage heartbeat.
 *   Not wired in this build (no Supabase client / keys); it reports itself unavailable and falls back to SSE.
 * SSE frames (1.1.2): `event: <envelope type>` + `id: <seq string>`; `event: mark`; `event: clock` every 5 s.
 * Resume: SSE sends `Last-Event-ID` (= last seq) automatically on reconnect; we also pass after_seq.
 * seq is an int64 string: the watermark advances with BigInt (lib/seq.ts), from SSE ids and clock.safe_seq only.
 * Every `server_now` / clock frame updates lib/clock.ts.
 */
import type { AnyEvent, ClockMessage, EventEnvelope, MarkMessage, Mode, ProposalUpdated } from "@sentra/contracts/wire";
import { observeServerNow } from "./clock";
import { envelopeToTradeEvent, KIND_TO_TYPE } from "./contracts";
import { isSeq, seqGt, type Seq } from "./seq";
import type { ConnectionState, TradeEvent } from "./types";

/** Broadcast clock heartbeat (15 s). */
export const CLOCK_INTERVAL_MS = 15_000;
/** SSE `event: clock` cadence with include=clock (5 s). */
export const SSE_CLOCK_INTERVAL_MS = 5_000;
/** Envelope types the feed renders; each is its own SSE `event:` name. Unknown types are ignored. */
const FEED_TYPES = [...new Set([...Object.values(KIND_TO_TYPE), "exit.triggered"])];
const advance = (cur: Seq | undefined, next: unknown): Seq | undefined => (isSeq(next) && (cur == null || seqGt(next, cur)) ? next : cur);

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

export interface RealtimeOptions {
  workspaceId: string;
  mode: Mode;
  /** Last applied seq (resume point). */
  afterSeq?: Seq;
}

/** Channel names the Supabase adapter will use (shared with Flutter). */
export function supabaseChannels(ws: string, mode: Mode) {
  return { events: `events:${ws}:${mode}`, marks: `marks:${ws}:${mode}`, table: "events", filter: `workspace_id=eq.${ws}` };
}

function sseAdapter(kind: "mock" | "sse", baseUrl: string, o: RealtimeOptions): RealtimeAdapter {
  return {
    kind,
    subscribe(h) {
      h.onStatus("connecting");
      let lastSeq = o.afterSeq;
      let es: EventSource | null = null;
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      let closed = false;
      const arm = () => {
        clearTimeout(watchdog);
        // No clock frame for 2 heartbeats → treat as lost and reconnect (resumes from lastSeq).
        watchdog = setTimeout(() => {
          h.onStatus("disconnected");
          open();
        }, SSE_CLOCK_INTERVAL_MS * 2 + 2000);
      };
      const open = () => {
        es?.close();
        if (closed) return;
        const q = new URLSearchParams({ mode: o.mode, include: "marks,clock", ...(lastSeq != null ? { after_seq: lastSeq } : {}) });
        es = new EventSource(`${baseUrl}/api/v1/workspaces/${o.workspaceId}/events/stream?${q}`);
        es.onopen = () => {
          h.onStatus("connected");
          arm();
        };
        es.onerror = () => h.onStatus(es?.readyState === EventSource.CLOSED ? "disconnected" : "connecting");
        const onEnvelope = (msg: Event) => {
          try {
            const m = msg as MessageEvent;
            const env = JSON.parse(m.data) as AnyEvent;
            if (env.mode !== o.mode) return; // never mix Practice and Real
            observeServerNow(env.server_now);
            lastSeq = advance(advance(lastSeq, m.lastEventId), env.seq);
            const e = envelopeToTradeEvent(env);
            if (e) h.onEvent(e);
          } catch {
            /* ignore malformed */
          }
        };
        for (const type of FEED_TYPES) es.addEventListener(type, onEnvelope);
        es.addEventListener("clock", (msg) => {
          try {
            const c = JSON.parse((msg as MessageEvent).data) as ClockMessage;
            observeServerNow(c.server_now);
            lastSeq = advance(lastSeq, c.safe_seq);
            h.onClock?.(c);
            arm();
          } catch {
            /* ignore */
          }
        });
        es.addEventListener("proposal.updated", (msg) => {
          try {
            const m = msg as MessageEvent;
            const env = JSON.parse(m.data) as EventEnvelope<"proposal.updated", ProposalUpdated>;
            if (env.mode !== o.mode) return;
            lastSeq = advance(advance(lastSeq, m.lastEventId), env.seq);
            h.onProposalUpdated?.(env.payload);
          } catch {
            /* ignore malformed */
          }
        });
        es.addEventListener("mark", (msg) => {
          try {
            h.onMark?.(JSON.parse((msg as MessageEvent).data) as MarkMessage);
          } catch {
            /* ignore */
          }
        });
      };
      open();
      return () => {
        closed = true;
        clearTimeout(watchdog);
        es?.close();
      };
    },
  };
}

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
