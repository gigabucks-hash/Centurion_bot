#!/usr/bin/env node
/**
 * Version guard for the desktop release and the in-app updater.
 *
 * The updater only offers a build whose semver is newer than the installed one, and the release
 * artifact is stamped from `src-tauri/tauri.conf.json` while the tag names the GitHub release. If
 * those drift, CI happily publishes `desktop-v0.2.1` containing a 0.2.0 app and every installed
 * client keeps saying "already up to date" - a silent failure that is invisible until a user reports
 * it. This script makes it loud:
 *
 *   node scripts/check-versions.mjs                      # three files agree + semver shape
 *   node scripts/check-versions.mjs --tag desktop-v0.2.1 # ...and the release tag matches
 *
 * Run by the `desktop` workflow on every change (fast gate) and again in the release job before
 * `tauri-action`, and by `npm run check:versions` locally.
 */
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Semver as Tauri/the updater compare it: three numeric segments, no prefix. */
export const SEMVER = /^\d+\.\d+\.\d+$/;

/** `[package] version` of a Cargo.toml, ignoring dependency/workspace sections. */
export function cargoVersion(toml) {
  const section = toml.split(/^\[/m).find((s) => s.startsWith("package]"));
  return section?.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? null;
}

/** Version of a JSON document, or null when the file is not valid JSON. */
export function jsonVersion(text) {
  try {
    const v = JSON.parse(text).version;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Every problem with the collected versions: missing, non-semver, or not equal to `tauri.conf.json`
 * (the value the installer and the updater read).
 */
export function versionIssues(v) {
  const issues = [];
  for (const [file, value] of Object.entries(v)) {
    if (!value) issues.push(`${file}: no version found`);
    else if (!SEMVER.test(value)) issues.push(`${file}: "${value}" is not major.minor.patch`);
  }
  const conf = v["src-tauri/tauri.conf.json"];
  for (const [file, value] of Object.entries(v)) {
    if (file !== "src-tauri/tauri.conf.json" && value && conf && value !== conf) {
      issues.push(`${file}: ${value} != tauri.conf.json ${conf}`);
    }
  }
  return issues;
}

/** `desktop-v1.2.3` -> `1.2.3`; anything else -> null. */
export function tagVersion(tag) {
  const m = /^desktop-v(\d+\.\d+\.\d+)$/.exec(tag ?? "");
  return m?.[1] ?? null;
}

/** Problem with a release tag for `version`, or null when it matches. */
export function tagIssue(tag, version) {
  const tagged = tagVersion(tag);
  if (!tagged) return `release tag "${tag}" must look like desktop-vX.Y.Z`;
  if (!version) return "cannot compare the tag: tauri.conf.json has no version";
  if (tagged !== version) {
    return `release tag desktop-v${tagged} != app version ${version}; the updater would never offer the build`;
  }
  return null;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  "src-tauri/tauri.conf.json": (t) => jsonVersion(t),
  "src-tauri/Cargo.toml": (t) => cargoVersion(t),
  "package.json": (t) => jsonVersion(t),
};

export function readVersions(dir = root) {
  return Object.fromEntries(
    Object.entries(FILES).map(([file, parse]) => {
      try {
        return [file, parse(readFileSync(join(dir, file), "utf8"))];
      } catch {
        return [file, null];
      }
    }),
  );
}

function main(argv) {
  const versions = readVersions();
  console.log(Object.entries(versions).map(([f, v]) => `${f}=${v ?? "?"}`).join("  "));
  const issues = versionIssues(versions);
  const at = argv.indexOf("--tag");
  if (at !== -1) {
    const tag = argv[at + 1];
    if (!tag) issues.push("--tag needs a value (desktop-vX.Y.Z)");
    else {
      const issue = tagIssue(tag, versions["src-tauri/tauri.conf.json"]);
      if (issue) issues.push(issue);
    }
  }
  if (issues.length) {
    for (const issue of issues) console.error(`ERROR ${issue}`);
    console.error("Fix the version before building or tagging a release.");
    return 1;
  }
  console.log("OK: desktop versions agree");
  return 0;
}

if (process.argv[1]) {
  // Node may keep argv[1] relative and the repo lives behind a junction (C:\cw\app), so compare
  // real paths; a no-op here would let a mismatched release tag through silently.
  const real = (p) => realpathSync(p).toLowerCase();
  try {
    if (real(process.argv[1]) === real(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv.slice(2));
  } catch {
    /* path resolution failed: stay quiet, the workflow still runs the checks below */
  }
}
