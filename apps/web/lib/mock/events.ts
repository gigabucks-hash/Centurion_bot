/** Mock event log in contract envelope form (EVENTS_SCHEMA §1). Backs /events and /events/stream. */
import type { EventEnvelope, Mode } from "@sentra/contracts/wire";
import { tradeEventToEnvelope, type FeedPayload } from "@/lib/contracts";
import { recentEvents, seedStrategies } from "./data";
import { createEventGenerator } from "./stream";
import type { Seq } from "@/lib/seq";

const g = globalThis as unknown as { __sentraLive?: Record<Mode, EventEnvelope<string, FeedPayload>[]> };
const live = (g.__sentraLive ??= { practice: [], real: [] });
const gens: Partial<Record<Mode, ReturnType<typeof createEventGenerator>>> = {};

/** Seeded history + everything streamed so far for this workspace mode (Practice and Real never mix). */
export function workspaceEnvelopes(ws: string, mode: Mode): EventEnvelope<string, FeedPayload>[] {
  const ids = new Set(seedStrategies.filter((s) => s.mode === mode).map((s) => s.id));
  const seeded = recentEvents.filter((e) => e.strategyId && ids.has(e.strategyId)).map((e) => tradeEventToEnvelope(e, { workspaceId: ws, mode }));
  return [...seeded, ...live[mode].map((e) => ({ ...e, workspace_id: ws }))];
}

/** Next synthetic live event. seq strictly increases but skips values (gaps are allowed by the contract). */
export function liveEnvelope(ws: string, mode: Mode, n: number, lastSeq: Seq): EventEnvelope<string, FeedPayload> {
  const next = (gens[mode] ??= createEventGenerator(mode));
  const now = Date.now();
  const e = next(now);
  const floor = BigInt(now) * 10n;
  const seq = ((BigInt(lastSeq) > floor ? BigInt(lastSeq) : floor) + 1n + BigInt(n % 3)).toString();
  const env = tradeEventToEnvelope({ ...e, seq, id: `${e.id}:${seq}` }, { workspaceId: ws, mode });
  live[mode].push(env);
  if (live[mode].length > 500) live[mode].shift();
  return env;
}
