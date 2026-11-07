#!/usr/bin/env node
/**
 * BUG_HUNT_v3 - /pnl keyset paging, end to end (API + real render).
 *
 * Adds 55 closed paper rows to the scratch workspace (on top of the fixtures from http_paper_v3.mjs),
 * then:
 *   - GET /positions?state=closed&limit=50 -> 50 items + next_cursor
 *   - GET that cursor -> the rest, no overlap
 *   - render /pnl (http web on :3111) -> 50 ledger links + an "older" cursor link
 *   - fetch the page-2 link -> 200 and the remaining rows
 *
 * Run after render_http_v3.mjs and before http_reset_v3.mjs (the reset archives these rows).
 *   node docs/qa/repro/v3/http_pnl_paging_v3.mjs
 * Env: BB_WEB, BB_API, BB_PSQL, PGHOST/PGPORT/PGUSER/PGDATABASE.
 */
import { execFileSync } from "node:child_process";
import { createPrivateKey, createPublicKey, sign } from "node:crypto";

const WEB = process.env.BB_WEB ?? "http://127.0.0.1:3111";
const API = process.env.BB_API ?? "http://127.0.0.1:8091";
const DB = process.env.PGDATABASE ?? "centurion_bbv3";
const PSQL = process.env.BB_PSQL ?? "psql";
const DOMAIN = "localhost:3100";
const MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const SEED = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1));
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

async function api(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const nonce = await api("POST", "/v1/auth/siws/nonce", { address: ADDRESS, domain: DOMAIN, uri: `http://${DOMAIN}` });
const verify = await api("POST", "/v1/auth/siws/verify", {
  address: ADDRESS, message: nonce.json.data.message, signature: b58(sign(null, Buffer.from(nonce.json.data.message, "utf8"), priv)), client: "web",
});
if (verify.status !== 200) { console.error("login failed", verify.status, verify.json); process.exit(1); }
const token = verify.json.data.access_token;
const ws = verify.json.data.workspace_id;
const cookie = `centurion_at=${token}; centurion_ws=${ws}`;

// 55 extra closed rows: pnl 1..55 lamport-scaled, newest first in the ledger.
const sql = `
insert into public.positions
  (position_key, strategy_id, workspace_id, mint, mode, status, qty_raw, sol_in_lamports, sol_out_lamports,
   fees_lamports, entry_price_sol, exit_price_sol, exit_reason, opened_at, closed_at)
select 'bbv3pg.' || n, s.id, '${ws}', '${MINT}', 'practice', 'closed', 1000000000,
       100000000, 100000000 + n * 1000000, 0, 0.00002, 0.000021, 'manual',
       now() - interval '3 hours' + (n || ' minutes')::interval,
       now() - interval '2 hours' + (n || ' minutes')::interval
  from (select id from public.strategies where workspace_id = '${ws}' order by created_at limit 1) s, generate_series(1, 55) as n
on conflict (position_key) do nothing;
`.trim();
execFileSync(PSQL, ["-h", process.env.PGHOST ?? "127.0.0.1", "-p", process.env.PGPORT ?? "55432", "-U", process.env.PGUSER ?? "postgres", "-d", DB, "-v", "ON_ERROR_STOP=1", "-q", "-c", sql], { stdio: ["ignore", "ignore", "inherit"] });

// API paging: 50 + next_cursor, then the remainder.
const p1 = await api("GET", `/v1/workspaces/${ws}/positions?mode=practice&state=closed&limit=50`, undefined, token);
const cursor = p1.json?.next_cursor ?? null;
check("API closed ledger page 1: 50 rows + next_cursor", p1.status === 200 && (p1.json?.items ?? []).length === 50 && typeof cursor === "string", { status: p1.status, rows: p1.json?.items?.length ?? null, cursor: Boolean(cursor) });

const p2 = await api("GET", `/v1/workspaces/${ws}/positions?mode=practice&state=closed&limit=50&cursor=${encodeURIComponent(cursor ?? "")}`, undefined, token);
const ids1 = new Set((p1.json?.items ?? []).map((x) => x.id));
const ids2 = (p2.json?.items ?? []).map((x) => x.id);
check("API closed ledger page 2: remainder, no overlap, next_cursor null", p2.status === 200 && ids2.length > 0 && ids2.every((id) => !ids1.has(id)) && p2.json?.next_cursor === null, { status: p2.status, rows: ids2.length, overlap: ids2.filter((id) => ids1.has(id)).length, next_cursor: p2.json?.next_cursor ?? null });

// Real render: page 1 shows 50 ledger rows; its "older" link renders page 2.
const page1 = await fetch(`${WEB}/pnl`, { headers: { cookie, accept: "text/html" } });
const html1 = await page1.text();
const links1 = count(html1, `href="/coins/${MINT}"`);
const older = /href="([^"]*cursor=[^"]*)"/.exec(html1)?.[1]?.replace(/&amp;/g, "&") ?? null;
// Each ledger row renders the coin link twice (mobile card + desktop row): 50 rows -> 100 links.
check("render /pnl page 1: 200 and 50 ledger rows", page1.status === 200 && links1 === 100, { status: page1.status, rows: links1 / 2 });
check("render /pnl page 1 exposes the older-cursor link", Boolean(older), { href: older });

const pageHref = older?.startsWith("http") ? older : `${WEB}${older ?? "/pnl"}`;
const page2 = await fetch(pageHref, { headers: { cookie, accept: "text/html" } });
const html2 = await page2.text();
const links2 = count(html2, `href="/coins/${MINT}"`);
check("render /pnl page 2: 200 and the remaining rows", page2.status === 200 && links2 === 12, { status: page2.status, rows: links2 / 2, href: pageHref });

// /pnl filters do not change the null rule: a window switch keeps the all-time card's em dashes.
const filtered = await fetch(`${WEB}/pnl?window=24h`, { headers: { cookie, accept: "text/html" } });
const htmlF = await filtered.text();
check("render /pnl?window=24h: 200 and the all-time card still renders em dashes", filtered.status === 200 && count(htmlF, 'data-testid="pnl-not-reported"') >= 3, { status: filtered.status, em_dash_cells: count(htmlF, 'data-testid="pnl-not-reported"') });

console.log(JSON.stringify({ web: WEB, api: API, workspace_id: ws, results }, null, 2));
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
