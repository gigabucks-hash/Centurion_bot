import { connection } from "next/server";
import type { ClockMessage, MarkMessage } from "@sentra/contracts/wire";
import { gateMode } from "@/lib/bff";
import { usdToPriceSol, toDecimalString } from "@/lib/contracts";
import { liveEnvelope, workspaceEnvelopes } from "@/lib/mock/events";
import { listOpenPositions, proposalUpdates } from "@/lib/mock/store";
import { approvalToWire } from "@/lib/contracts";
import { cmpSeq, maxSeq, parseSeq, seqGt, type Seq } from "@/lib/seq";

/** SSE clock frame cadence with include=clock (EVENTS_SCHEMA 1.1.2: every 5 s). */
const CLOCK_MS = 5_000;
/** Heartbeat comment for proxies (15 s). */
const HEARTBEAT_MS = 15_000;
const MARK_MS = 2_000;

/**
 * GET /v1/workspaces/{ws}/events/stream?mode=&after_seq=&include=marks,clock (SSE, contracts 1.1.2).
 * - Event frames: `id: <seq string>`, `event: <envelope type>`, `data: <envelope>`. Resume via `Last-Event-ID` or after_seq.
 * - include=clock → `event: clock` every 5 s, `{server_now, safe_seq}`; no id.
 * - include=marks → `event: mark` (MarkMessage) for mints with an open position; no id, never persisted.
 * - `: hb` comment every 15 s.
 * Mock only: synthetic events and prices, no chain or RPC access.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/workspaces/[ws]/events/stream">) {
  await connection();
  const { ws } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const mode = gateMode(q.get("mode"));
  if (mode instanceof Response) return mode;
  const include = new Set((q.get("include") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const resume = parseSeq(req.headers.get("last-event-id")) ?? parseSeq(q.get("after_seq"));
  const enc = new TextEncoder();
  let timers: ReturnType<typeof setTimeout>[] = [];
  let lastSeq: Seq = "0";
  const stream = new ReadableStream({
    start(c) {
      const write = (s: string) => {
        try {
          c.enqueue(enc.encode(s));
        } catch {
          /* closed */
        }
      };
      const send = (event: string, data: unknown, id?: Seq) => write(`${id != null ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      write("retry: 3000\n\n");
      const backlog = workspaceEnvelopes(ws, mode);
      lastSeq = maxSeq(backlog.map((e) => e.seq), "0") ?? "0";
      if (resume != null) for (const e of backlog.filter((x) => seqGt(x.seq, resume)).sort((a, b) => cmpSeq(a.seq, b.seq))) send(e.type, e, e.seq);
      const every = (fn: () => void, ms: number) => timers.push(setInterval(fn, ms) as unknown as ReturnType<typeof setTimeout>);
      if (include.has("clock")) {
        const clock = () => send("clock", { server_now: new Date().toISOString(), safe_seq: lastSeq } satisfies ClockMessage);
        clock();
        every(clock, CLOCK_MS);
      }
      every(() => write(": hb\n\n"), HEARTBEAT_MS);
      if (include.has("marks")) {
        let tick = 0;
        every(() => {
          tick++;
          const ts = new Date().toISOString();
          for (const p of listOpenPositions(mode).slice(0, 4)) {
            const usd = p.nowPriceUsd * (1 + Math.sin(tick / 3 + p.openedAt) * 0.01);
            send("mark", {
              mint: p.mint, price_usd: toDecimalString(usd, 12), price_sol: usdToPriceSol(usd), liquidity_usd: 48_000,
              slot: 300_000_000 + tick, ts, position_ids: [p.key], server_now: ts,
            } satisfies MarkMessage);
          }
        }, MARK_MS);
      }
      // 1.1.4 proposal.updated (quote set/refreshed, rev + 1) from the mock set_approval_quote outbox.
      let lastUpd = Date.now();
      every(() => {
        for (const u of proposalUpdates.filter((x) => x.at > lastUpd && x.approval.mode === mode)) {
          const w = approvalToWire(u.approval);
          const ts = new Date(u.at).toISOString();
          const seq = (BigInt(lastSeq) + 1n).toString();
          lastSeq = seq;
          const payload = {
            proposal_id: w.id, kind: w.kind, rev: w.rev,
            est_network_fee_lamports: w.est_network_fee_lamports, priority_fee_lamports: w.priority_fee_lamports, swap_fee_bps: w.swap_fee_bps, max_slippage_bps: w.max_slippage_bps,
            min_out_raw: w.min_out_raw, total_max_lamports: w.total_max_lamports, quote_ts: w.quote_ts, quote_expires_at: w.quote_expires_at,
          };
          send("proposal.updated", { id: `${w.id}:${u.at}:proposal.updated`, seq, type: "proposal.updated", version: 1, workspace_id: ws, strategy_id: w.strategy_id, ck: null, mint: w.mint, ts, actor: "system", mode, payload, untrusted: {}, server_now: new Date().toISOString() }, seq);
        }
        lastUpd = Math.max(lastUpd, ...proposalUpdates.map((x) => x.at));
      }, 1000);
      let n = 0;
      const loop = () => {
        const e = liveEnvelope(ws, mode, n++, lastSeq);
        lastSeq = e.seq;
        send(e.type, { ...e, server_now: new Date().toISOString() }, e.seq);
        timers.push(setTimeout(loop, 2500 + ((n * 7919) % 3500)));
      };
      timers.push(setTimeout(loop, 1500));
      req.signal.addEventListener("abort", () => {
        timers.forEach(clearTimeout);
        timers = [];
        try {
          c.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      timers.forEach(clearTimeout);
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}
