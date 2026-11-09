#!/usr/bin/env node
/**
 * Updater preflight: proves the desktop update path is wired before a release is cut.
 *
 * The in-app updater fails late and quietly: a missing capability, a dropped plugin, an unsigned
 * build or a `latest.json` without the windows platform leaves the user on "already up to date".
 * Publishing is the only step that needs the signing secret, so everything else can be checked here.
 *
 *   node scripts/check-updater.mjs                          # static config (offline, every CI run)
 *   node scripts/check-updater.mjs --online                 # also fetch the published latest.json
 *   node scripts/check-updater.mjs --latest-json <file> --expect-version 0.2.0
 *
 * `--online` is for after a release exists; a 404 is reported as "no published release yet".
 */
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readVersions, SEMVER, versionIssues } from "./check-versions.mjs";

/** The only repo whose Releases the shipped app trusts. */
export const EXPECTED_REPO = "gigabucks-hash/Centurion_bot";
export const EXPECTED_ENDPOINT = `https://github.com/${EXPECTED_REPO}/releases/latest/download/latest.json`;

/** `endpoint` -> repo slug, or null when it is not the GitHub latest-release asset URL. */
export function endpointRepo(endpoint) {
  const m = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/latest\/download\/latest\.json$/.exec(endpoint ?? "");
  return m?.[1] ?? null;
}

/**
 * Tauri stores the updater key as base64 of the minisign public key file:
 *   untrusted comment: minisign public key: <16 hex digits>
 *   RW<base64 body>
 */
export function parsePubkey(b64) {
  let text;
  try {
    text = Buffer.from(b64 ?? "", "base64").toString("utf8");
  } catch {
    return { ok: false, keyId: null, error: "pubkey is not valid base64" };
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  const id = /^untrusted comment: minisign public key: ([0-9A-F]{16})$/.exec(lines[0] ?? "")?.[1] ?? null;
  const body = lines[1] ?? "";
  if (!id || !/^RW[A-Za-z0-9+/]{40,}={0,2}$/.test(body)) {
    return { ok: false, keyId: null, error: "pubkey is not a minisign public key (comment + RW... line)" };
  }
  return { ok: true, keyId: id, error: null };
}

/** Problems with one `latest.json` document (Tauri's updater manifest). */
export function latestJsonIssues(doc, expectVersion) {
  const issues = [];
  const version = typeof doc?.version === "string" ? doc.version : null;
  if (!version) issues.push("latest.json: no version");
  else if (!SEMVER.test(version)) issues.push(`latest.json: version "${version}" is not major.minor.patch`);
  else if (expectVersion && version !== expectVersion) issues.push(`latest.json: version ${version} != expected ${expectVersion}`);
  if (!doc?.pub_date || Number.isNaN(Date.parse(doc.pub_date))) issues.push("latest.json: pub_date missing or not a date");
  const win = doc?.platforms?.["windows-x86_64"];
  if (!win) issues.push('latest.json: no platforms["windows-x86_64"] (the Windows updater key)');
  else {
    if (typeof win.signature !== "string" || win.signature.trim() === "") issues.push("latest.json: windows signature is empty");
    if (!/^https:\/\//.test(win.url ?? "")) issues.push("latest.json: windows url is not https");
  }
  return issues;
}

/**
 * Offline preflight over the shipped config, the capabilities, the Rust plugin registration and the
 * release workflow. Every argument is file text; nothing here touches the network.
 */
export function staticIssues(f, versions = readVersions()) {
  const issues = [];

  const endpoint = f.conf?.plugins?.updater?.endpoints?.[0];
  if (!endpoint) issues.push("tauri.conf.json: plugins.updater.endpoints[0] is missing");
  else if (endpointRepo(endpoint) !== EXPECTED_REPO) {
    issues.push(`tauri.conf.json: endpoint ${endpoint} is not the ${EXPECTED_REPO} latest-release latest.json`);
  }
  const key = parsePubkey(f.conf?.plugins?.updater?.pubkey);
  if (!key.ok) issues.push(`tauri.conf.json: ${key.error}`);

  if (f.updaterConf?.bundle?.createUpdaterArtifacts !== true) {
    issues.push("tauri.updater.conf.json: bundle.createUpdaterArtifacts must be true");
  }

  const perms = f.capabilities?.permissions ?? [];
  for (const needed of ["updater:default", "process:allow-restart"]) {
    if (!perms.includes(needed)) issues.push(`capabilities: ${needed} is missing (check/install or restart would be denied)`);
  }

  if (!/tauri-plugin-updater\s*=/.test(f.cargo ?? "")) issues.push("Cargo.toml: tauri-plugin-updater dependency is missing");
  if (!/tauri-plugin-process\s*=/.test(f.cargo ?? "")) issues.push("Cargo.toml: tauri-plugin-process dependency is missing");
  if (!/tauri_plugin_updater::Builder/.test(f.libRs ?? "")) issues.push("lib.rs: tauri_plugin_updater is not registered");
  if (!/tauri_plugin_process::init/.test(f.libRs ?? "")) issues.push("lib.rs: tauri_plugin_process is not registered");

  for (const secret of ["TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"]) {
    if (!(f.workflow ?? "").includes(secret)) issues.push(`desktop.yml: release job does not pass ${secret}`);
  }
  if (!/uploadUpdaterJson:\s*true/.test(f.workflow ?? "")) issues.push("desktop.yml: release job does not set uploadUpdaterJson: true");
  if (!/check-versions\.mjs --tag/.test(f.workflow ?? "")) issues.push("desktop.yml: release job does not check the tag against the app version");

  issues.push(...versionIssues(versions));
  return issues;
}

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, "..");

function readOrNull(path, encoding = "utf8") {
  try {
    return readFileSync(path, encoding);
  } catch {
    return null;
  }
}

async function onlineIssues() {
  const res = await fetch(EXPECTED_ENDPOINT, { headers: { "user-agent": "centurion-updater-preflight" }, redirect: "follow" });
  if (res.status === 404) return ["published latest.json not found (404): no desktop release exists yet"];
  if (!res.ok) return [`published latest.json returned HTTP ${res.status}`];
  let doc;
  try {
    doc = await res.json();
  } catch {
    return ["published latest.json is not JSON"];
  }
  return latestJsonIssues(doc);
}

async function main(argv) {
  const at = (flag) => (argv.indexOf(flag) === -1 ? null : argv[argv.indexOf(flag) + 1] ?? "");

  const file = at("--latest-json");
  if (file !== null) {
    let doc;
    try {
      doc = JSON.parse(file === "" ? "" : readFileSync(file, "utf8"));
    } catch (e) {
      console.error(`ERROR ${file || "(missing path)"}: cannot read latest.json (${e.message})`);
      return 1;
    }
    const expect = at("--expect-version");
    const issues = latestJsonIssues(doc, expect || undefined);
    if (issues.length) {
      for (const i of issues) console.error(`ERROR ${i}`);
      return 1;
    }
    console.log(`OK: latest.json ${doc.version} with a windows-x86_64 update`);
    return 0;
  }

  const issues = staticIssues({
    conf: JSON.parse(readOrNull(join(desktop, "src-tauri/tauri.conf.json")) ?? "null"),
    updaterConf: JSON.parse(readOrNull(join(desktop, "src-tauri/tauri.updater.conf.json")) ?? "null"),
    capabilities: JSON.parse(readOrNull(join(desktop, "src-tauri/capabilities/terminal.json")) ?? "null"),
    cargo: readOrNull(join(desktop, "src-tauri/Cargo.toml")),
    libRs: readOrNull(join(desktop, "src-tauri/src/lib.rs")),
    workflow: readOrNull(join(desktop, "../../.github/workflows/desktop.yml")),
  });
  if (argv.includes("--online")) issues.push(...(await onlineIssues()));
  if (issues.length) {
    for (const issue of issues) console.error(`ERROR ${issue}`);
    return 1;
  }
  const key = parsePubkey(JSON.parse(readOrNull(join(desktop, "src-tauri/tauri.conf.json"))).plugins.updater.pubkey);
  console.log(`OK: updater wired to ${EXPECTED_REPO}, key ${key.keyId}, signing secrets referenced`);
  return 0;
}

if (process.argv[1]) {
  // The repo can sit behind a junction (C:\cw\app); compare real paths so this never no-ops.
  try {
    const real = (p) => realpathSync(p).toLowerCase();
    if (real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
      main(process.argv.slice(2)).then((code) => (process.exitCode = code));
    }
  } catch {
    /* imported as a module */
  }
}
