"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ConnectionState, TradeEvent, TradingMode } from "@/lib/types";
import type { MarkMessage } from "@sentra/contracts/wire";
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

/** One shared realtime connection per workspace mode for the whole shell. */
export function RealtimeProvider({ mode, children }: { mode: TradingMode; children: ReactNode }) {
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
    const off = subscribeActivity(
      mode,
      (e) => {
        if (!pausedRef.current) setEvents((prev) => [e, ...prev].slice(0, MAX));
      },
      setStatus,
      (m) => batch.push(m.mint, m),
    );
    return () => {
      batch.cancel();
      off();
    };
  }, [mode]);

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
