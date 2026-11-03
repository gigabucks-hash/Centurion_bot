// Runs the pure-Rust transcoder (crates/logo, binary `centurion-logo`) as a short-lived child process: untrusted
// image decoding never happens inside the API process. Empty environment, stdin = image, files out.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

/** Contracts 1.1.6 size enum (lead decision 2026-11-03; UX COIN_LOGO §2): `s=48|64|96|128|192`. */
export const LOGO_SIZES = [48, 64, 96, 128, 192] as const;
export type LogoSize = (typeof LOGO_SIZES)[number];
/** WebP is the default; PNG is the fallback (Accept without image/webp, or `fmt=png`). Never SVG/AVIF. */
export const LOGO_FORMATS = ["webp", "png"] as const;
export type LogoFormat = (typeof LOGO_FORMATS)[number];
export const LOGO_FILES: string[] = LOGO_FORMATS.flatMap((f) => LOGO_SIZES.map((s) => `${s}.${f}`));

/**
 * Files to try for a request, best first: the exact size, then smaller sizes (a size the transcoder dropped
 * for exceeding the byte cap), then larger ones. Same format only.
 */
export function candidates(size: LogoSize, fmt: LogoFormat): string[] {
  const smaller = LOGO_SIZES.filter((s) => s < size).reverse();
  const larger = LOGO_SIZES.filter((s) => s > size);
  return [size, ...smaller, ...larger].map((s) => `${s}.${fmt}`);
}

export class TranscodeError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/** Transcode `input` into `outDir` (must exist, empty). Resolves with the produced file -> bytes map. */
export function transcode(bin: string, input: Buffer, outDir: string, timeoutMs: number): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [outDir], { stdio: ["pipe", "ignore", "pipe"], env: {}, timeout: timeoutMs, killSignal: "SIGKILL" });
    let err = "";
    child.stderr.on("data", (c: Buffer) => {
      if (err.length < 200) err += c.toString("utf8");
    });
    child.on("error", () => reject(new TranscodeError("transcoder_unavailable")));
    child.on("close", async (code, signal) => {
      if (signal) return reject(new TranscodeError("transcode_timeout"));
      if (code !== 0) {
        const c = err.trim().split(/\s+/)[0] ?? "";
        return reject(new TranscodeError(/^[a-z_]{1,40}$/.test(c) ? c : "decode_failed"));
      }
      try {
        // the transcoder may omit sizes above its byte cap; the 48 px WebP is always present on success
        const out = new Map<string, Buffer>();
        for (const f of LOGO_FILES) {
          const b = await readFile(`${outDir}/${f}`).catch(() => null);
          if (b) out.set(f, b);
        }
        if (!out.has("48.webp")) throw new Error("missing");
        resolve(out);
      } catch {
        reject(new TranscodeError("transcode_output_missing"));
      }
    });
    child.stdin.on("error", () => {}); // EPIPE when the child rejects early
    child.stdin.end(input);
  });
}
