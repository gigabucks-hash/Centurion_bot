"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ConnectionState, TradeEvent, TradingMode } from "@/lib/types";
import { subscribeActivity } from "@/lib/client";

interface RealtimeValue {
  status: ConnectionState;
  events: TradeEvent[];
  paused: boolean;
  setPaused: (p: boolean) => void;
}

const Ctx = createContext<RealtimeValue | null>(null);
const MAX = 200;

/** One shared realtime connection per workspace mode for the whole shell. */
export function RealtimeProvider({ mode, children }: { mode: TradingMode; children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionState>("connecting");
  const [events, setEvents] = useState<TradeEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    return subscribeActivity(
      mode,
      (e) => {
        if (!pausedRef.current) setEvents((prev) => [e, ...prev].slice(0, MAX));
      },
      setStatus,
    );
  }, [mode]);

  const value = useMemo(() => ({ status, events, paused, setPaused }), [status, events, paused]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRealtime(): RealtimeValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRealtime must be used inside <RealtimeProvider>");
  return v;
}
