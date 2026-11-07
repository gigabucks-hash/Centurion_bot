/**
 * zod schemas for every JSON body this app's route handlers accept (SECURITY: validate all inputs at the edge).
 * Shapes follow @centurion/contracts 1.1.4; unknown top-level keys are rejected where the contract is closed.
 * `parse()` turns a failure into the contract VALIDATION_FAILED body with the offending field paths.
 */
import { z } from "zod";
import { APPROVAL_REJECT_REASONS } from "@centurion/contracts/wire";
import { fail } from "@/lib/bff";

const id = z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const mode = z.enum(["practice", "real"]);

export const LocaleBody = z.object({ locale: z.enum(["en", "id"]) }).strict();
/** Per-strategy mode switch body (`POST /strategies/{id}/mode`); the 2.5 s hold is client-side only. */
export const StrategyModeBody = z.object({ mode, expected_rev: z.number().int().min(0).optional() }).strict();

const Webauthn = z.object({ credential_id: z.string().max(1024), client_data_json: z.string().max(8192), authenticator_data: z.string().max(4096), signature: z.string().max(2048), user_handle: z.string().max(256).nullable() }).nullable();
const Device = z.object({ platform: z.string().max(32), app_version: z.string().max(32), model: z.string().max(64).nullable(), attestation: z.unknown().nullable() }).partial();
const Confirmation = z.union([
  z.object({ challenge_id: id, challenge: z.string().max(512), webauthn: Webauthn.optional(), typed_confirmation: z.string().max(120).nullable().optional(), hold_duration_ms: z.number().int().min(0).max(60_000), device: Device.optional() }),
  z.object({ hold_duration_ms: z.number().int().min(0).max(60_000) }).strict(), // PracticeHoldProof
]);
export const DecisionBody = z.object({
  decision: z.enum(["approve", "reject"]),
  token: z.string().min(1).max(256),
  expected_rev: z.number().int().min(0).optional(),
  expected_quote_id: z.string().regex(/^\d{1,19}$/).nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
  reject_reason: z.enum(APPROVAL_REJECT_REASONS as unknown as [string, ...string[]]).optional(),
  confirmation: Confirmation.optional(),
});
export const ChallengeBody = z.object({ action: z.string().max(64), target: id, payload_hash: z.string().regex(/^[0-9a-f]{64}$/), typed_name: z.string().max(120).optional(), mode }).strict();
export const CloseBody = z.object({ fraction_bps: z.number().int().min(1).max(10_000).optional(), expected_rev: z.number().int().min(0).optional(), mode: mode.optional(), sell_pct: z.unknown().optional() });
/** settings stay a JSON object here; the strategy schema validates the values (SETTINGS_SCHEMA_INVALID). */
const Settings = z.record(z.string().max(64), z.unknown()).refine((o) => Object.keys(o).length <= 200, "too many keys");
export const StrategyCreateBody = z.object({ mode, name: z.string().trim().min(1).max(60), settings: Settings }).strict();
export const StrategyPatchBody = z.object({ settings_patch: Settings, expected_rev: z.number().int().min(0).optional() }).strict();

export function parse<S extends z.ZodType>(schema: S, body: unknown): { ok: true; data: z.infer<S> } | { ok: false; res: Response } {
  const r = schema.safeParse(body);
  return r.success ? { ok: true, data: r.data } : { ok: false, res: fail("VALIDATION_FAILED", {}, { fields: [...new Set(r.error.issues.map((i) => i.path.join(".") || "(body)"))] }) };
}
