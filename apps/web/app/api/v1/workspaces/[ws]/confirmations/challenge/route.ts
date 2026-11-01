import { ChallengeBody, parse } from "@/lib/schemas/wire";
import { fail, idempotent, ok, readJson } from "@/lib/bff";
import { createChallenge } from "@/lib/mock/store";

/** POST /confirmations/challenge {action, target, payload_hash} → 2 min single-use challenge bound to the change hash. */
export async function POST(req: Request) {
  const parsed = await readJson(req);
  if (parsed instanceof Response) return parsed;
  const v = parse(ChallengeBody, parsed.body);
  if (!v.ok) return v.res;
  return idempotent(req, parsed.raw, async () => {
    const { action, target, payload_hash, typed_name, mode } = parsed.body as Record<string, string>;
    if (!action || !target || !/^[0-9a-f]{64}$/.test(payload_hash ?? "")) return fail("VALIDATION_FAILED", {}, { expected: "{action, target, payload_hash}" });
    const c = createChallenge(action, target, payload_hash);
    return ok({ ...c, required: { webauthn: mode === "real", typed_name: typed_name ?? null, hold_ms: mode === "real" ? 2500 : 1200 } });
  });
}
