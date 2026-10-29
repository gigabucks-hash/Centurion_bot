// Test harness: a throwaway database on the local Postgres (PGHOST/PGPORT/PGUSER, superuser), all migrations,
// test/seed.sql, and the API on an ephemeral port.
import { execFileSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { loadConfig } from "../src/config.ts";
import { createPool, type Db } from "../src/db.ts";
import { signJwt } from "../src/jwt.ts";
import { MarkHub } from "../src/sse.ts";
import { createApiServer } from "../src/server.ts";

export const SECRET = "test-secret-not-a-real-key-0123456789abcdef";
export const WS = "10000000-0000-0000-0000-0000000000a1";
export const OTHER_WS = "10000000-0000-0000-0000-0000000000a3";
export const OWNER = "00000000-0000-0000-0000-0000000000a1";
export const VIEWER = "00000000-0000-0000-0000-0000000000a2";
export const OUTSIDER = "00000000-0000-0000-0000-0000000000a3";
export const POS = "60000000-0000-0000-0000-0000000000a1";
export const APPROVAL = "30000000-0000-0000-0000-0000000000a1";

const root = fileURLToPath(new URL("../..", import.meta.url)); // services/backend/
const DB = process.env.SENTRA_API_TEST_DB ?? "sentra_api_test";
const PGHOST = process.env.PGHOST ?? "/tmp";
const PGPORT = process.env.PGPORT ?? "55432";
const PGUSER = process.env.PGUSER ?? "postgres";
const env = { ...process.env, PGHOST, PGPORT, PGUSER };

function psql(db: string, args: string[]): void {
  execFileSync("psql", ["-q", "-X", "-v", "ON_ERROR_STOP=1", "-d", db, "-o", "/dev/null", ...args], { env, stdio: ["ignore", "ignore", "pipe"] });
}

export function resetDatabase(): string {
  psql("postgres", ["-c", `drop database if exists ${DB}`, "-c", `create database ${DB}`]);
  psql(DB, ["-f", `${root}supabase/tests/00_local_shim.sql`]);
  for (const m of readdirSync(`${root}supabase/migrations`).filter((f) => f.endsWith(".sql")).sort()) {
    psql(DB, ["-f", `${root}supabase/migrations/${m}`]);
  }
  psql(DB, ["-f", `${root}api/test/seed.sql`]);
  const host = PGHOST.startsWith("/") ? encodeURIComponent(PGHOST) : PGHOST;
  return `postgres://${PGUSER}@${host}:${PGPORT}/${DB}`;
}

export interface Harness {
  base: string;
  db: Db;
  server: Server;
  marks: MarkHub;
  stop(): Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  const url = resetDatabase();
  const cfg = loadConfig({
    TRADING_MODE: "paper",
    DATABASE_URL: url,
    SUPABASE_JWT_SECRET: SECRET,
    SSE_POLL_MS: "40",
    SSE_CLOCK_MS: "100",
    SSE_HEARTBEAT_MS: "1000",
  });
  const db = createPool(cfg.databaseUrl);
  const marks = new MarkHub(cfg.databaseUrl, cfg.marksChannel);
  await marks.start();
  const server = createApiServer({ cfg, db, marks });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    db,
    server,
    marks,
    async stop() {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      await marks.stop();
      await db.end();
    },
  };
}

export function token(sub: string, opts: { scopes?: string[]; client?: string; exp?: number; secret?: string } = {}): string {
  return signJwt(
    {
      sub,
      aud: "authenticated",
      role: "authenticated",
      exp: opts.exp ?? Math.floor(Date.now() / 1000) + 600,
      app_scopes: opts.scopes ?? ["read", "trade"],
      ...(opts.client ? { sentra_client: opts.client } : {}),
    },
    opts.secret ?? SECRET,
  );
}

export interface Res {
  status: number;
  headers: Headers;
  body: any;
}

export async function call(base: string, method: string, path: string, o: { token?: string; headers?: Record<string, string>; body?: unknown } = {}): Promise<Res> {
  const headers: Record<string, string> = { ...(o.headers ?? {}) };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(base + path, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text();
  return { status: r.status, headers: r.headers, body: text ? JSON.parse(text) : null };
}

export interface SseFrame {
  id?: string;
  event?: string;
  data?: any;
}

/** Read SSE frames until `until` returns true (or timeout). */
export async function readSse(
  base: string,
  path: string,
  tok: string,
  until: (frames: SseFrame[]) => boolean,
  o: { headers?: Record<string, string>; timeoutMs?: number; onOpen?: () => Promise<void> } = {},
): Promise<{ status: number; frames: SseFrame[]; headers: Headers }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), o.timeoutMs ?? 5000);
  const frames: SseFrame[] = [];
  const r = await fetch(base + path, { headers: { authorization: `Bearer ${tok}`, ...(o.headers ?? {}) }, signal: ac.signal });
  if (r.status !== 200 || !r.body) {
    clearTimeout(timer);
    return { status: r.status, frames, headers: r.headers };
  }
  if (o.onOpen) await o.onOpen();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
      buf += dec.decode(chunk, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const f: SseFrame = {};
        for (const line of block.split("\n")) {
          if (line.startsWith("id: ")) f.id = line.slice(4);
          else if (line.startsWith("event: ")) f.event = line.slice(7);
          else if (line.startsWith("data: ")) f.data = JSON.parse(line.slice(6));
        }
        if (f.event || f.data !== undefined) frames.push(f);
      }
      if (until(frames)) break;
    }
  } catch (e) {
    if (!ac.signal.aborted) throw e;
  } finally {
    clearTimeout(timer);
    ac.abort();
  }
  return { status: 200, frames, headers: r.headers };
}
