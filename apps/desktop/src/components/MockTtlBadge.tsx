import type { PickView } from "../api";
import { useTerm } from "../state/store";

/** C16: visible while the mock's short demo TTL is in use (production = server `expires_at`, UX default 10 min). */
export function MockTtlBadge({ sample }: { sample?: PickView }) {
  const source = useTerm((s) => s.source);
  if (source !== "mock") return null;
  const sec = sample ? Math.round((sample.expires_at_ms - sample.created_at_ms) / 1000) : 90;
  return (
    <span className="chip badge-mock" title="TTL demo dari mock backend. Produksi: expires_at dari server (default UX 10 mnt).">
      MOCK TTL {sec}s
    </span>
  );
}
