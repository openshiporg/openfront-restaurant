import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STORE_LOGO_ICON } from "../features/lib/store-logo";
import { storeOwnMark } from "../features/storefront/lib/store-mark";

test("an icon is always returned: the platform default when nothing is saved", () => {
  const dflt = storeOwnMark(DEFAULT_STORE_LOGO_ICON);
  assert.match(dflt, /^<svg/);
  assert.equal(storeOwnMark(null), dflt);
  assert.equal(storeOwnMark(undefined), dflt);
  assert.equal(storeOwnMark("   "), dflt);
  assert.equal(storeOwnMark(`  ${DEFAULT_STORE_LOGO_ICON}\n`), dflt);
});

test("a mark set in Store Settings shows; unsafe SVG falls back to the default icon", () => {
  const mark = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#155eef" d="M6 18h11a4 4 0 0 0 0-8z"/></svg>';
  assert.match(storeOwnMark(mark), /M6 18h11/);
  assert.equal(storeOwnMark('<svg><script>alert(1)</script></svg>'), storeOwnMark(DEFAULT_STORE_LOGO_ICON));
});
