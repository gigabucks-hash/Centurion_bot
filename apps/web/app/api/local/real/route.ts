import { localWriteAllowed } from "@/lib/local/http-guard";
import { loopbackRequest } from "@/lib/local/paths";
import { bindOwner, readOwnerAddress } from "@/lib/local/owner";
import {
  applyKnobs,
  armEnable,
  armLimits,
  disableReal,
  enableReal,
  publicBook,
  readBook,
  setRealStrategies,
  setRpc,
  writeBook,
  type BookError,
} from "@/lib/local/real-book";
import { validateKnobs, type RealKnobs } from "@/lib/local/real-limits";

export const dynamic = "force-dynamic";

function denied() {
  return Response.json({ error: "not_local" }, { status: 404 });
}

function bookError(error: BookError) {
  const status = error === "needs_signature" || error === "bad_signature" || error === "wallet" ? 403 : 400;
  return Response.json({ error }, { status });
}

function asKnobs(value: unknown): RealKnobs | null {
  if (!value || typeof value !== "object") return null;
  const knobs = value as RealKnobs;
  return validateKnobs(knobs) == null ? knobs : null;
}

function asScope(value: unknown): string | null {
  if (value === "global") return "global";
  if (typeof value !== "string" || !value.startsWith("strategy:") || value.length > 80) return null;
  return value.slice("strategy:".length).length > 0 ? value : null;
}

export async function GET(req: Request) {
  if (!loopbackRequest(req) || !localWriteAllowed(req)) return denied();
  return Response.json({ data: publicBook(readBook()) });
}

export async function POST(req: Request) {
  if (!loopbackRequest(req) || !localWriteAllowed(req)) return denied();
  const raw = await req.text();
  if (raw.length > 20_000) return Response.json({ error: "invalid" }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return Response.json({ error: "invalid" }, { status: 400 });
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const action = body.action;
  const book = readBook();
  const save = (next: ReturnType<typeof readBook>, extra?: Record<string, unknown>) => {
    try {
      writeBook(next);
    } catch {
      return bookError("invalid");
    }
    return Response.json({ data: { ...publicBook(next), ...extra } });
  };

  if (action === "enable-message") {
    const wallet = typeof body.wallet === "string" ? body.wallet.trim() : "";
    const armed = armEnable(book, wallet);
    if ("error" in armed) return bookError(armed.error);
    return save(armed.book, { message: armed.message });
  }

  if (action === "enable") {
    const wallet = typeof body.wallet === "string" ? body.wallet.trim() : "";
    const signature = typeof body.signature === "string" ? body.signature : "";
    const owner = readOwnerAddress();
    if (owner && owner !== wallet) return bookError("wallet");
    const result = enableReal(book, wallet, signature);
    if ("error" in result) return bookError(result.error);
    if (!bindOwner(wallet)) return bookError("wallet");
    return save(result.book);
  }

  if (action === "disable") {
    return save(disableReal(book));
  }

  if (action === "limits-message") {
    const scope = asScope(body.scope);
    const knobs = asKnobs(body.knobs);
    if (!scope || !knobs) return bookError("invalid");
    const armed = armLimits(book, scope, knobs);
    if ("error" in armed) return bookError(armed.error);
    return save(armed.book, { message: armed.message });
  }

  if (action === "apply") {
    const scope = asScope(body.scope);
    const knobs = asKnobs(body.knobs);
    if (!scope || !knobs) return bookError("invalid");
    const signature = typeof body.signature === "string" ? body.signature : null;
    const result = applyKnobs(book, scope, knobs, signature);
    if ("error" in result) return bookError(result.error);
    return save(result.book);
  }

  if (action === "rpc") {
    const rpcUrl = typeof body.rpcUrl === "string" ? body.rpcUrl : "";
    const result = setRpc(book, rpcUrl);
    if ("error" in result) return bookError(result.error);
    return save(result.book);
  }

  if (action === "strategies") {
    if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== "string")) return bookError("invalid");
    const result = setRealStrategies(book, body.ids);
    if ("error" in result) return bookError(result.error);
    return save(result.book);
  }

  return Response.json({ error: "invalid" }, { status: 400 });
}
