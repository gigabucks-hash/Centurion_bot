// Version guard for release/updater tagging: `npm run test:ui` (node --test strips TS types).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cargoVersion, jsonVersion, tagIssue, tagVersion, versionIssues } from "./check-versions.mjs";

test("cargoVersion reads [package] and ignores dependency versions", () => {
  const toml = '[package]\nname = "centurion-desktop"\nversion = "0.2.0"\n\n[dependencies]\nserde = { version = "1.0.200" }\n';
  assert.equal(cargoVersion(toml), "0.2.0");
});

test("jsonVersion tolerates junk instead of throwing", () => {
  assert.equal(jsonVersion('{"version":"0.2.0"}'), "0.2.0");
  assert.equal(jsonVersion('{"version":2}'), null);
  assert.equal(jsonVersion("not json"), null);
});

test("agreeing semver versions pass", () => {
  assert.deepEqual(
    versionIssues({ "src-tauri/tauri.conf.json": "0.2.0", "src-tauri/Cargo.toml": "0.2.0", "package.json": "0.2.0" }),
    [],
  );
});

test("drift, a missing file and a non-semver value are reported", () => {
  const issues = versionIssues({ "src-tauri/tauri.conf.json": "0.2.0", "src-tauri/Cargo.toml": "0.1.9", "package.json": null });
  assert.ok(issues.some((i) => i.includes("Cargo.toml: 0.1.9 != tauri.conf.json 0.2.0")));
  assert.ok(issues.some((i) => i.includes("package.json: no version found")));
  const bad = versionIssues({ "src-tauri/tauri.conf.json": "0.2", "src-tauri/Cargo.toml": "0.2", "package.json": "0.2" });
  assert.equal(bad.filter((i) => i.includes("not major.minor.patch")).length, 3);
});

test("the release tag must be desktop-vX.Y.Z and equal the app version", () => {
  assert.equal(tagVersion("desktop-v0.2.1"), "0.2.1");
  assert.equal(tagVersion("v0.2.1"), null);
  assert.equal(tagIssue("desktop-v0.2.1", "0.2.1"), null);
  assert.match(tagIssue("desktop-v0.2.1", "0.2.0"), /updater would never offer/);
  assert.match(tagIssue("0.2.1", "0.2.1"), /must look like/);
  assert.match(tagIssue("desktop-v0.2.1", null), /no version/);
});
