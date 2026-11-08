/**
 * Pure helpers for the Settings "check for updates" card (no Tauri imports, so `npm run test:ui`
 * can cover them in plain Node). The card itself talks to tauri-plugin-updater / tauri-plugin-process.
 */

/** Numeric segments of a semver-ish version; missing segments count as 0. */
const parts = (v: string): number[] => v.replace(/^v/i, "").split(/[.+-]/).map((s) => Number.parseInt(s, 10) || 0);

/** `a` newer → 1, `b` newer → -1, equal → 0. Numeric per segment, so 0.10.0 > 0.9.0. */
export function compareVersions(a: string, b: string): number {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export type UpdateProgress = { loaded: number; total: number | null };

/** Whole percent 0–100, or null while the server has not said how large the download is. */
export function progressPct(p: UpdateProgress): number | null {
  if (p.total == null || p.total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((p.loaded / p.total) * 100)));
}

/** Apply one tauri-plugin-updater download event to the running progress. */
export function applyDownloadEvent(p: UpdateProgress, event: string, data: { contentLength?: number | null; chunkLength?: number }): UpdateProgress {
  if (event === "Started") return { loaded: 0, total: data.contentLength ?? null };
  if (event === "Progress") return { loaded: p.loaded + (data.chunkLength ?? 0), total: p.total };
  return p;
}

/** "12.3 MB" style size for the progress line; null total → null (caller hides it). */
export function formatBytes(n: number | null): string | null {
  if (n == null || n < 0) return null;
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${(kb < 10 ? kb.toFixed(1) : kb.toFixed(0))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * True when the check failed because no usable release exists yet: the endpoint has no
 * `latest.json` (404) or the release does not carry the updater manifest. That is a normal state
 * before the first `desktop-vX.Y.Z` release, so the card says so instead of showing a network error.
 */
export function isNoReleaseError(message: string): boolean {
  return /404|not found|could not fetch a valid release json|release json/i.test(message);
}
