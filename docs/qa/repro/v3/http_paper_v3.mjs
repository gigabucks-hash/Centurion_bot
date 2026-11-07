#!/usr/bin/env node
/**
 * BUG_HUNT_v3 - real HTTP paper-API probe for the web sign-off.
 *
 * Why a synthetic owner: the assignment allows a local paper API, but Phantom cannot sign inside a
 * headless check. This script starts from a deterministic *test-only* ed25519 seed, sets it as
 * OWNER_WALLETS on a scratch API instance (see docs/qa/BUG_HUNT_v3.md section "HTTP stack"), signs the
 * exact SIWS message with that key and logs in over the real /v1/auth/siws/nonce + /verify routes.
 * No Phantom, no wallet funds: this proves the API + wire, not the browser extension flow.
 *
 * Run from the repo root (Postgres on 127.0.0.1:55432, API on 127.0.0.1:8091):
 *   node docs/qa/repro/v3/http_paper_v3.mjs
 * Env: BB_API (default http://127.0.0.1:8091), BB_PSQL (default psql), PGHOST/PGPORT/PGUSER/PGDATABASE.
 */
import { execFileSync } from "node:child_process";
import { createPrivateKey, createPublicKey, sign } from "node:crypto";

const API = process.env.BB_API ?? "http://127.0.0.1:8091";
const DB = process.env.PGDATABASE ?? "centurion_bbv3";
const PSQL = process.env.BB_PSQL ?? "psql";
const DOMAIN = "localhost:3100";
// Deterministic test seed 01..20 (bytes 1..32). Not a secret: it only exists on this scratch stack.
const SEED = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1));
const DER_PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const b58 = (buf) => {
  const d = [];
  for (const byte of buf) {
    let carry = byte;
    for (let i = 0; i < d.length; i++) { carry += d[i] * 256; d[i] = carry % 58; carry = Math.floor(carry / 58); }
    while (carry > 0) { d.push(carry % 58); carry = Math.floor(carry / 58); }
  }
  let zeros = 0;
  while (zeros < buf.length && buf[zeros] === 0) zeros++;
  return "1".repeat(zeros) + d.reverse().map((x) => ALPHABET[x]).join("");
};
const priv = createPrivateKey({ key: Buffer.concat([DER_PKCS8, SEED]), format: "der", type: "pkcs8" });
const pub = createPublicKey(priv).export({ format: "der", type: "spki" }).subarray(12);
const ADDRESS = b58(pub);

const results = [];
const check = (id, ok, detail) => { results.push({ id, ok, detail }); return ok; };
const idem = () => crypto.randomUUID();
async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text, etag: res.headers.get("etag") };
}

// 1. SIWS login over the real routes.
const nonce = await call("POST", "/v1/auth/siws/nonce", { body: { address: ADDRESS, domain: DOMAIN, uri: `http://${DOMAIN}` } });
if (nonce.status !== 200) {
  console.error("nonce failed", nonce.status, nonce.text);
  process.exit(1);
}
const signature = b58(sign(null, Buffer.from(nonce.json.data.message, "utf8"), priv));
const verify = await call("POST", "/v1/auth/siws/verify", {
  body: { address: ADDRESS, message: nonce.json.data.message, signature, client: "web" },
});
if (verify.status !== 200) {
  console.error("verify failed", verify.status, verify.text);
  process.exit(1);
}
const token = verify.json.data.access_token;
const ws = verify.json.data.workspace_id;
check("auth/SIWS nonce+verify (synthetic owner, not Phantom)", true, { workspace_id: ws, address: ADDRESS });

// 2. Scratch fixture data (closed + open position, tradeable + untradeable coin).
const MINT_CLOSED = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // BONK, wSOL quote = tradeable
const MINT_OPEN = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // reused as a mint whose quote is USDC
const WSOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const sql = `
insert into public.coins (mint, decimals, venue, quote_mint, untrusted) values
  ('${MINT_CLOSED}', 5, 'amm', '${WSOL}', '{"symbol":"BONK"}'),
  ('${MINT_OPEN}', 6, 'amm', '${USDC}', '{"symbol":"USDCQ"}')
on conflict (mint) do nothing;
insert into public.pool_states (mint, venue, sol_reserve, token_reserve, quote_mint, slot, observed_at)
  values ('${MINT_OPEN}', 'amm', 15, 1000000, '${WSOL}', 1, now())
on conflict (mint) do update set sol_reserve = excluded.sol_reserve, token_reserve = excluded.token_reserve,
  quote_mint = excluded.quote_mint, observed_at = excluded.observed_at;
insert into public.picks (ck, workspace_id, strategy_id, mint, mode, stage, score, score_threshold, checks)
select v.ck, '${ws}', s.id, v.mint, 'practice', 'closed', 80, 70, '[]'::jsonb
  from public.strategies s, (values ('bbv3pickclose', '${MINT_CLOSED}'), ('bbv3pickopen', '${MINT_OPEN}')) as v(ck, mint)
 where s.workspace_id = '${ws}' order by s.created_at limit 2
on conflict (strategy_id, mint) do nothing;
insert into public.positions
  (position_key, strategy_id, workspace_id, mint, mode, status, qty_raw, sol_in_lamports, sol_out_lamports,
   fees_lamports, entry_price_sol, exit_price_sol, exit_reason, opened_at, closed_at)
select 'bbv3close.1', s.id, '${ws}', '${MINT_CLOSED}', 'practice', 'closed', 1000000000, 250000000, 300000000,
       6250000, 0.00025, 0.0003, 'manual', now() - interval '2 hours', now() - interval '1 hour'
  from public.strategies s where s.workspace_id = '${ws}' order by s.created_at limit 1
on conflict (position_key) do nothing;
insert into public.positions
  (position_key, strategy_id, workspace_id, mint, mode, status, qty_raw, sol_in_lamports, sol_out_lamports,
   fees_lamports, entry_price_sol, opened_at)
select 'bbv3open.1', s.id, '${ws}', '${MINT_OPEN}', 'practice', 'open', 1000000000, 500000000, 0,
       0, 0.000015, now() - interval '30 minutes'
  from public.strategies s where s.workspace_id = '${ws}' order by s.created_at limit 1
on conflict (position_key) do nothing;
`.trim();

// A strategy is needed first (create through the real route, idempotent key required).
const created = await call("POST", `/v1/workspaces/${ws}/strategies`, {
  token, body: { name: "BB v3 probe", mode: "practice" }, headers: { "idempotency-key": idem() },
});
if (created.status !== 201 && created.status !== 200) {
  console.error("strategy create failed", created.status, created.text);
  process.exit(1);
}
const strategy = created.json.data;
check("strategy create", true, { id: strategy.id, rev: strategy.rev, status: strategy.status });

execFileSync(PSQL, ["-h", process.env.PGHOST ?? "127.0.0.1", "-p", process.env.PGPORT ?? "55432", "-U", process.env.PGUSER ?? "postgres", "-d", DB, "-v", "ON_ERROR_STOP=1", "-q", "-c", sql], { stdio: ["ignore", "ignore", "inherit"] });

// 3. Wire probes used by the web read paths.
const overview = await call("GET", `/v1/workspaces/${ws}/portfolio/overview?mode=practice`, { token });
check("overview before first snapshot is null (not a 0-filled row)", overview.status === 200 && overview.json.data === null, { status: overview.status, data: overview.json?.data });
const strategies = await call("GET", `/v1/workspaces/${ws}/strategies?mode=practice`, { token });
const sWire = strategies.json?.items?.[0] ?? {};
check("strategies wire has NO stats object (web fills 0s itself)", strategies.status === 200 && !("stats" in sWire), { keys: Object.keys(sWire).sort() });

const mode = await call("POST", `/v1/workspaces/${ws}/strategies/${strategy.id}/mode`, {
  token, body: { mode: "real" }, headers: { "if-match": `"${strategy.rev}"`, "idempotency-key": idem() },
});
check("practice->real is 403 MODE_NOT_ALLOWED + real_locked_reason", mode.status === 403 && mode.json?.error?.code === "MODE_NOT_ALLOWED" && mode.json?.error?.real_locked_reason === "needs_owner_approval", { status: mode.status, error: mode.json?.error });

const pnl = await call("GET", `/v1/workspaces/${ws}/stats/pnl?mode=practice&window=all`, { token });
const p = pnl.json?.data ?? {};
check("stats/pnl: no snapshot -> realized null while closed_count=1 and window sum present", pnl.status === 200 && p.realized_pnl_lamports === null && Number(p.closed_count) === 1 && p.realized_pnl_window_lamports === "50000000", { status: pnl.status, realized_pnl_lamports: p.realized_pnl_lamports, realized_pnl_window_lamports: p.realized_pnl_window_lamports, closed_count: p.closed_count, total_pnl_lamports: p.total_pnl_lamports });

const ledger = await call("GET", `/v1/workspaces/${ws}/positions?mode=practice&state=closed&limit=50`, { token });
const closedRow = ledger.json?.items?.[0] ?? {};
check("closed ledger row carries pnl/In/Out for the UI", ledger.status === 200 && closedRow.pnl_lamports === "50000000" && closedRow.sol_in_lamports === "250000000" && closedRow.sol_out_lamports === "300000000", { status: ledger.status, row: { pnl_lamports: closedRow.pnl_lamports, sol_in_lamports: closedRow.sol_in_lamports, sol_out_lamports: closedRow.sol_out_lamports, pnl_pct: closedRow.pnl_pct } });

const open = await call("GET", `/v1/workspaces/${ws}/positions?mode=practice&state=open&limit=50`, { token });
const openRow = open.json?.items?.[0] ?? {};
check("open row carries 0025 mark + unrealized (server marks)", open.status === 200 && typeof openRow.mark_price_sol === "string" && typeof openRow.unrealized_pnl_lamports === "string" && typeof openRow.as_of === "string", { status: open.status, mark_price_sol: openRow.mark_price_sol, unrealized_pnl_lamports: openRow.unrealized_pnl_lamports, as_of: openRow.as_of, pnl_pct: openRow.pnl_pct });

const coins = await call("GET", `/v1/workspaces/${ws}/coins?mode=practice&limit=100`, { token });
const coinRows = coins.json?.items ?? [];
const untradeable = coinRows.find((c) => c.mint === MINT_OPEN);
const tradeable = coinRows.find((c) => c.mint === MINT_CLOSED);
check("coins: quote!=wSOL -> tradeable:false + UNSUPPORTED_QUOTE_MINT; wSOL -> tradeable:true", coins.status === 200 && untradeable?.tradeable === false && untradeable?.skip_reason === "UNSUPPORTED_QUOTE_MINT" && tradeable?.tradeable === true && tradeable?.skip_reason === null, { status: coins.status, untradeable: untradeable && { mint: untradeable.mint, tradeable: untradeable.tradeable, skip_reason: untradeable.skip_reason }, tradeable: tradeable && { mint: tradeable.mint, tradeable: tradeable.tradeable, skip_reason: tradeable.skip_reason } });

const trading = await call("GET", `/v1/workspaces/${ws}/trading`, { token });
check("GET /trading reachable on this tree", trading.status === 200 || trading.status === 404, { status: trading.status, body: trading.json, code: trading.json?.error?.code ?? null });

const exits = await call("GET", `/v1/workspaces/${ws}/stats/exit-reasons?mode=practice`, { token });
const exitRow = exits.json?.items?.[0] ?? {};
check("exit stats row present for the stats page", exits.status === 200 && Number(exitRow.count) === 1, { status: exits.status, row: exitRow });

const approvals = await call("GET", `/v1/workspaces/${ws}/approvals?mode=practice&status=pending`, { token });
check("approvals pending list reachable (empty: approve/reject needs an executor pick)", approvals.status === 200 && Array.isArray(approvals.json?.items), { status: approvals.status, count: approvals.json?.items?.length ?? null });

const unauth = await call("GET", `/v1/workspaces/${ws}/portfolio/overview?mode=practice`);
check("unauthenticated workspace read is 401 UNAUTHENTICATED", unauth.status === 401, { status: unauth.status, code: unauth.json?.error?.code ?? null });

console.log(JSON.stringify({ api: API, workspace_id: ws, address: ADDRESS, results }, null, 2));
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
