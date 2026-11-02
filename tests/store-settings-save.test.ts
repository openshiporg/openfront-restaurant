import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStoreSettingsPayload } from "../features/platform/store-settings/lib/store-settings-payload";
import { LOGO_ICONS } from "../features/platform/store-settings/lib/icon-registry";
import { changesDeliveryConfig } from "../features/keystone/models/StoreSettings";

const GREEN = readFileSync(new URL("../features/platform/onboarding/lib/seed.json", import.meta.url), "utf8");
const seedLogo = JSON.parse(GREEN).storeInfo.logoIcon as string;

test("a preset icon and hue go into the mutation payload unchanged", () => {
  const result = buildStoreSettingsPayload({ name: "Stack Kitchen", logoIcon: LOGO_ICONS[3].lightSvg, logoColor: "120" });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data, { name: "Stack Kitchen", logoIcon: LOGO_ICONS[3].lightSvg, logoColor: "120" });
});

test("a pasted custom SVG (the seeded green stripes) is kept", () => {
  const result = buildStoreSettingsPayload({ logoIcon: `\n${seedLogo}  `, logoColor: "0" });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.logoIcon, seedLogo);
  assert.equal(result.data.logoColor, "0");
});

test("every preset in the E-commerce registry survives the sanitizer", () => {
  for (const icon of LOGO_ICONS) {
    const result = buildStoreSettingsPayload({ logoIcon: icon.lightSvg });
    assert.equal(result.success, true, icon.id);
  }
});

test("the hue is normalized to 0-359", () => {
  const result = buildStoreSettingsPayload({ logoColor: "-90" });
  assert.equal(result.success && result.data.logoColor, "270");
  const wrapped = buildStoreSettingsPayload({ logoColor: "400" });
  assert.equal(wrapped.success && wrapped.data.logoColor, "40");
  const junk = buildStoreSettingsPayload({ logoColor: "red" });
  assert.equal(junk.success && junk.data.logoColor, "0");
});

test("an unsafe SVG rejects the save instead of being stored", () => {
  const result = buildStoreSettingsPayload({ logoIcon: '<svg onload="alert(1)"></svg>' });
  assert.deepEqual(result, { success: false, error: "Invalid SVG format" });
});

test("a full-form save that leaves delivery as stored is not re-validated; a delivery change is", () => {
  const stored = { deliveryEnabled: true, countryCode: "US", deliveryPostalCodes: [] };
  assert.equal(changesDeliveryConfig({ logoIcon: seedLogo, logoColor: "0" }, stored), false);
  assert.equal(changesDeliveryConfig({ logoIcon: seedLogo, deliveryEnabled: true, countryCode: "us", deliveryPostalCodes: [] }, stored), false);
  assert.equal(changesDeliveryConfig({ deliveryEnabled: false }, stored), true);
  assert.equal(changesDeliveryConfig({ deliveryPostalCodes: ["11201"] }, stored), true);
  assert.equal(changesDeliveryConfig({ countryCode: "GB" }, stored), true);
  assert.equal(changesDeliveryConfig({ deliveryEnabled: true }, { deliveryEnabled: false }), true);
});
