import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STORE_LOGO_ICON } from "../features/lib/store-logo";
import { storeOwnMark } from "../features/storefront/lib/store-mark";

test("no saved mark means wordmark only", () => {
  assert.equal(storeOwnMark(null), "");
  assert.equal(storeOwnMark(undefined), "");
  assert.equal(storeOwnMark("   "), "");
});

test("the platform placeholder saved by onboarding is not the store's mark", () => {
  assert.equal(storeOwnMark(DEFAULT_STORE_LOGO_ICON), "");
  assert.equal(storeOwnMark(`  ${DEFAULT_STORE_LOGO_ICON}\n`), "");
});

test("a mark set in Store Settings still shows", () => {
  const cup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#92400e" d="M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/></svg>';
  const out = storeOwnMark(cup);
  assert.match(out, /^<svg/);
  assert.match(out, /M4 8h12v6/);
});
