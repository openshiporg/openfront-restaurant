import test from "node:test";
import assert from "node:assert/strict";
import { formatVenueWallClockTime, getWeeklyHoursDisplay } from "../features/storefront/lib/store-hours-display";

test("footer renders venue wall-clock hours independent of the host timezone", () => {
  assert.equal(formatVenueWallClockTime("11:00 AM", "en-US"), "11:00 AM");
  assert.equal(formatVenueWallClockTime("22:00", "en-US"), "10:00 PM");
  assert.equal(formatVenueWallClockTime("2:30 AM", "en-US"), "2:30 AM");
  assert.equal(formatVenueWallClockTime("27:99", "en-US"), "27:99");
});

test("weekly hours preserve every split service range and closed days", () => {
  const week = getWeeklyHoursDisplay({
    monday: "11:00 AM - 10:00 PM",
    tuesday: { enabled: true, ranges: [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "22:00" }] },
    wednesday: { enabled: false, ranges: [{ open: "09:00", close: "17:00" }] },
  }, "en-US");
  assert.deepEqual(week.slice(0, 3), [
    { day: "Mon", value: "11:00 AM – 10:00 PM" },
    { day: "Tue", value: "11:00 AM – 2:00 PM · 5:00 PM – 10:00 PM" },
    { day: "Wed", value: "Closed" },
  ]);
  assert.ok(week.slice(3).every((entry) => entry.value === "Closed"));
});
