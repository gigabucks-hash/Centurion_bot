/** zod schemas for the auth route handlers (API_ENDPOINTS §4.1). */
import { z } from "zod";

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "base58 address");
export const NonceBody = z.object({ address: base58, domain: z.string().min(1).max(253), uri: z.string().url().max(512).optional(), chain_id: z.literal("solana:mainnet").optional() }).strict();
export const VerifyBody = z.object({
  address: base58, message: z.string().min(1).max(2048), signature: z.string().min(1).max(256), client: z.enum(["web", "mobile", "desktop"]).optional(),
  // Desktop PKCE hand-off (proposed; apps/desktop deeplink.rs): verify returns a one-time code instead of a session.
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
  code_challenge_method: z.literal("S256").optional(),
  state: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/).optional(),
}).strict().refine((b) => (b.code_challenge == null) === (b.code_challenge_method == null) && (b.code_challenge == null) === (b.state == null), { message: "code_challenge, code_challenge_method and state go together" });

export const ExchangeBody = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/), code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/), client: z.literal("desktop") }).strict();
