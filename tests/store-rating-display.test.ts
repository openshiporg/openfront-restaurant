import assert from "node:assert/strict";
import test from "node:test";
import seed from "../features/platform/onboarding/lib/seed.json";
import { getStorefrontRating } from "../features/storefront/lib/store-rating-display";

test("storefront does not present the model's placeholder average without a positive review count", () => {
  assert.equal(getStorefrontRating("4.8", 0), undefined);
  assert.equal(getStorefrontRating("4.8", undefined), undefined);
  assert.equal(getStorefrontRating("4.8", -1), undefined);
  assert.equal(getStorefrontRating("4.8", 2.5), undefined);
  assert.deepEqual(getStorefrontRating("4.8", 2341), { rating: 4.8, reviewCount: 2341 });
});

test("built-in onboarding data no longer seeds unverified rating or review claims", () => {
  assert.equal(Object.hasOwn(seed.storeInfo, "rating"), false);
  assert.equal(Object.hasOwn(seed.storeInfo, "reviewCount"), false);
});
