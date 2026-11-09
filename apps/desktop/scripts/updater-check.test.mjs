// Updater preflight: `npm run test:ui` (node --test strips TS types).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXPECTED_ENDPOINT,
  EXPECTED_REPO,
  endpointRepo,
  latestJsonIssues,
  parsePubkey,
  staticIssues,
} from "./check-updater.mjs";

// The key committed in tauri.conf.json (public half only).
const PUBKEY = Buffer.from(
  "untrusted comment: minisign public key: 2F57B840B40EAA22\nRWQiqg60QLhXL9OCcfsu63UVfb+McygtF2obi1EhZh0MTgP2K9sqOqTF\n",
).toString("base64");

const versions = {
  "src-tauri/tauri.conf.json": "0.2.0",
  "src-tauri/Cargo.toml": "0.2.0",
  "package.json": "0.2.0",
};

const fixture = () => ({
  conf: { plugins: { updater: { endpoints: [EXPECTED_ENDPOINT], pubkey: PUBKEY } } },
  updaterConf: { bundle: { createUpdaterArtifacts: true } },
  capabilities: { permissions: ["updater:default", "process:allow-restart"] },
  cargo: 'tauri-plugin-updater = "2"\ntauri-plugin-process = "2"\n',
  libRs: ".plugin(tauri_plugin_updater::Builder::new().build())\n.plugin(tauri_plugin_process::init())",
  workflow:
    "TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}\nTAURI_SIGNING_PRIVATE_KEY_PASSWORD: x\n          uploadUpdaterJson: true\n        run: node scripts/check-versions.mjs --tag \"${{ x }}\"\n",
});

test("endpoint must be the repo's latest-release latest.json", () => {
  assert.equal(endpointRepo(EXPECTED_ENDPOINT), EXPECTED_REPO);
  assert.equal(endpointRepo(`https://github.com/${EXPECTED_REPO}/releases/download/desktop-v0.2.0/latest.json`), null);
  assert.equal(endpointRepo("http://github.com/x/y/releases/latest/download/latest.json"), null);
  assert.equal(endpointRepo(undefined), null);
});

test("pubkey parses as minisign and rejects junk", () => {
  const k = parsePubkey(PUBKEY);
  assert.equal(k.ok, true);
  assert.equal(k.keyId, "2F57B840B40EAA22");
  assert.equal(parsePubkey("bm90IGEga2V5").ok, false); // "not a key"
  assert.equal(parsePubkey("").ok, false);
  assert.equal(parsePubkey(undefined).ok, false);
});

test("a valid latest.json has semver, date and a windows signature + https url", () => {
  const doc = {
    version: "0.2.1",
    pub_date: "2026-11-08T10:00:00Z",
    platforms: {
      "windows-x86_64": {
        signature: "dW50cnVzdGVkIGNvbW1lbnQ6...",
        url: "https://github.com/x/y/releases/download/desktop-v0.2.1/Centurion.exe",
      },
    },
  };
  assert.deepEqual(latestJsonIssues(doc, "0.2.1"), []);
  assert.deepEqual(latestJsonIssues(doc), []);
});

test("latest.json defects are named: no windows key, bad version, http url, bad date", () => {
  const bad = { version: "0.2", pub_date: "nope", platforms: { "linux-x86_64": { signature: "x", url: "http://x/y" } } };
  const issues = latestJsonIssues(bad);
  assert.ok(issues.some((i) => i.includes('no platforms["windows-x86_64"]')));
  assert.ok(issues.some((i) => i.includes("not major.minor.patch")));
  assert.ok(issues.some((i) => i.includes("pub_date")));

  const wrong = {
    version: "0.2.2",
    pub_date: "2026-11-08T10:00:00Z",
    platforms: { "windows-x86_64": { signature: "x", url: "http://x/y" } },
  };
  const mismatch = latestJsonIssues(wrong, "0.2.2");
  assert.ok(mismatch.some((i) => i.includes("url is not https")));
  assert.ok(latestJsonIssues(wrong, "0.2.1").some((i) => i.includes("!= expected 0.2.1")));
});

test("a fully wired desktop passes the static preflight", () => {
  assert.deepEqual(staticIssues(fixture(), versions), []);
});

test("dropped capability, plugin, updater artifacts or signing secret are reported", () => {
  const noCap = fixture();
  noCap.capabilities.permissions = ["updater:default"];
  assert.ok(staticIssues(noCap, versions).some((i) => i.includes("process:allow-restart")));

  const noPlugin = fixture();
  noPlugin.libRs = "";
  assert.ok(staticIssues(noPlugin, versions).some((i) => i.includes("updater is not registered")));

  const noArtifacts = fixture();
  noArtifacts.updaterConf = { bundle: { createUpdaterArtifacts: false } };
  assert.ok(staticIssues(noArtifacts, versions).some((i) => i.includes("createUpdaterArtifacts")));

  const noSecret = fixture();
  noSecret.workflow = noSecret.workflow.replace("TAURI_SIGNING_PRIVATE_KEY_PASSWORD", "PASSWORD");
  assert.ok(staticIssues(noSecret, versions).some((i) => i.includes("TAURI_SIGNING_PRIVATE_KEY_PASSWORD")));

  const wrongRepo = fixture();
  wrongRepo.conf.plugins.updater.endpoints = ["https://github.com/other/repo/releases/latest/download/latest.json"];
  assert.ok(staticIssues(wrongRepo, versions).some((i) => i.includes(EXPECTED_REPO)));

  const badKey = fixture();
  badKey.conf.plugins.updater.pubkey = "bm90IGEga2V5";
  assert.ok(staticIssues(badKey, versions).some((i) => i.includes("minisign")));
});

test("version drift also fails the updater preflight", () => {
  const drifted = { ...versions, "src-tauri/Cargo.toml": "0.1.9" };
  assert.ok(staticIssues(fixture(), drifted).some((i) => i.includes("0.1.9 != tauri.conf.json 0.2.0")));
});
