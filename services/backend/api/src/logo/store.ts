// Logo state in Postgres (migration 0019): current logo_hash per mint for REST wires, and the manual
// per-mint blocklist. Blocklist reads are cached in memory (refreshed every BLOCKLIST_REFRESH_MS) so the
// unauthenticated image route never queries the DB per request.
import { asService, type Db } from "../db.ts";

export type LogoStatus = "ok" | "not_found" | "rejected" | "blocked";

export interface LogoStore {
  record(mint: string, status: LogoStatus, logoHash: string | null, reason: string | null, retryAfter: Date | null): Promise<void>;
  isBlocked(mint: string): Promise<boolean>;
}

const BLOCKLIST_REFRESH_MS = 60_000;

export class PgLogoStore implements LogoStore {
  private readonly db: Db;
  private blocked = new Set<string>();
  private loadedAt = 0;
  private loading: Promise<void> | null = null;
  constructor(db: Db) {
    this.db = db;
  }
  async record(mint: string, status: LogoStatus, logoHash: string | null, reason: string | null, retryAfter: Date | null): Promise<void> {
    try {
      await asService(this.db, (c) =>
        c.query(
          `insert into public.coin_logos (mint, status, logo_hash, reason, fetched_at, retry_after)
           values ($1, $2, $3, $4, now(), $5)
           on conflict (mint) do update set status = excluded.status, logo_hash = excluded.logo_hash,
             reason = excluded.reason, fetched_at = excluded.fetched_at, retry_after = excluded.retry_after`,
          [mint, status, logoHash, reason, retryAfter],
        ));
    } catch (e) {
      console.error("logo store unavailable:", e instanceof Error ? e.message : e);
    }
  }
  async isBlocked(mint: string): Promise<boolean> {
    if (Date.now() - this.loadedAt > BLOCKLIST_REFRESH_MS) {
      this.loading ??= this.load().finally(() => (this.loading = null));
      await this.loading;
    }
    return this.blocked.has(mint);
  }
  private async load(): Promise<void> {
    try {
      const r = await asService(this.db, (c) => c.query<{ mint: string }>("select mint from public.coin_logo_blocklist"));
      this.blocked = new Set(r.rows.map((x) => x.mint));
      this.loadedAt = Date.now();
    } catch (e) {
      // keep the previous set; retry on the next request after a short pause
      this.loadedAt = Date.now() - BLOCKLIST_REFRESH_MS + 5_000;
      console.error("logo blocklist unavailable:", e instanceof Error ? e.message : e);
    }
  }
}

/** In-memory store (tests, or no database). */
export class MemoryLogoStore implements LogoStore {
  rows = new Map<string, { status: LogoStatus; logoHash: string | null; reason: string | null }>();
  blocked = new Set<string>();
  async record(mint: string, status: LogoStatus, logoHash: string | null, reason: string | null): Promise<void> {
    this.rows.set(mint, { status, logoHash, reason });
  }
  async isBlocked(mint: string): Promise<boolean> {
    return this.blocked.has(mint);
  }
}
