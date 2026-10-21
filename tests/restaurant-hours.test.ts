import test from 'node:test';
import assert from 'node:assert/strict';
import { orderingWindow, mealAvailable, assertOrderingAvailable, clockMinutes } from '../features/lib/restaurant-hours';
test('legacy and structured windows are venue-local, exact close exclusive', () => {
  const hours = { monday: '11:00 AM - 10:00 PM' };
  assert.equal(orderingWindow(hours, 'America/New_York', new Date('2026-09-07T14:59Z')), false);
  assert.equal(orderingWindow(hours, 'America/New_York', new Date('2026-09-07T15:00Z')), true);
  assert.equal(orderingWindow(hours, 'America/New_York', new Date('2026-09-08T02:00Z')), false);
});
test('previous-day overnight window survives a closed following day and cutoff', () => {
  const hours = { monday: { enabled: true, ranges: [{ open: '22:00', close: '02:00' }] }, tuesday: { enabled: false, ranges: [] } };
  assert.equal(orderingWindow(hours, 'UTC', new Date('2026-09-08T01:00Z')), true);
  assert.equal(orderingWindow(hours, 'UTC', new Date('2026-09-08T01:45Z'), 30), false);
  assert.equal(orderingWindow(hours, 'UTC', new Date('2026-09-07T21:00Z')), false);
});
test('malformed/empty schedules fail closed and menu/category constraints intersect', () => {
  assert.equal(clockMinutes('25:00'), null); assert.equal(clockMinutes('12:01 AM'), 1);
  assert.equal(orderingWindow({ monday: 'nonsense' }, 'UTC', new Date('2026-09-07T12:00Z')), false);
  const now = new Date('2026-09-07T12:00Z'), settings = { timezone: 'UTC', hours: { monday: '09:00 - 22:00', _ordering: { mealPeriods: { breakfast: { open: '06:00', close: '11:00' }, lunch: { open: '11:00', close: '16:00' } } } } };
  assert.equal(mealAvailable(['breakfast'], { monday: '09:00 - 22:00' }, 'UTC', now), true);
  assert.equal(mealAvailable(['breakfast'], settings.hours, 'UTC', now), false);
  assert.throws(() => assertOrderingAvailable(settings, { mealPeriods: ['all_day'], category: { mealPeriods: ['breakfast'] } }, now), /service period/);
  assert.doesNotThrow(() => assertOrderingAvailable(settings, { mealPeriods: ['lunch'] }, now));
});
