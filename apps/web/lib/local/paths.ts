import path from "node:path";

/** Single-user web on this PC. Never the hosted paper API (`DATA_SOURCE=http`). */
export function isLocalWeb(): boolean {
  return process.env.CENTURION_LOCAL === "1" && process.env.DATA_SOURCE !== "http";
}

/** Directory for paper state, the Real book, and the owner public key. Null outside local web. */
export function localDir(): string | null {
  if (!isLocalWeb()) return null;
  const raw = process.env.CENTURION_LOCAL_DIR?.trim();
  return path.resolve(raw && raw.length > 0 ? raw : path.join(process.cwd(), ".local-web"));
}

/**
 * Local routes answer only on loopback, and only when the process itself is not bound to every interface.
 * A public host with CENTURION_LOCAL set still gets nothing.
 */
export function loopbackRequest(req: Request): boolean {
  if (!isLocalWeb()) return false;
  const hostEnv = (process.env.HOSTNAME ?? "").trim();
  if (hostEnv === "0.0.0.0" || hostEnv === "::") return false;
  try {
    const host = new URL(req.url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}
