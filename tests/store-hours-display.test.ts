import test from "node:test";
import assert from "node:assert/strict";
import { formatVenueWallClockTime, getServiceStatus, getWeeklyHoursDisplay } from "../features/storefront/lib/store-hours-display";

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

test("service status reads the venue clock: closing time while open, next opening while closed", () => {
  const hours = {
    monday: "11:00 AM - 10:00 PM",
    tuesday: "11:00 AM - 10:00 PM",
    friday: "11:00 AM - 1:00 AM",
    saturday: "10:00 AM - 11:00 PM",
    sunday: "closed",
  };
  // 2026-10-26 is a Monday. 19:30 in New York is 23:30 UTC.
  assert.deepEqual(getServiceStatus(hours, "America/New_York", "en-US", new Date("2026-10-26T23:30:00Z")), { isOpen: true, detail: "Open until 10:00 PM" });
  // Monday 08:00 local: opens later today.
  assert.deepEqual(getServiceStatus(hours, "America/New_York", "en-US", new Date("2026-10-26T12:00:00Z")), { isOpen: false, detail: "Opens 11:00 AM" });
  // Monday 23:00 local: tomorrow.
  assert.deepEqual(getServiceStatus(hours, "America/New_York", "en-US", new Date("2026-10-27T03:00:00Z")), { isOpen: false, detail: "Opens tomorrow 11:00 AM" });
  // Saturday 00:30 local is still Friday's overnight service.
  assert.deepEqual(getServiceStatus(hours, "America/New_York", "en-US", new Date("2026-10-31T04:30:00Z")), { isOpen: true, detail: "Open until 1:00 AM" });
  // Sunday 23:30 local, closed Sunday: next is Monday, which is tomorrow.
  assert.deepEqual(getServiceStatus(hours, "America/New_York", "en-US", new Date("2026-11-02T04:30:00Z")), { isOpen: false, detail: "Opens tomorrow 11:00 AM" });
  // Tuesday 23:00 local: Wednesday and Thursday have no hours, Friday is next.
  assert.deepEqual(getServiceStatus(hours, "America/New_York", "en-US", new Date("2026-10-28T03:00:00Z")), { isOpen: false, detail: "Opens Fri 11:00 AM" });
  assert.deepEqual(getServiceStatus({}, "America/New_York", "en-US", new Date("2026-10-26T23:30:00Z")), { isOpen: false, detail: null });
});
