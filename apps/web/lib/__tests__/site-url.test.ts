// `metadataBase` fallback: a blank NEXT_PUBLIC_SITE_URL (Docker ARG default) must not throw.
import { test } from "node:test";
import assert from "node:assert/strict";
import { siteUrl } from "../site-url";

test("site url: blank or unset falls back, a real value is kept", () => {
  assert.equal(siteUrl(undefined), "http://localhost:3100");
  assert.equal(siteUrl(null), "http://localhost:3100");
  assert.equal(siteUrl(""), "http://localhost:3100");
  assert.equal(siteUrl("   "), "http://localhost:3100");
  assert.equal(siteUrl(" https://paper.example.com "), "https://paper.example.com");
  // The fallback itself must be a URL `metadataBase` accepts.
  assert.doesNotThrow(() => new URL(siteUrl("")));
});
