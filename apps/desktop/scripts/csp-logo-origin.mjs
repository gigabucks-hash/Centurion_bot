#!/usr/bin/env node
// Writes src-tauri/tauri.logo-csp.json: a `tauri {dev,build} --config` override whose CSP img-src adds
// exactly ONE origin, the backend image proxy from CENTURION_BACKEND (COIN_LOGO §2). Everything else in
// the CSP is copied unchanged from tauri.conf.json. No wildcard, no path, no other remote origin.
// Without CENTURION_BACKEND (mock) nothing is needed: mock logos are bundled ('self').
import { readFileSync, writeFileSync } from "node:fs";

const raw = (process.env.CENTURION_BACKEND ?? "").trim().replace(/\/+$/, "");
const m = /^(https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?|http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?)$/.exec(raw);
if (!m) {
  console.error("CENTURION_BACKEND must be an origin: https://host[:port] (or http://127.0.0.1:port for dev)");
  process.exit(2);
}
const conf = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const csp = { ...conf.app.security.csp, "img-src": `${conf.app.security.csp["img-src"]} ${m[1]}` };
const out = new URL("../src-tauri/tauri.logo-csp.json", import.meta.url);
writeFileSync(out, JSON.stringify({ app: { security: { csp } } }, null, 2) + "\n");
console.log(`img-src: ${csp["img-src"]}  →  ${out.pathname}`);
