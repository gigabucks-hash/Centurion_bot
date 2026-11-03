// Regression: the error registry must load on every platform from its own module URL.
// `new URL(...).pathname` produced `C:\C:\...` on Windows and broke API startup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, errorCodes, errorDef } from "../src/errors.ts";

test("registry loads from the contracts package (platform-independent path)", () => {
  const codes = errorCodes();
  assert.ok(codes.length > 0, "errors.json should provide codes");
  assert.ok(codes.includes("UNAUTHENTICATED"));
  assert.equal(errorDef("UNAUTHENTICATED")?.http, 401);
});

test("unknown codes fall back to INTERNAL without throwing", () => {
  const err = new ApiError("NOT_A_REAL_CODE");
  assert.equal(err.code, "INTERNAL");
  assert.equal(err.status, 500);
});
