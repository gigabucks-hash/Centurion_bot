import { fail, idempotent, ok, readJson } from "@/lib/bff";
import { guarded } from "@/lib/bff-wrap";
import { practiceState, PRACTICE_START_LAMPORTS, resetPractice } from "@/lib/mock/store";

/** GET (mock helper): current epoch + next_allowed_at. */
export async function GET() {
  const p = practiceState();
  return ok({ epoch: p.epoch, starting_balance_lamports: PRACTICE_START_LAMPORTS, next_allowed_at: p.lastResetAt ? new Date(p.lastResetAt + 86_400_000).toISOString() : null });
}

/** POST /practice/reset `{}` + Idempotency-Key → 200 `{epoch, starting_balance_lamports, archived, next_allowed_at}` · 429 RESET_COOLDOWN. Practice only. */
export async function POST(req: Request) {
  const mode = new URL(req.url).searchParams.get("mode");
  if (mode && mode !== "practice") return fail("MODE_NOT_ALLOWED");
  const parsed = await readJson(req);
  if (parsed instanceof Response) return parsed;
  return idempotent(req, parsed.raw, () => guarded(() => ok(resetPractice())));
}
