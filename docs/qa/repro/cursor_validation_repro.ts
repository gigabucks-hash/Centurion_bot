// Repro for BUG_HUNT_v1 F6: a cursor that passes decodeCursor() can still crash the query.
// decodeCursor's id check is /^[0-9a-f-]{36}$/ (wire.ts:185), which also accepts 36 hyphens;
// routes.ts then binds it as $9::uuid, so Postgres raises 22P02 and the API answers 500.
//
// Run from C:\cw\app:
//   node --experimental-strip-types docs/qa/repro/cursor_validation_repro.ts
import { decodeCursor } from "../../../services/backend/api/src/wire.ts";

const ts = "2026-11-06T03:00:00.000000Z";
const raw = `${ts}|${"-".repeat(36)}`;
const cursor = Buffer.from(raw, "utf8").toString("base64url");
console.log("cursor         =", cursor);
console.log("decodeCursor   =", JSON.stringify(decodeCursor(cursor)));
console.log("length ok      =", Buffer.from(cursor, "base64url").toString("utf8").split("|")[1]?.length);
