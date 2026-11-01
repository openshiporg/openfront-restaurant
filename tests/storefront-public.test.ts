import test from "node:test";
import assert from "node:assert/strict";
import { addDays, pickTable, reservationCode, reservationSlots, venueDateString, venueWallClockToInstant, weekdayOf } from "../features/lib/venue-time";
import { normalizePromoCode, priceWithPromo } from "../features/lib/storefront-promo";
import { calculateRestaurantTotals } from "../features/lib/restaurant-order-pricing";

const hours = { monday: "11:00 AM - 10:00 PM", tuesday: "closed", wednesday: { enabled: true, ranges: [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "22:00" }] } };
const tz = "America/New_York";
const tables = [{ id: "t2", capacity: 2 }, { id: "t4", capacity: 4 }, { id: "t8", capacity: 8 }];

test("venue wall clock converts to the right instant across DST", () => {
  assert.equal(venueWallClockToInstant("2026-07-06", 18 * 60, tz).toISOString(), "2026-07-06T22:00:00.000Z");
  assert.equal(venueWallClockToInstant("2026-12-07", 18 * 60, tz).toISOString(), "2026-12-07T23:00:00.000Z");
  assert.equal(venueDateString(new Date("2026-07-07T02:30:00Z"), tz), "2026-07-06");
  assert.equal(weekdayOf("2026-07-06"), "monday");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("slots follow opening ranges and leave room for the stay", () => {
  const now = new Date("2026-07-01T00:00:00Z");
  const monday = reservationSlots({ date: "2026-07-06", hours, timezone: tz, partySize: 2, duration: 90, tables, reservations: [], now });
  assert.equal(monday[0].time, "11:00");
  assert.equal(monday.at(-1)!.time, "20:30");
  assert.deepEqual(reservationSlots({ date: "2026-07-07", hours, timezone: tz, partySize: 2, duration: 90, tables, reservations: [], now }), []);
  const split = reservationSlots({ date: "2026-07-08", hours, timezone: tz, partySize: 2, duration: 90, tables, reservations: [], now }).map((s) => s.time);
  assert.ok(split.includes("12:30") && !split.includes("13:00") && split.includes("17:00") && !split.includes("14:00"));
});

test("slots respect party size, existing reservations and the booking lead time", () => {
  const now = new Date("2026-07-06T15:00:00Z");
  const busy = [{ assignedTableId: "t8", reservationDate: venueWallClockToInstant("2026-07-06", 18 * 60, tz), duration: 90 }];
  const big = reservationSlots({ date: "2026-07-06", hours, timezone: tz, partySize: 6, duration: 90, tables, reservations: busy, now });
  assert.ok(!big.some((s) => s.time === "18:00" || s.time === "17:30" || s.time === "19:00"));
  assert.ok(big.some((s) => s.time === "19:30"));
  assert.deepEqual(reservationSlots({ date: "2026-07-06", hours, timezone: tz, partySize: 9, duration: 90, tables, reservations: [], now }), []);
  const lead = reservationSlots({ date: "2026-07-06", hours, timezone: tz, partySize: 2, duration: 90, tables, reservations: [], now: new Date("2026-07-06T15:10:00Z") });
  assert.equal(lead[0].time, "12:00");
});

test("table choice is the smallest free table and honours overlaps", () => {
  const start = venueWallClockToInstant("2026-07-06", 19 * 60, tz);
  assert.equal(pickTable(tables, [], start, 90, 3)?.id, "t4");
  assert.equal(pickTable(tables, [{ assignedTableId: "t4", reservationDate: start, duration: 90 }], start, 90, 3)?.id, "t8");
  assert.equal(pickTable(tables, [{ assignedTableId: "t4", reservationDate: new Date(start.getTime() + 90 * 60000), duration: 90 }], start, 90, 3)?.id, "t4");
  assert.equal(reservationCode("clx0abc123def456"), "123DEF456".slice(-8));
});

const rule = (type: string, value: number, extra = {}) => ({ code: "SAVE", isDisabled: false, stackable: true, startsAt: "2020-01-01", usageCount: 0, discountRule: { type, value }, ...extra });
test("promo codes validate and price in minor units", () => {
  assert.equal(normalizePromoCode("  save10 "), "SAVE10");
  assert.deepEqual(priceWithPromo(rule("percentage", 10), { subtotal: 5000, pickupDiscount: 0 }), { ok: true, amount: 500 });
  assert.deepEqual(priceWithPromo(rule("fixed", 700), { subtotal: 5000, pickupDiscount: 0 }), { ok: true, amount: 700 });
  assert.deepEqual(priceWithPromo(rule("fixed", 9000), { subtotal: 5000, pickupDiscount: 500 }), { ok: true, amount: 4500 });
  for (const bad of [rule("percentage", 10, { isDisabled: true }), rule("percentage", 10, { startsAt: "2999-01-01" }), rule("free_item", 1), null]) assert.equal(priceWithPromo(bad as any, { subtotal: 5000, pickupDiscount: 0 }).ok, false);
  assert.match((priceWithPromo(rule("percentage", 10, { endsAt: "2021-01-01" }), { subtotal: 5000, pickupDiscount: 0 }) as any).message, /expired/);
  assert.match((priceWithPromo(rule("percentage", 10, { usageLimit: 3, usageCount: 3 }), { subtotal: 5000, pickupDiscount: 0 }) as any).message, /fully used/);
  assert.equal(priceWithPromo(rule("percentage", 10, { stackable: false }), { subtotal: 5000, pickupDiscount: 500 }).ok, false);
});

test("order totals subtract the promo after tax and never reach zero", () => {
  const base = { subtotal: 5000, orderType: "pickup", tipPercent: 0, pickupDiscountPercent: 10, taxRate: 10, currencyCode: "USD" };
  const without = calculateRestaurantTotals(base);
  const withPromo = calculateRestaurantTotals({ ...base, promoDiscount: 700 });
  assert.equal(without.promoDiscount, 0);
  assert.equal(withPromo.total, without.total - 700);
  assert.equal(withPromo.tax, without.tax);
  assert.equal(calculateRestaurantTotals({ ...base, promoDiscount: 10 ** 9 }).total, 1);
});
