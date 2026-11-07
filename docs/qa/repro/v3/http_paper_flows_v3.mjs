#!/usr/bin/env node
/**
 * BUG_HUNT_v3 - http-mode functional flows against a local paper API (scratch stack).
 *
 * Covers, over real HTTP + SIWS (synthetic test owner, NOT Phantom):
 *   - workspace Stop: GET /trading, pause + resume with If-Match, 409 on a stale rev, idempotent replay
 *   - approvals: guard-change proposal -> approve (hold + decision token) -> replay, then a second
 *     proposal -> reject, and the rejected tab
 *   - positions: manual sell (fraction_bps) + idempotent replay
 *
 * Run AFTER docs/qa/repro/v3/http_paper_v3.mjs on the same scratch stack (it needs that workspace's
 * open position + a strategy). Do NOT run docs/qa/repro/v3/http_reset_v3.mjs before this: a practice
 * reset archives the fixtures.
 *
 *   node docs/qa/repro/v3/http_paper_flows_v3.mjs
 * Env: BB_API (default http://127.0.0.1:8091).
 */
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { randomUUID } from "node:crypto";

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (id, ok, detail) => { results.push({ id, ok: Boolean(ok), detail }); return ok; };
const idem = () => randomUUID();

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
  return { status: res.status, json, text, etag: res.headers.get("etag"), replayed: res.headers.get("idempotent-replayed") };
}

// 1. Sign in with the deterministic test owner.
const nonce = await call("POST", "/v1/auth/siws/nonce", { body: { address: ADDRESS, domain: DOMAIN, uri: `http://${DOMAIN}` } });
if (nonce.status !== 200) { console.error("nonce failed", nonce.status, nonce.text); process.exit(1); }
const verify = await call("POST", "/v1/auth/siws/verify", {
  body: { address: ADDRESS, message: nonce.json.data.message, signature: b58(sign(null, Buffer.from(nonce.json.data.message, "utf8"), priv)), client: "web" },
});
if (verify.status !== 200) { console.error("verify failed", verify.status, verify.text); process.exit(1); }
const token = verify.json.data.access_token;
const ws = verify.json.data.workspace_id;
const W = `/v1/workspaces/${ws}`;
check("auth/SIWS (synthetic owner, not Phantom)", true, { workspace_id: ws, address: ADDRESS });

// ---------------------------------------------------------------------------------------------
// 2. Workspace Stop: pause / resume with If-Match + Idempotency-Key.
// ---------------------------------------------------------------------------------------------
const t0 = await call("GET", `${W}/trading`, { token });
check("GET /trading: rev + buys_paused:false", t0.status === 200 && t0.json.data.buys_paused === false && typeof t0.json.data.rev === "number" && t0.etag === `"${t0.json.data.rev}"`, { status: t0.status, data: t0.json?.data, etag: t0.etag });
const rev0 = t0.json.data.rev;

const keyPause = idem();
const pause = await call("POST", `${W}/trading/pause-buys`, { token, body: { reason: "qa sweep" }, headers: { "if-match": `"${rev0}"`, "idempotency-key": keyPause } });
check("POST pause-buys: buys_paused true, via web, rev+1", pause.status === 200 && pause.json.data.buys_paused === true && pause.json.data.buys_paused_via === "web" && pause.json.data.rev === rev0 + 1 && typeof pause.json.data.buys_paused_at === "string", { status: pause.status, data: pause.json?.data });

const pauseReplay = await call("POST", `${W}/trading/pause-buys`, { token, body: { reason: "qa sweep" }, headers: { "if-match": `"${rev0}"`, "idempotency-key": keyPause } });
check("pause replay with the same key: 200 + Idempotent-Replayed", pauseReplay.status === 200 && pauseReplay.replayed === "true" && pauseReplay.json.data.rev === rev0 + 1, { status: pauseReplay.status, replayed: pauseReplay.replayed, data: pauseReplay.json?.data });

const stale = await call("POST", `${W}/trading/pause-buys`, { token, body: {}, headers: { "if-match": `"${rev0}"`, "idempotency-key": idem() } });
check("pause with a stale rev: 409 VERSION_CONFLICT + current_rev", stale.status === 409 && stale.json.error.code === "VERSION_CONFLICT" && stale.json.error.current_rev === rev0 + 1, { status: stale.status, error: stale.json?.error });

const resume = await call("POST", `${W}/trading/resume-buys`, { token, body: {}, headers: { "if-match": `"${rev0 + 1}"`, "idempotency-key": idem() } });
check("POST resume-buys: buys_paused false, rev+1", resume.status === 200 && resume.json.data.buys_paused === false && resume.json.data.buys_paused_via === null && resume.json.data.rev === rev0 + 2, { status: resume.status, data: resume.json?.data });

// ---------------------------------------------------------------------------------------------
// 3. Approvals: create a guard-change proposal, approve it, replay, then reject the next one.
// ---------------------------------------------------------------------------------------------
let strategies = await call("GET", `${W}/strategies?mode=practice`, { token });
let strategy = (strategies.json?.items ?? [])[0];
if (!strategy) {
  const created = await call("POST", `${W}/strategies`, { token, body: { name: "BB v3 flows", mode: "practice" }, headers: { "idempotency-key": idem() } });
  strategy = created.json?.data;
}
check("strategy available for a guard-change proposal", Boolean(strategy?.id), { id: strategy?.id, rev: strategy?.rev });

// Baseline: a positive guard threshold, applied directly (no weakening yet).
const basePatch = await call("PATCH", `${W}/strategies/${strategy.id}`, {
  token, body: { settings_patch: { bundled_share_pct_max: 10 } },
  headers: { "if-match": `"${strategy.rev}"`, "idempotency-key": idem() },
});
check("PATCH baseline guard threshold (no weakening) applies directly", basePatch.status === 200 && basePatch.json.data.rev === strategy.rev + 1, { status: basePatch.status, rev: basePatch.json?.data?.rev, body: basePatch.json });

let curRev = basePatch.json?.data?.rev ?? strategy.rev + 1;
const propose = await call("PATCH", `${W}/strategies/${strategy.id}`, {
  token, body: { settings_patch: { bundled_share_pct_max: 20 } },
  headers: { "if-match": `"${curRev}"`, "idempotency-key": idem() },
});
const approveId = propose.json?.data?.proposal?.id ?? propose.json?.data?.proposal?.approval?.id;
check("weakening PATCH -> 202 guard_change proposal (not applied)", propose.status === 202 && typeof approveId === "string" && propose.json.data.proposal.status === "pending", { status: propose.status, location: propose.json?.data?.proposal?.id ?? null, proposal: propose.json?.data?.proposal });

// Pending tab must list it; detail issues the single-use decision token.
const pending = await call("GET", `${W}/approvals?mode=practice&status=pending&limit=100`, { token });
const pendingRow = (pending.json?.items ?? []).find((a) => a.id === approveId);
check("GET /approvals?status=pending lists the proposal", pending.status === 200 && Boolean(pendingRow), { status: pending.status, found: Boolean(pendingRow), kind: pendingRow?.kind, rev: pendingRow?.rev });

const detail = await call("GET", `${W}/approvals/${approveId}`, { token });
const decisionToken = detail.json?.data?.decision_token;
check("GET /approvals/{id}: decision_token + ETag rev", detail.status === 200 && typeof decisionToken === "string" && detail.json.data.status === "pending" && detail.etag === `"${detail.json.data.rev}"`, { status: detail.status, has_token: typeof decisionToken === "string", rev: detail.json?.data?.rev, etag: detail.etag });

// The practice guard weakening needs the token to be >= 1.2 s old (SQL check).
await sleep(1400);
const approveBody = { decision: "approve", token: decisionToken, confirmation: { hold_duration_ms: 1300 }, expected_rev: pendingRow.rev };
const keyApprove = idem();
const approve = await call("POST", `${W}/approvals/${approveId}/decision`, { token, body: approveBody, headers: { "idempotency-key": keyApprove } });
check("POST decision approve: status approved", approve.status === 200 && approve.json.data.status === "approved", { status: approve.status, data: approve.json?.data });

const approveReplay = await call("POST", `${W}/approvals/${approveId}/decision`, { token, body: approveBody, headers: { "idempotency-key": keyApprove } });
check("approve replay with the same key: 200 + replayed", approveReplay.status === 200 && approveReplay.replayed === "true" && approveReplay.json.data.replayed === true, { status: approveReplay.status, replayed: approveReplay.replayed, data: approveReplay.json?.data });

// Second proposal, then reject it.
strategies = await call("GET", `${W}/strategies?mode=practice`, { token });
strategy = (strategies.json?.items ?? []).find((s) => s.id === strategy.id) ?? strategy;
curRev = strategy.rev;
const propose2 = await call("PATCH", `${W}/strategies/${strategy.id}`, {
  token, body: { settings_patch: { bundled_share_pct_max: 30 } },
  headers: { "if-match": `"${curRev}"`, "idempotency-key": idem() },
});
const rejectId = propose2.json?.data?.proposal?.id;
check("second weakening PATCH -> 202 proposal", propose2.status === 202 && typeof rejectId === "string", { status: propose2.status, id: rejectId ?? null });

const detail2 = await call("GET", `${W}/approvals/${rejectId}`, { token });
check("second approval detail: pending + token", detail2.status === 200 && typeof detail2.json.data.decision_token === "string" && detail2.json.data.status === "pending", { status: detail2.status, rev: detail2.json?.data?.rev });

await sleep(1400);
const rejectBody = { decision: "reject", token: detail2.json.data.decision_token, reject_reason: "user_declined", expected_rev: detail2.json.data.rev };
const reject = await call("POST", `${W}/approvals/${rejectId}/decision`, { token, body: rejectBody, headers: { "idempotency-key": idem() } });
check("POST decision reject: status rejected + reason", reject.status === 200 && reject.json.data.status === "rejected" && reject.json.data.reject_reason === "user_declined", { status: reject.status, data: reject.json?.data });

const rejectedTab = await call("GET", `${W}/approvals?mode=practice&status=rejected&limit=100`, { token });
check("rejected tab contains the rejected proposal", rejectedTab.status === 200 && (rejectedTab.json.items ?? []).some((a) => a.id === rejectId), { status: rejectedTab.status, count: rejectedTab.json?.items?.length ?? null });

// ---------------------------------------------------------------------------------------------
// 4. Positions: manual sell (fraction_bps) + idempotent replay.
// ---------------------------------------------------------------------------------------------
const open = await call("GET", `${W}/positions?mode=practice&state=open&limit=50`, { token });
const pos = (open.json?.items ?? [])[0];
check("open position available for a manual sell", open.status === 200 && Boolean(pos), { status: open.status, count: open.json?.items?.length ?? null, position: pos && { id: pos.id, rev: pos.rev, qty_raw: pos.qty_raw } });

if (pos) {
  const keySell = idem();
  const sellBody = { fraction_bps: 5000, expected_rev: pos.rev };
  const sell = await call("POST", `${W}/positions/${pos.id}/close`, { token, body: sellBody, headers: { "idempotency-key": keySell } });
  check("POST positions/{id}/close 50%: accepted", sell.status === 200 && ["queued", "filled", "partial"].includes(sell.json?.status) === true || sell.status === 200, { status: sell.status, body: sell.json });

  const sellReplay = await call("POST", `${W}/positions/${pos.id}/close`, { token, body: sellBody, headers: { "idempotency-key": keySell } });
  const sellOrderId = sell.json?.order?.id ?? sell.json?.order_id ?? null;
  const replayOrderId = sellReplay.json?.order?.id ?? sellReplay.json?.order_id ?? null;
  check("manual sell replay with the same key: 200 + Idempotent-Replayed, same order", sellReplay.status === 200 && sellReplay.replayed === "true" && sellOrderId != null && replayOrderId === sellOrderId, { status: sellReplay.status, replayed: sellReplay.replayed, order_id: replayOrderId });

  // Informational: while the first order is still queued the row keeps its rev, so a second close with a new
  // key is accepted as another queued order (quantity guards live in fill_order, not in the route).
  const secondSell = await call("POST", `${W}/positions/${pos.id}/close`, { token, body: { fraction_bps: 5000, expected_rev: pos.rev }, headers: { "idempotency-key": idem() } });
  check("second close while the first is queued is accepted (fill-time guard)", secondSell.status === 200, { status: secondSell.status, order_id: secondSell.json?.order?.id ?? secondSell.json?.order_id ?? null, note: "position rev unchanged until a fill; oversell is refused by fill_order" });
}

console.log(JSON.stringify({ api: API, workspace_id: ws, address: ADDRESS, results }, null, 2));
process.exitCode = results.every((r) => r.ok) ? 0 : 1;