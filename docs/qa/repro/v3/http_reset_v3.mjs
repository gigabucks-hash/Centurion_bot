#!/usr/bin/env node
/**
 * BUG_HUNT_v3 - practice reset + 24 h cooldown (429 RESET_COOLDOWN), over real HTTP.
 *
 * DESTRUCTIVE for the scratch workspace: reset_practice() closes and archives the fixtures and bumps
 * the practice epoch, so run this LAST and only against the throwaway DB (centurion_bbv3).
 *
 *   node docs/qa/repro/v3/http_reset_v3.mjs
 * Env: BB_API (default http://127.0.0.1:8091).
 */
import { createPrivateKey, createPublicKey, sign, randomUUID } from "node:crypto";

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
const check = (id, ok, detail) => { results.push({ id, ok: Boolean(ok), detail }); return ok; };

async function call(method, path, { token, body, key } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const nonce = await call("POST", "/v1/auth/siws/nonce", { body: { address: ADDRESS, domain: DOMAIN, uri: `http://${DOMAIN}` } });
const verify = await call("POST", "/v1/auth/siws/verify", {
  body: { address: ADDRESS, message: nonce.json.data.message, signature: b58(sign(null, Buffer.from(nonce.json.data.message, "utf8"), priv)), client: "web" },
});
if (verify.status !== 200) { console.error("login failed", verify.status, verify.json); process.exit(1); }
const token = verify.json.data.access_token;
const ws = verify.json.data.workspace_id;
const W = `/v1/workspaces/${ws}`;

const before = await call("GET", `${W}/portfolio/overview?mode=practice`, { token });
const openBefore = await call("GET", `${W}/positions?mode=practice&state=open&limit=100`, { token });

const first = await call("POST", `${W}/practice/reset`, { token, body: {}, key: randomUUID() });
check("POST /practice/reset: 200, epoch bumped, next_allowed_at ~+24h", first.status === 200 && typeof first.json.epoch === "number" && typeof first.json.next_allowed_at === "string" && Date.parse(first.json.next_allowed_at) - Date.now() > 23 * 3600_000, { status: first.status, body: first.json, open_before: openBefore.json?.items?.length ?? null, overview_before: before.json?.data });

const second = await call("POST", `${W}/practice/reset`, { token, body: {}, key: randomUUID() });
check("second reset within 24 h: 429 RESET_COOLDOWN + next_allowed_at", second.status === 429 && second.json?.error?.code === "RESET_COOLDOWN" && typeof second.json?.error?.next_allowed_at === "string", { status: second.status, error: second.json?.error });

const after = await call("GET", `${W}/positions?mode=practice&state=open&limit=100`, { token });
check("reset closed the open positions (state=open is now empty)", after.status === 200 && (after.json?.items ?? []).length === 0, { status: after.status, open_after: after.json?.items?.length ?? null });

const resets = await call("GET", `${W}/practice/resets?limit=5`, { token });
const row = (resets.json?.items ?? [])[0];
check("GET /practice/resets lists the reset row", resets.status === 200 && Boolean(row) && Number(row.to_epoch) === Number(first.json.epoch), { status: resets.status, row: row ?? null });

console.log(JSON.stringify({ api: API, workspace_id: ws, results }, null, 2));
process.exitCode = results.every((r) => r.ok) ? 0 : 1;