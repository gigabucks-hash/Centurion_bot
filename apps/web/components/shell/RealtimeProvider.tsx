"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ConnectionState, TradeEvent, TradingMode } from "@/lib/types";
import type { MarkMessage } from "@centurion/contracts/wire";
import { subscribeActivity } from "@/lib/client";
import { createRafBatcher } from "@/lib/raf-batch";

interface RealtimeValue {
  status: ConnectionState;
  events: TradeEvent[];
  paused: boolean;
  setPaused: (p: boolean) => void;
}

const Ctx = createContext<RealtimeValue | null>(null);
/** Display-only marks per mint, in their own context so mark ticks never re-render feed consumers. */
const MarksCtx = createContext<ReadonlyMap<string, MarkMessage>>(new Map());
const MAX = 200;

/**
 * One shared realtime connection per mode that has strategies (SSE is `?mode=` scoped on the wire; per-strategy mode
 * since contracts 1.1.6), merged into one feed for the whole shell. Status = the worst of the connections.
 */
export function RealtimeProvider({ modes, children }: { modes: TradingMode[]; children: ReactNode }) {
  const modesKey = modes.join(",");
  const [status, setStatus] = useState<ConnectionState>("connecting");
  const [events, setEvents] = useState<TradeEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [marks, setMarks] = useState<ReadonlyMap<string, MarkMessage>>(new Map());
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    // Perf: marks can arrive many times per second per mint → keep the latest per mint, one render per frame.
    const batch = createRafBatcher<string, MarkMessage>((b) => setMarks((prev) => new Map([...prev, ...b])));
    const list = modesKey.split(",") as TradingMode[];
    const states = new Map<TradingMode, ConnectionState>();
    const rank: Record<ConnectionState, number> = { connected: 0, connecting: 1, disconnected: 2 };
    const offs = list.map((m) =>
      subscribeActivity(
        m,
        (e) => {
          if (!pausedRef.current) setEvents((prev) => [{ ...e, mode: e.mode ?? m }, ...prev].slice(0, MAX));
        },
        (s) => {
          states.set(m, s);
          setStatus([...states.values()].reduce<ConnectionState>((a, b) => (rank[b] > rank[a] ? b : a), "connected"));
        },
        (mk) => batch.push(mk.mint, mk),
      ),
    );
    return () => {
      batch.cancel();
      offs.forEach((off) => off());
    };
  }, [modesKey]);

  const value = useMemo(() => ({ status, events, paused, setPaused }), [status, events, paused]);
  return (
    <Ctx.Provider value={value}>
      <MarksCtx.Provider value={marks}>{children}</MarksCtx.Provider>
    </Ctx.Provider>
  );
}

export function useMarks(): ReadonlyMap<string, MarkMessage> {
  return useContext(MarksCtx);
}

export function useRealtime(): RealtimeValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRealtime must be used inside <RealtimeProvider>");
  return v;
}
