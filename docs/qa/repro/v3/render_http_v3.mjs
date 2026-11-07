#!/usr/bin/env node
/**
 * BUG_HUNT_v3 - real server-render probe (DATA_SOURCE=http) for the paper web app.
 *
 * Starts from the same scratch stack as http_paper_v3.mjs (paper API on :8091, scratch DB with the
 * closed + open fixtures) and fetches the Next.js pages from a dev server launched with
 *   DATA_SOURCE=http API_BASE_URL=http://127.0.0.1:8091 next dev -p 3111
 * signing in over the real SIWS routes and passing the session cookies the browser would carry.
 * This is HTML the server actually rendered, not a re-implementation of the view.
 *
 * Phantom itself is still UNVERIFIED (no browser wallet here); the cookies are minted with the
 * synthetic test owner described in docs/qa/BUG_HUNT_v3.md.
 *
 *   node docs/qa/repro/v3/render_http_v3.mjs
 * Env: BB_WEB (default http://127.0.0.1:3111), BB_API (default http://127.0.0.1:8091).
 */
import { createPrivateKey, createPublicKey, sign } from "node:crypto";

const WEB = process.env.BB_WEB ?? "http://127.0.0.1:3111";
const API = process.env.BB_API ?? "http://127.0.0.1:8091";
const DOMAIN = "localhost:3100";
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
const defects = [];
const check = (id, ok, detail) => { results.push({ id, ok: Boolean(ok), detail }); return ok; };
const defect = (id, ok, detail) => { defects.push({ id, ok: Boolean(ok), detail }); return ok; };
const count = (hay, needle) => hay.split(needle).length - 1;
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

async function api(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// 1. Sign in (synthetic test owner) and mint the session cookie the web app forwards.
const nonce = await api("POST", "/v1/auth/siws/nonce", { address: ADDRESS, domain: DOMAIN, uri: `http://${DOMAIN}` });
const verify = await api("POST", "/v1/auth/siws/verify", {
  address: ADDRESS, message: nonce.json.data.message, signature: b58(sign(null, Buffer.from(nonce.json.data.message, "utf8"), priv)), client: "web",
});
if (verify.status !== 200) { console.error("login failed", verify.status, verify.json); process.exit(1); }
const token = verify.json.data.access_token;
const ws = verify.json.data.workspace_id;
const cookie = `centurion_at=${token}; centurion_ws=${ws}`;

async function page(path) {
  const res = await fetch(`${WEB}${path}`, { headers: { cookie, accept: "text/html" }, redirect: "manual" });
  return { status: res.status, html: await res.text() };
}

// 2. Pages the paper DoD names.
const dashboard = await page("/");
const pnl = await page("/pnl");
const strategies = await page("/strategies");
const positions = await page("/positions");
const coins = await page("/coins");
const coinDetail = await page("/coins/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

check("GET / renders 200 with session cookies (http mode)", dashboard.status === 200 && dashboard.html.includes("BB v3 probe"), { status: dashboard.status, has_strategy: dashboard.html.includes("BB v3 probe") });
check("GET /pnl renders 200", pnl.status === 200, { status: pnl.status });
check("GET /strategies renders 200", strategies.status === 200, { status: strategies.status });
check("GET /positions renders 200", positions.status === 200, { status: positions.status });
check("GET /coins renders 200", coins.status === 200, { status: coins.status });
defect("DEFECT: GET /coins/{mint} is 500 in http paper mode (getCoinTrail always fetches mode=real -> REAL_SOL_DISABLED)", coinDetail.status === 500, { status: coinDetail.status, cause: "apps/web/lib/http-api.ts:284 timeline('real') rejects; timeline() only catches NOT_FOUND/VALIDATION_FAILED (lines 279-281)" });

// 3. F1: the all-time PnL report card (no portfolio snapshot -> null) renders em dashes.
const dashCard = count(dashboard.html, 'data-testid="pnl-not-reported"');
check("F1 dashboard all-time PnL card: null realized/unrealized/total -> em dash", dashCard >= 3, { em_dash_cells: dashCard });

const reconcile = /data-testid="pnl-reconcile"[^>]*>([\s\S]*?)<\/p>/.exec(pnl.html);
const reconcileText = reconcile ? text(reconcile[1]) : null;
check("F1 /pnl reconcile note: all-time side is an em dash, range side is a real number", Boolean(reconcileText) && reconcileText.includes("\u2014") && /range realized \([+-]?[\d.,]+ paper SOL\)/.test(reconcileText), { note: reconcileText });

const pnlText = text(pnl.html);
check("F1 /pnl ledger renders the closed trade PnL (+0.05 paper SOL), not a zero", pnlText.includes("+0.05") || pnlText.includes("+0.05 paper SOL"), { snippet: (pnlText.match(/[^ ]{0,20}0\.05[^ ]{0,20}/) ?? [null])[0] });

// 4. P2: the dashboard summary tile still coerces the null overview to 0.00, while the card above shows an em dash.
const dashboardText = text(dashboard.html);
const tileIdx = dashboardText.indexOf("Realized");
const tileSnippet = tileIdx >= 0 ? dashboardText.slice(tileIdx, tileIdx + 160) : null;
defect("DEFECT: dashboard 'Realized' tile shows 0.00 when /portfolio/overview is null (card shows em dash)", Boolean(tileSnippet) && tileSnippet.includes("0.00"), { snippet: tileSnippet });

// 5. P2: strategy cards fabricate realized PnL 0.00 (wire has no stats).
const strategiesText = text(strategies.html);
const cardIdx = strategiesText.indexOf("BB v3 probe");
const cardSnippet = cardIdx >= 0 ? strategiesText.slice(cardIdx, cardIdx + 260) : null;
defect("DEFECT: /strategies card shows 0.00 realized while the API sent no stats", Boolean(cardSnippet) && cardSnippet.includes("0.00"), { snippet: cardSnippet });

// 6. Open-position mark / unrealized (0025) and the tradeable chip.
const positionsText = text(positions.html);
check("open position renders mark-driven unrealized (+0.015) and not an em dash", positionsText.includes("0.015"), { snippet: (positionsText.match(/[^ ]{0,24}0\.015[^ ]{0,24}/) ?? [null])[0] });

check("screener renders the not-tradeable chip for the non-wSOL quote coin", coins.html.includes("data-not-tradeable") || text(coins.html).includes("Not tradeable"), { has_chip: coins.html.includes("data-not-tradeable") });
// The detail page cannot render until the P1 above is fixed; the chip there is covered by the component unit
// (data-not-tradeable) and stays UNVERIFIED in http mode.
defect("DEFECT: coin detail not-tradeable reason/CTA cannot be rendered while the page 500s", coinDetail.status !== 200, { status: coinDetail.status });

// 7. New surfaces: Settings Stop card, the per-strategy mode card, and the paused banner.
const settings = await page("/settings");
check("GET /settings renders the workspace Stop card (trading-controls + stop/resume button)", settings.status === 200 && settings.html.includes('data-testid="trading-controls"') && (settings.html.includes('data-testid="trading-stop"') || settings.html.includes('data-testid="trading-resume"')), { status: settings.status });

const strategiesApi = await api("GET", `/v1/workspaces/${ws}/strategies?mode=practice`, undefined, token);
const sRow = (strategiesApi.json?.items ?? [])[0];
const edit = await page(`/strategies/${sRow?.id}/edit`);
check("GET /strategies/{id}/edit renders the per-strategy Paper/Real card (paper-progress + hold copy)", edit.status === 200 && edit.html.includes('data-testid="paper-progress"'), { status: edit.status, strategy: sRow?.id });

const trading = await api("GET", `/v1/workspaces/${ws}/trading`, undefined, token);
const write = (path, rev) => fetch(`${API}/v1/workspaces/${ws}/trading/${path}`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "if-match": `"${rev}"`, "idempotency-key": crypto.randomUUID() },
  body: JSON.stringify({}),
});
const pausedRes = await write("pause-buys", trading.json.data.rev);
const dashPaused = await page("/");
const stratPaused = await page("/strategies");
const banner = { dashboard: dashPaused.html.includes('data-testid="buying-paused-banner"'), strategies: stratPaused.html.includes('data-testid="buying-paused-banner"') };
const afterPause = await api("GET", `/v1/workspaces/${ws}/trading`, undefined, token);
const resumedRes = await write("resume-buys", afterPause.json.data.rev);
const dashResumed = await page("/");
check("Stop buying pause renders the banner on Dashboard + Strategies; resume clears it", pausedRes.status === 200 && banner.dashboard && banner.strategies && resumedRes.status === 200 && !dashResumed.html.includes('data-testid="buying-paused-banner"'), { paused_status: pausedRes.status, banner, resumed_status: resumedRes.status, banner_after_resume: dashResumed.html.includes('data-testid="buying-paused-banner"') });

console.log(JSON.stringify({ web: WEB, api: API, workspace_id: ws, results, defects }, null, 2));
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
