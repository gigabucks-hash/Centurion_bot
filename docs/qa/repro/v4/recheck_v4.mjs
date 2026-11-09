#!/usr/bin/env node
/**
 * BUG_HUNT_v4 - delta recheck of the v3 web defects at the current tree.
 *
 * Same synthetic SIWS owner and scratch DB pattern as v3, but this probe asserts the FIXED behavior:
 *   - GET /coins/{mint} renders 200 in http paper mode (V3-P1)
 *   - null overview renders "\u2014" on the dashboard tiles, not "flat 0.00" (V3-P2)
 *   - /strategies cards show "\u2014" for realized PnL when the wire has no stats (V3-P2)
 *   - /coins/{mint} now renders the not-tradeable reason + CTA (previously UNVERIFIED)
 *   - /positions still shows the server mark (+0.015) and no invented USD price
 *   - /pnl keeps the F1 em dashes and the real ledger value
 *
 * Run from the repo root AFTER the scratch stack is up (see docs/qa/BUG_HUNT_v4.md):
 *   node docs/qa/repro/v4/recheck_v4.mjs
 * Env: BB_API (8091), BB_WEB (3121), BB_PSQL, PGHOST/PGPORT/PGUSER/PGDATABASE.
 */
import { execFileSync } from "node:child_process";
import { createPrivateKey, createPublicKey, sign, randomUUID } from "node:crypto";

const API = process.env.BB_API ?? "http://127.0.0.1:8091";
const WEB = process.env.BB_WEB ?? "http://127.0.0.1:3121";
const DB = process.env.PGDATABASE ?? "centurion_bbv4";
const PSQL = process.env.BB_PSQL ?? "psql";
// The API was started with AUTH_SIWS_DOMAINS=localhost:3100; the web server port does not matter for SIWS.
const DOMAIN = process.env.BB_SIWS_DOMAIN ?? "localhost:3100";
const MINT_CLOSED = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // wSOL quote -> tradeable
const MINT_OPEN = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC quote -> not tradeable
const WSOL = "So11111111111111111111111111111111111111112";
const USDC = MINT_OPEN;
// Fixture keys are per-run: the scratch DB may already hold rows from an earlier attempt.
const RUN = Date.now().toString();

const SEED = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)); // test-only key
const priv = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), SEED]), format: "der", type: "pkcs8" });
const pub = createPublicKey(priv).export({ format: "der", type: "spki" }).subarray(12);
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
const ADDRESS = b58(pub);

const results = [];
const check = (id, ok, detail) => { results.push({ id, ok: Boolean(ok), detail }); return ok; };
const count = (hay, needle) => hay.split(needle).length - 1;
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

async function api(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch { /* non-JSON */ }
  return { status: res.status, json, raw, etag: res.headers.get("etag") };
}

// 1. SIWS login over the real routes.
const nonce = await api("POST", "/v1/auth/siws/nonce", { body: { address: ADDRESS, domain: DOMAIN, uri: `http://${DOMAIN}` } });
if (nonce.status !== 200) { console.error("nonce failed", nonce.status, nonce.raw); process.exit(1); }
const verify = await api("POST", "/v1/auth/siws/verify", { body: { address: ADDRESS, message: nonce.json.data.message, signature: b58(sign(null, Buffer.from(nonce.json.data.message, "utf8"), priv)), client: "web" } });
if (verify.status !== 200) { console.error("verify failed", verify.status, verify.raw); process.exit(1); }
const token = verify.json.data.access_token;
const ws = verify.json.data.workspace_id;
const cookie = `centurion_at=${token}; centurion_ws=${ws}`;
check("SIWS nonce+verify on scratch paper API", true, { workspace_id: ws, address: ADDRESS });

// 2. Seed the same fixture shape as v3 (closed + open position, tradeable + untradeable coin).
const created = await api("POST", `/v1/workspaces/${ws}/strategies`, {
  token, body: { name: "BB v4 recheck", mode: "practice" }, headers: { "idempotency-key": randomUUID() },
});
if (created.status !== 201 && created.status !== 200) { console.error("strategy create failed", created.status, created.raw); process.exit(1); }

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
  from public.strategies s, (values ('bbv4pc${RUN}', '${MINT_CLOSED}'), ('bbv4po${RUN}', '${MINT_OPEN}')) as v(ck, mint)
 where s.workspace_id = '${ws}' order by s.created_at limit 2
on conflict (strategy_id, mint) do nothing;
insert into public.positions
  (position_key, strategy_id, workspace_id, mint, mode, status, qty_raw, sol_in_lamports, sol_out_lamports,
   fees_lamports, entry_price_sol, exit_price_sol, exit_reason, opened_at, closed_at)
select 'bbv4close.${RUN}', s.id, '${ws}', '${MINT_CLOSED}', 'practice', 'closed', 1000000000, 250000000, 300000000,
       6250000, 0.00025, 0.0003, 'manual', now() - interval '2 hours', now() - interval '1 hour'
  from public.strategies s where s.workspace_id = '${ws}' order by s.created_at limit 1
on conflict (position_key) do nothing;
insert into public.positions
  (position_key, strategy_id, workspace_id, mint, mode, status, qty_raw, sol_in_lamports, sol_out_lamports,
   fees_lamports, entry_price_sol, opened_at)
select 'bbv4open.${RUN}', s.id, '${ws}', '${MINT_OPEN}', 'practice', 'open', 1000000000, 500000000, 0,
       0, 0.000015, now() - interval '30 minutes'
  from public.strategies s where s.workspace_id = '${ws}' order by s.created_at limit 1
on conflict (position_key) do nothing;
`.trim();
execFileSync(PSQL, ["-h", process.env.PGHOST ?? "127.0.0.1", "-p", process.env.PGPORT ?? "55432", "-U", process.env.PGUSER ?? "postgres", "-d", DB, "-v", "ON_ERROR_STOP=1", "-q", "-c", sql], { stdio: ["ignore", "ignore", "inherit"] });

// 3. Wire facts the web reads depend on.
const overview = await api("GET", `/v1/workspaces/${ws}/portfolio/overview?mode=practice`, { token });
check("API overview is still null before the first snapshot", overview.status === 200 && overview.json.data === null, { status: overview.status, data: overview.json?.data });
const strategiesApi = await api("GET", `/v1/workspaces/${ws}/strategies?mode=practice`, { token });
const sWire = (strategiesApi.json?.items ?? [])[0] ?? {};
check("API /strategies still has no stats object", strategiesApi.status === 200 && !("stats" in sWire), { keys: Object.keys(sWire).sort() });
const practiceTimeline = await api("GET", `/v1/workspaces/${ws}/coins/${MINT_OPEN}/timeline?mode=practice&limit=5`, { token });
const realTimeline = await api("GET", `/v1/workspaces/${ws}/coins/${MINT_OPEN}/timeline?mode=real&limit=5`, { token });
check("practice timeline is readable; real timeline is refused in paper mode", practiceTimeline.status === 200 && realTimeline.status === 403 && realTimeline.json?.error?.code === "REAL_SOL_DISABLED", { practice: practiceTimeline.status, real: realTimeline.status, code: realTimeline.json?.error?.code ?? null });

// 4. Real server-rendered HTML from the http-mode web app.
async function page(path) {
  const res = await fetch(`${WEB}${path}`, { headers: { cookie, accept: "text/html" }, redirect: "manual" });
  return { status: res.status, html: await res.text() };
}
const dashboard = await page("/");
const pnl = await page("/pnl");
const strat = await page("/strategies");
const positions = await page("/positions");
const coins = await page("/coins");
const detailUntradeable = await page(`/coins/${MINT_OPEN}`);
const detailTradeable = await page(`/coins/${MINT_CLOSED}`);
const dashText = text(dashboard.html);
const stratText = text(strat.html);
const posText = text(positions.html);
const pnlText = text(pnl.html);

check("GET /coins/{mint} renders 200 in http paper mode (V3-P1 fixed)", detailUntradeable.status === 200 && detailTradeable.status === 200, { untradeable_mint: detailUntradeable.status, tradeable_mint: detailTradeable.status });
check("coin detail renders the not-tradeable reason + disabled CTA (was UNVERIFIED)", detailUntradeable.status === 200 && detailUntradeable.html.includes("data-not-tradeable") && text(detailUntradeable.html).toLowerCase().includes("not tradeable"), { has_marker: detailUntradeable.html.includes("data-not-tradeable"), snippet: (text(detailUntradeable.html).match(/[^.]{0,80}not tradeable[^.]{0,80}/i) ?? [null])[0] });

const realizedIdx = dashText.indexOf("Realized PnL");
const tileSnippet = realizedIdx >= 0 ? dashText.slice(realizedIdx, realizedIdx + 220) : null;
const dashEmDashes = count(dashboard.html, 'data-testid="pnl-not-reported"');
check("dashboard null overview renders \u2014 (no 'flat 0.00', no 0-open count) (V3-P2 fixed)", realizedIdx >= 0 && tileSnippet.includes("\u2014") && !tileSnippet.includes("flat 0.00") && !/\b0 \//.test(tileSnippet) && dashEmDashes >= 3, { em_dash_cells: dashEmDashes, snippet: tileSnippet });

const cardIdx = stratText.indexOf("BB v4 recheck");
const cardSnippet = cardIdx >= 0 ? stratText.slice(cardIdx, cardIdx + 320) : null;
check("strategy card shows \u2014 realized when the wire has no stats (V3-P2 fixed)", Boolean(cardSnippet) && cardSnippet.includes("Realized") && cardSnippet.includes("\u2014") && !cardSnippet.includes("0.00"), { snippet: cardSnippet });

check("open position keeps server mark unrealized (+0.015) and no invented USD", posText.includes("+0.015"), { snippet: (posText.match(/[^ ]{0,28}0\.015[^ ]{0,28}/) ?? [null])[0] });
check("positions page has no synthetic USD from the 150 USD/SOL constant", !posText.includes("$0.00225"), { usd_hits: (posText.match(/\$0\.\d+/g) ?? []).slice(0, 3) });

check("F1 stays green: /pnl ledger keeps +0.05 and the null card keeps 3 em dashes", pnlText.includes("+0.05") && count(pnl.html, 'data-testid="pnl-not-reported"') >= 3, { em_dash_cells: count(pnl.html, 'data-testid="pnl-not-reported"'), snippet: (pnlText.match(/[^ ]{0,16}0\.05[^ ]{0,16}/) ?? [null])[0] });
check("pages render 200 with the session cookie", dashboard.status === 200 && pnl.status === 200 && strat.status === 200 && positions.status === 200 && coins.status === 200, { statuses: [dashboard.status, pnl.status, strat.status, positions.status, coins.status] });

console.log(JSON.stringify({ api: API, web: WEB, workspace_id: ws, results }, null, 2));
process.exitCode = results.every((r) => r.ok) ? 0 : 1;

