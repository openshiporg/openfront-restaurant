import test from "node:test";
import assert from "node:assert/strict";
import { majorToMinorUnits, minorToMajorUnits, currencyMinorUnitDigits } from "../features/lib/currency-units";
import { calculateRestaurantTotals } from "../features/lib/restaurant-order-pricing";
import { formatCurrency } from "../features/storefront/lib/currency";
import { formatPayPalAmount, parsePayPalAmount } from "../features/integrations/payment/paypal";

test("currency conversion follows ISO minor-unit precision, including three-decimal currencies", () => {
  assert.equal(currencyMinorUnitDigits("USD"), 2);
  assert.equal(currencyMinorUnitDigits("JPY"), 0);
  assert.equal(currencyMinorUnitDigits("BHD"), 3);
  assert.equal(majorToMinorUnits("1.234", "BHD"), 1234);
  assert.equal(minorToMajorUnits(1234, "BHD"), 1.234);
  assert.equal(majorToMinorUnits("12.5", "JPY"), 13);
  assert.equal(minorToMajorUnits(1000, "JPY"), 1000);
});

test("restaurant pricing converts major-unit delivery settings using the selected currency", () => {
  const jpy = calculateRestaurantTotals({ subtotal: 1000, orderType: "delivery", deliveryFee: 500, taxRate: 10, currencyCode: "JPY" });
  assert.equal(jpy.deliveryFee, 500);
  assert.equal(jpy.total, 1600);
  const bhd = calculateRestaurantTotals({ subtotal: 10000, orderType: "delivery", deliveryFee: 1, taxRate: 0, currencyCode: "BHD" });
  assert.equal(bhd.deliveryFee, 1000);
  assert.equal(bhd.total, 11000);
});

test("storefront and PayPal render and parse the same provider minor units", () => {
  assert.match(formatCurrency(1000, { currencyCode: "BHD", locale: "en" }), /1\.000/);
  assert.match(formatCurrency(1000, { currencyCode: "JPY", locale: "en" }), /1,000/);
  assert.equal(formatPayPalAmount(1234, "BHD"), "1.234");
  assert.equal(parsePayPalAmount("1.234", "BHD"), 1234);
  assert.equal(formatPayPalAmount(1000, "JPY"), "1000");
  assert.equal(parsePayPalAmount("1000", "JPY"), 1000);
  assert.throws(() => parsePayPalAmount("1.2341", "BHD"), /precision/);
});
