import { idempotent, ok, readJson } from "@/lib/bff";
import { guarded } from "@/lib/bff-wrap";
import { cancelDeletion, getDeletion, requestDeletion } from "@/lib/mock/account";

/** GET /me/deletion → `{state, scheduled_for, rev}`. */
export async function GET() {
  return ok(getDeletion());
}

/** POST /me/deletion `{}` → pending_deletion; the grace period is server-side (7 days). Re-auth/2FA are assumed in the mock. */
export async function POST(req: Request) {
  const parsed = await readJson(req);
  if (parsed instanceof Response) return parsed;
  return idempotent(req, parsed.raw, () => guarded(() => ok(requestDeletion())));
}

/** DELETE /me/deletion — cancel until scheduled_for. */
export async function DELETE() {
  return guarded(() => ok(cancelDeletion()));
}
