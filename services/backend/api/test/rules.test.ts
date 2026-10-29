import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, errorBody, errorDef, fromPg } from "../src/errors.ts";
import { seqParam } from "../src/rules.ts";

test("error envelope: object with code, message, flattened details, request_id, server_now", () => {
  const b: any = errorBody(new ApiError("VERSION_CONFLICT", { current_rev: 3, base_rev: 2, code: "spoof" }), "req_1", "2026-10-29T10:00:00.000Z", "en");
  assert.equal(b.error.code, "VERSION_CONFLICT");
  assert.equal(b.error.current_rev, 3);
  assert.equal(b.error.request_id, "req_1");
  assert.equal(b.server_now, b.error.server_now);
  assert.equal(b.error.message, errorDef("VERSION_CONFLICT")?.messages.en);
  assert.equal(errorBody(new ApiError("NOT_FOUND"), "r", "t", "id").error.message, errorDef("NOT_FOUND")?.messages.id);
  assert.equal(new ApiError("NO_SUCH_CODE").code, "INTERNAL");
});

test("SQL raises map through errors.json (SQLSTATE P0<http>, message = code, detail = JSON)", () => {
  const e = fromPg({ code: "P0409", message: "VERSION_CONFLICT", detail: '{"current_rev":2,"base_rev":1}' });
  assert.ok(e && e.status === 409 && e.details.current_rev === 2);
  assert.equal(fromPg({ code: "P0422", message: "IDEMPOTENCY_KEY_REUSED" })?.status, 422);
  assert.equal(fromPg({ code: "P0428", message: "PRECONDITION_REQUIRED" })?.status, 428);
  assert.equal(fromPg({ code: "23514", message: "settings.x invalid" })?.code, "VALIDATION_FAILED");
  assert.equal(fromPg({ code: "XX000", message: "boom" }), undefined);
});

test("int64 cursors are integer strings, BigInt-safe", () => {
  assert.equal(seqParam("9007199254740993", "after_seq"), "9007199254740993");
  assert.equal(seqParam("0007", "after_seq"), "7");
  for (const bad of ["-1", "1.5", "abc", "9223372036854775808"]) {
    assert.throws(() => seqParam(bad, "after_seq"), (e: unknown) => e instanceof ApiError && e.code === "CURSOR_INVALID");
  }
});
