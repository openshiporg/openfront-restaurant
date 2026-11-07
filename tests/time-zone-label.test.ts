import test from "node:test";
import assert from "node:assert/strict";
import { timeZoneLabel, timesInLabel, timeZoneCity } from "../features/lib/time-zone-label";

const winter = new Date("2026-01-15T12:00:00Z");
const summer = new Date("2026-07-15T12:00:00Z");

test("US zones read as generic names with their abbreviation, all year", () => {
  for (const date of [winter, summer]) {
    assert.equal(timeZoneLabel("America/Los_Angeles", { date }), "Pacific Time (PT)");
    assert.equal(timeZoneLabel("America/Denver", { date }), "Mountain Time (MT)");
    assert.equal(timeZoneLabel("America/Chicago", { date }), "Central Time (CT)");
    assert.equal(timeZoneLabel("America/New_York", { date }), "Eastern Time (ET)");
    assert.equal(timeZoneLabel("America/Anchorage", { date }), "Alaska Time (AKT)");
    assert.equal(timeZoneLabel("Pacific/Honolulu", { date }), "Hawaii Time (HT)");
  }
});

test("city form", () => {
  assert.equal(timeZoneLabel("America/Los_Angeles", { city: true }), "Pacific Time · Los Angeles");
  assert.equal(timeZoneLabel("America/Indiana/Indianapolis", { city: true }), "Eastern Time · Indianapolis");
  assert.equal(timesInLabel("America/New_York"), "Times in Eastern Time (ET)");
});

test("non-US zones use Intl names without a meaningless abbreviation", () => {
  assert.equal(timeZoneLabel("Europe/Berlin", { date: winter }), "Central European Time");
  assert.equal(timeZoneLabel("Asia/Tokyo", { date: winter }), "Japan Standard Time");
  assert.equal(timeZoneLabel("Asia/Karachi", { date: winter }), "Pakistan Standard Time");
  assert.equal(timeZoneLabel("Europe/London", { date: summer }), "UK Time");
  assert.equal(timeZoneLabel("UTC"), "Coordinated Universal Time (UTC)");
});

test("never echoes a raw IANA id", () => {
  for (const zone of ["America/Los_Angeles", "Europe/Berlin", "Asia/Kolkata", "Australia/Sydney", "Africa/Lagos", "America/Argentina/Buenos_Aires", "Not/A_Zone"]) {
    const label = timeZoneLabel(zone);
    assert.ok(label, zone);
    assert.doesNotMatch(label, /\w\/\w|_/, `${zone} -> ${label}`);
  }
  assert.equal(timeZoneLabel("Not/A_Zone"), "A Zone time");
  assert.equal(timeZoneLabel(""), "");
  assert.equal(timeZoneLabel(null), "");
  assert.equal(timesInLabel(undefined), "");
  assert.equal(timeZoneCity("America/Los_Angeles"), "Los Angeles");
});
