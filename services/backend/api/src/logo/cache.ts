// Disk cache under LOGO_CACHE_DIR: <dir>/<mint[0:2]>/<mint>/{48,64,96,128,192}.{webp,png} + meta.json.
// Positive entries live LOGO_CACHE_TTL_S (default 30 d), failures LOGO_NEGATIVE_TTL_S (default 1 h).
// Writes are atomic (tmp dir + rename), so readers never see a half-written logo.
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

export interface MetaOk {
  v: 1;
  status: "ok";
  at: number;
  /** Content hash over all sizes: the `v` / `logo_hash` (changes whenever any output changes). */
  logo_hash: string;
  etags: Record<string, string>;
}
export interface MetaMiss {
  v: 1;
  status: "miss";
  at: number;
  until: number;
  reason: string;
  /** 404 LOGO_NOT_FOUND vs 422 LOGO_REJECTED. */
  kind: "not_found" | "rejected";
}
export type Meta = MetaOk | MetaMiss;

export const etagOf = (b: Buffer): string => `"${createHash("sha256").update(b).digest("base64url").slice(0, 22)}"`;
export function logoHashOf(files: Map<string, Buffer>): string {
  const h = createHash("sha256");
  for (const k of [...files.keys()].sort()) h.update(k).update("\0").update(files.get(k)!);
  return h.digest("base64url").slice(0, 16);
}

export class LogoCache {
  readonly dir: string;
  constructor(dir: string) {
    this.dir = dir.replace(/\/+$/, "");
  }
  private mintDir(mint: string): string {
    return `${this.dir}/${mint.slice(0, 2)}/${mint}`;
  }
  async meta(mint: string): Promise<Meta | null> {
    try {
      const m = JSON.parse(await readFile(`${this.mintDir(mint)}/meta.json`, "utf8")) as Meta;
      if (!m || m.v !== 1) return null;
      if (m.status === "ok") return typeof m.logo_hash === "string" ? m : null;
      return m.status === "miss" ? m : null;
    } catch {
      return null;
    }
  }
  async file(mint: string, name: string): Promise<Buffer | null> {
    try {
      return await readFile(`${this.mintDir(mint)}/${name}`);
    } catch {
      return null;
    }
  }
  /** Fresh scratch dir on the same filesystem (for the transcoder output). */
  async scratch(): Promise<string> {
    const d = `${this.dir}/.tmp/${randomBytes(9).toString("base64url")}`;
    await mkdir(d, { recursive: true, mode: 0o700 });
    return d;
  }
  async putOk(mint: string, scratchDir: string, files: Map<string, Buffer>, now: number): Promise<MetaOk> {
    const etags: Record<string, string> = {};
    for (const [k, b] of files) etags[k] = etagOf(b);
    const meta: MetaOk = { v: 1, status: "ok", at: now, logo_hash: logoHashOf(files), etags };
    await writeFile(`${scratchDir}/meta.json`, JSON.stringify(meta));
    const target = this.mintDir(mint);
    await mkdir(`${this.dir}/${mint.slice(0, 2)}`, { recursive: true, mode: 0o700 });
    const old = `${this.dir}/.tmp/old-${randomBytes(9).toString("base64url")}`;
    await rename(target, old).catch(() => {});
    await rename(scratchDir, target);
    await rm(old, { recursive: true, force: true });
    return meta;
  }
  async putMiss(mint: string, kind: MetaMiss["kind"], reason: string, now: number, ttlS: number): Promise<MetaMiss> {
    const meta: MetaMiss = { v: 1, status: "miss", at: now, until: now + ttlS * 1000, reason, kind };
    const target = this.mintDir(mint);
    await mkdir(target, { recursive: true, mode: 0o700 });
    const tmp = `${target}/meta.json.${randomBytes(6).toString("hex")}`;
    await writeFile(tmp, JSON.stringify(meta));
    await rename(tmp, `${target}/meta.json`);
    return meta;
  }
  /** Keep a stale positive entry (refresh failed): push its `at` forward by the negative TTL. */
  async extend(mint: string, meta: MetaOk, now: number, ttlS: number, fullTtlS: number): Promise<void> {
    const at = now - fullTtlS * 1000 + ttlS * 1000;
    const tmp = `${this.mintDir(mint)}/meta.json.${randomBytes(6).toString("hex")}`;
    await writeFile(tmp, JSON.stringify({ ...meta, at }));
    await rename(tmp, `${this.mintDir(mint)}/meta.json`);
  }
  async dropScratch(d: string): Promise<void> {
    await rm(d, { recursive: true, force: true });
  }
}
