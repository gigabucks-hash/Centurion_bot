/** zod schemas for the auth route handlers (API_ENDPOINTS §4.1). */
import { z } from "zod";

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "base58 address");
export const NonceBody = z.object({ address: base58, domain: z.string().min(1).max(253), uri: z.string().url().max(512).optional(), chain_id: z.literal("solana:mainnet").optional() }).strict();
export const VerifyBody = z.object({ address: base58, message: z.string().min(1).max(2048), signature: z.string().min(1).max(256), client: z.enum(["web", "mobile", "desktop"]).optional() }).strict();
