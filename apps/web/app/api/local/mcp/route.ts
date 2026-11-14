import { cookies } from "next/headers";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { loopbackRequest } from "@/lib/local/paths";
import { ensureMcpToken, mcpCall, mcpEnabled, mcpStatus, readAudit, readMcpToken, setMcpEnabled } from "@/lib/local/mcp";

export const dynamic = "force-dynamic";

function denied() {
  return Response.json({ error: "not_local" }, { status: 404 });
}

async function allowed(req: Request): Promise<boolean> {
  if (!loopbackRequest(req)) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = readMcpToken() ?? ensureMcpToken();
  if (token && header === `Bearer ${token}`) return true;
  const jar = await cookies();
  return jar.has(ACCESS_COOKIE);
}

export async function GET(req: Request) {
  if (!loopbackRequest(req)) return denied();
  if (!(await allowed(req))) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({
    data: {
      mcp_enabled: mcpEnabled(),
      audit: readAudit(30),
      status: mcpStatus(),
    },
  });
}

export async function POST(req: Request) {
  if (!loopbackRequest(req)) return denied();
  if (!(await allowed(req))) return Response.json({ error: "unauthorized" }, { status: 401 });
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
  if (body.action === "set_enabled") {
    setMcpEnabled(body.enabled === true);
    return Response.json({ data: { mcp_enabled: mcpEnabled() } });
  }
  const tool = typeof body.tool === "string" ? body.tool : "";
  const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args as Record<string, unknown> : {};
  return Response.json({ data: mcpCall(tool, args) });
}
