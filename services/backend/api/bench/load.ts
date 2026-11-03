// PERF_SECURITY baseline: REST read/write latency (p50/p95/p99) and SSE fan-out latency against a local API with a
// seeded throwaway DB (same harness as the tests). Run: PGHOST=/tmp PGPORT=55432 PGUSER=postgres node bench/load.ts
// Env: BENCH_N (requests per endpoint, default 400), BENCH_C (concurrency, default 16), BENCH_SSE (clients, 20),
// BENCH_SSE_POLL_MS (feed poll interval, default the production default 500). Output: a JSON summary on stdout.
import { performance } from "node:perf_hooks";
import { APPROVAL, OWNER, POS, WS, startHarness, token } from "../test/helpers.ts";

const N = Number(process.env.BENCH_N ?? 400);
const C = Number(process.env.BENCH_C ?? 16);
const SSE_CLIENTS = Number(process.env.BENCH_SSE ?? 20);
const POLL = process.env.BENCH_SSE_POLL_MS ?? "500";
const S1 = "20000000-0000-0000-0000-0000000000a1";

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return Number((s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? NaN).toFixed(2));
};

async function run(name: string, n: number, c: number, one: (i: number) => Promise<number>) {
  const lat: number[] = [];
  let errors = 0;
  let next = 0;
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: c }, async () => {
      while (next < n) {
        const i = next++;
        const s = performance.now();
        const status = await one(i);
        lat.push(performance.now() - s);
        if (status >= 400) errors++;
      }
    }),
  );
  const secs = (performance.now() - t0) / 1000;
  return { name, n, c, rps: Math.round(n / secs), p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), errors };
}

const h = await startHarness({
  SSE_POLL_MS: POLL,
  RATE_LIMIT_WRITE_IP_PER_MIN: "100000",
  RATE_LIMIT_WRITE_USER_PER_MIN: "100000",
  RATE_LIMIT_WRITE_ROUTE_PER_MIN: "100000",
});
try {
  // realistic volume: 20k coins + picks, 50k events, 2k closed positions (bench DB only)
  await h.db.query(`
    insert into public.coins (mint, venue, decimals, token_program, first_seen_at, market_cap_lamports, mcap_as_of)
      select 'BenchMint' || lpad(translate(g::text, '0', 'z'), 34, 'x'), 'curve', 6, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
             now() - g * interval '1 second', 1000000000 + g, now() from generate_series(1, 20000) g;
    insert into public.picks (ck, workspace_id, strategy_id, mint, stage, score, created_at, updated_at)
      select 'bench' || g, '${WS}', '${S1}', 'BenchMint' || lpad(translate(g::text, '0', 'z'), 34, 'x'),
             (array['found','rejected','passed'])[1 + g % 3]::public.pick_stage, 0.5,
             now() - g * interval '1 second', now() - g * interval '1 second' from generate_series(1, 20000) g;
    insert into public.events (id, workspace_id, strategy_id, mint, ts, type, actor, payload)
      select 'bench' || g || ':' || g || ':coin.detected', '${WS}', '${S1}', 'BenchMint' || lpad(translate((1 + g % 20000)::text, '0', 'z'), 34, 'x'),
             now() - g * interval '100 ms', 'coin.detected', 'ingest', '{}'::jsonb from generate_series(1, 50000) g;
    insert into public.positions (position_key, strategy_id, workspace_id, mint, status, qty_raw, sol_in_lamports,
                                  sol_out_lamports, cost_basis_lamports, entry_price_sol, exit_price_sol, exit_reason,
                                  opened_at, closed_at)
      select 'bench' || g || '.1', '${S1}', '${WS}', 'BenchMint' || lpad(translate(g::text, '0', 'z'), 34, 'x'), 'closed', 0, 100000000, 90000000,
             100000000, 0.0000001, 0.00000009, 'loss_guard', now() - g * interval '1 minute', now() - g * interval '30 seconds'
        from generate_series(1, 2000) g;
    analyze;`);
  const tok = token(OWNER, { client: "desktop" });
  const get = (path: string) => async () => (await fetch(h.base + path, { headers: { authorization: `Bearer ${tok}`, "accept-encoding": "br, gzip" } }).then(async (r) => (await r.arrayBuffer(), r.status)));
  const reads = [
    ["GET /healthz", "/healthz"],
    ["GET picks (50)", `/v1/workspaces/${WS}/picks?limit=50`],
    ["GET coins (50)", `/v1/workspaces/${WS}/coins?limit=50`],
    ["GET positions closed (50)", `/v1/workspaces/${WS}/positions?state=closed&limit=50`],
    ["GET events (100)", `/v1/workspaces/${WS}/events?limit=100`],
    ["GET approvals", `/v1/workspaces/${WS}/approvals`],
    ["GET portfolio overview", `/v1/workspaces/${WS}/portfolio/overview`],
    ["GET exit-reason stats", `/v1/workspaces/${WS}/stats/exit-reasons`],
  ] as const;
  const out: Record<string, unknown>[] = [];
  for (const [name, path] of reads) {
    await run("warmup", 20, 4, get(path));
    out.push(await run(name, N, C, get(path)));
  }
  // writes: quote refresh (coalesced 3 s, so mostly a read-modify path) and close preview; strategy PATCH sequential
  const post = (path: string, body: unknown) => async () =>
    fetch(h.base + path, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(body) }).then(async (r) => (await r.arrayBuffer(), r.status));
  out.push(await run("POST approvals/{id}/quote", N, C, post(`/v1/workspaces/${WS}/approvals/${APPROVAL}/quote`, {})));
  out.push(await run("POST positions/{id}/close/preview", N, C, post(`/v1/workspaces/${WS}/positions/${POS}/close/preview`, {})));
  let rev = (await (await fetch(`${h.base}/v1/workspaces/${WS}/strategies/${S1}`, { headers: { authorization: `Bearer ${tok}` } })).json()).data.rev as number;
  out.push(
    await run("PATCH strategy (tighten, rev chain)", Math.min(N, 200), 1, async (i) => {
      const r = await fetch(`${h.base}/v1/workspaces/${WS}/strategies/${S1}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${tok}`, "content-type": "application/json", "idempotency-key": crypto.randomUUID(), "if-match": `"${rev}"` },
        body: JSON.stringify({ name: `S1-${i}` }),
      });
      const b = await r.json();
      if (r.status === 200) rev = b.data.rev;
      return r.status;
    }),
  );
  // SSE fan-out: N clients on the workspace stream; insert one event, measure insert -> receipt per client
  const ac = new AbortController();
  const recv: number[][] = Array.from({ length: SSE_CLIENTS }, () => []);
  const marks = new Map<string, number>();
  await Promise.all(
    Array.from({ length: SSE_CLIENTS }, async (_, k) => {
      const r = await fetch(`${h.base}/v1/workspaces/${WS}/events/stream`, { headers: { authorization: `Bearer ${tok}` }, signal: ac.signal });
      const reader = r.body!.getReader();
      const dec = new TextDecoder();
      (async () => {
        let buf = "";
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) return;
            buf += dec.decode(value, { stream: true });
            for (const m of buf.matchAll(/fanout-(\d+)/g)) {
              const at = marks.get(m[1]!);
              if (at !== undefined) recv[k]!.push(performance.now() - at);
              marks.set(`seen-${k}-${m[1]}`, 1);
            }
            buf = buf.slice(-64);
          }
        } catch {
          /* aborted */
        }
      })();
    }),
  );
  await new Promise((r) => setTimeout(r, 1500));
  const ROUNDS = 20;
  for (let i = 0; i < ROUNDS; i++) {
    marks.set(String(i), performance.now());
    await h.db.query(`select public.emit_ws_event($1, 'bench', 'system.notice', null, null, 'system', $2::jsonb)`, [WS, JSON.stringify({ code: `fanout-${i}`, message: "bench" })]);
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 300));
  }
  await new Promise((r) => setTimeout(r, 1500));
  ac.abort();
  const all = recv.flat();
  out.push({ name: `SSE fan-out (${SSE_CLIENTS} clients, poll ${POLL} ms)`, n: all.length, expected: ROUNDS * SSE_CLIENTS, p50: pct(all, 50), p95: pct(all, 95), p99: pct(all, 99) });
  console.log(JSON.stringify({ at: new Date().toISOString(), node: process.version, n: N, c: C, results: out }, null, 1));
} finally {
  await h.stop();
}
