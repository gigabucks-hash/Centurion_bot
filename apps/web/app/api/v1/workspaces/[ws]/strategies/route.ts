import { fail, gateMode, idempotent, list, ok, readJson } from "@/lib/bff";
import { guarded } from "@/lib/bff-wrap";
import { settingsFromWire, type WireSettings } from "@/lib/contracts";
import { getStrategy, listStrategies, publishStrategy, strategyToWire } from "@/lib/mock/store";
import { blankSettings } from "@/lib/strategy-schema";

/** GET /strategies?mode=&status= */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const mode = gateMode(q.get("mode"));
  if (mode instanceof Response) return mode;
  const status = q.get("status");
  return list(listStrategies().filter((s) => s.mode === mode && (!status || s.status === status)).map(strategyToWire));
}

/** POST /strategies `{mode, name, settings}` (flat snake_case). New strategies start in Practice in this build. */
export async function POST(req: Request) {
  const parsed = await readJson(req);
  if (parsed instanceof Response) return parsed;
  const { settings, name } = parsed.body as { settings?: WireSettings; name?: string };
  if (!settings || typeof settings !== "object") return fail("VALIDATION_FAILED", {}, { field: "settings" });
  return idempotent(req, parsed.raw, () =>
    guarded(() => {
      const form = { ...settingsFromWire({ ...settings, name: name ?? settings.name }, blankSettings()), mode: "practice" as const };
      const r = publishStrategy(null, form);
      return ok(strategyToWire(getStrategy(r.strategyId)!), { status: 201 });
    }),
  );
}
