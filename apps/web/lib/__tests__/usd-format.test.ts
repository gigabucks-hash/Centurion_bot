import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMcapUsd, formatUsd } from "@centurion/i18n/format";

test("USD uses a leading $ in English and Indonesian, never US$", () => {
  for (const loc of ["en", "id"] as const) {
    for (const text of [formatUsd(1234.5, loc), formatMcapUsd(3_500_000, loc), formatMcapUsd(-3_500_000, loc)]) {
      assert.equal(text.includes("US$"), false, text);
      assert.match(text, /^-?\$/);
    }
  }
  assert.equal(formatMcapUsd(3_500_000, "en"), "$3.5M");
  assert.match(formatMcapUsd(3_500_000, "id"), /^\$3,5\sjt$/);
});
