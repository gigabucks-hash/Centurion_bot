import { getApi } from "@/lib/api";
import type { StrategySettings } from "@/lib/types";

/** Mock publish: { id: string | null, settings }. In-memory only. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { id?: string | null; settings?: StrategySettings } | null;
  if (!body?.settings) return Response.json({ error: "settings required" }, { status: 400 });
  try {
    return Response.json(await getApi().publishStrategy(body.id ?? null, body.settings));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 422 });
  }
}
