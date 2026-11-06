import test from 'node:test';
import assert from 'node:assert/strict';
import { checkScheduledTime, groupSlots, leadForOrderType, orderAheadSlots, prepLeadMinutes, slotIsServiceable } from '../features/lib/order-ahead';
import { assertOrderingAvailable } from '../features/lib/restaurant-hours';
import { checkoutCartSignature } from '../features/keystone/utils/checkoutReservation';

const week = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => [day, { enabled: true, ranges: [{ open: '11:00', close: '22:00' }] }]));
const settings = { name: 'Stack Kitchen', timezone: 'America/New_York', hours: { ...week, _ordering: { cutoffMinutes: 0 } }, estimatedPickup: '15-20 min', estimatedDelivery: '30-45 min' };

test('prep lead uses the upper bound of the published estimate', () => {
  assert.equal(prepLeadMinutes('15-20 min', 30), 20);
  assert.equal(prepLeadMinutes('1 hr', 30), 60);
  assert.equal(prepLeadMinutes('', 30), 30);
  assert.equal(leadForOrderType(settings, 'delivery'), 45);
  assert.equal(leadForOrderType(settings, 'pickup'), 20);
});

test('closed overnight: first slot is opening + prep, slots stay inside hours, horizon ends tomorrow', () => {
  // Fri 2026-11-06 03:00 EST (08:00Z) — closed until 11:00.
  const now = new Date('2026-11-06T08:00:00Z');
  const slots = orderAheadSlots(settings.hours, settings.timezone, 20, now);
  assert.equal(slots[0].toISOString(), '2026-11-06T16:30:00.000Z'); // 11:30 AM (11:00 + 20 → next 15-min mark)
  assert.equal(slots.at(-1)!.toISOString(), '2026-11-08T02:45:00.000Z'); // Sat 9:45 PM, last slot before the 10 PM close
  assert.ok(slots.every((slot) => slotIsServiceable(settings.hours, settings.timezone, slot, 20)));
  const groups = groupSlots(slots, settings.timezone, now);
  assert.deepEqual(groups.map((group) => group.label), ['Today', 'Tomorrow']);
});

test('open now: earliest slot is now + prep; a slot past close is refused', () => {
  const now = new Date('2026-11-06T20:05:00Z'); // 3:05 PM EST
  const slots = orderAheadSlots(settings.hours, settings.timezone, 20, now);
  assert.equal(slots[0].toISOString(), '2026-11-06T20:30:00.000Z');
  assert.equal(checkScheduledTime(settings, 'pickup', '2026-11-07T03:15:00.000Z', now).ok, false); // 10:15 PM
  const ok = checkScheduledTime(settings, 'pickup', '2026-11-06T23:00:00.000Z', now);
  assert.ok(ok.ok && ok.fireAt.toISOString() === '2026-11-06T22:40:00.000Z');
  assert.equal(checkScheduledTime(settings, 'pickup', '2026-11-06T23:07:00.000Z', now).ok, false); // off-grid
  assert.equal(checkScheduledTime(settings, 'pickup', 'nonsense', now).ok, false);
});

test('closed store: basket building is allowed when a later time exists; ASAP checkout is not', () => {
  const now = new Date('2026-11-06T08:00:00Z');
  assert.doesNotThrow(() => assertOrderingAvailable(settings, undefined, now, { allowLater: true, hasLaterSlot: true }));
  assert.doesNotThrow(() => assertOrderingAvailable(settings, undefined, now, { at: new Date('2026-11-06T16:30:00Z') }));
  assert.throws(() => assertOrderingAvailable(settings, undefined, now, { hasLaterSlot: true }), (error: any) => {
    assert.equal(error.extensions.code, 'RESTAURANT_CLOSED');
    assert.match(error.message, /Choose a later pickup time to order ahead\./);
    return true;
  });
  assert.throws(() => assertOrderingAvailable(settings, undefined, now, { allowLater: true, hasLaterSlot: false }), /closed right now/);
});

test('service periods are checked at the chosen time', () => {
  const withPeriods = { ...settings, hours: { ...settings.hours, _ordering: { mealPeriods: { breakfast: { open: '11:00', close: '12:00' } } } } };
  const now = new Date('2026-11-06T08:00:00Z');
  assert.doesNotThrow(() => assertOrderingAvailable(withPeriods, { mealPeriods: ['breakfast'] }, now, { at: new Date('2026-11-06T16:30:00Z') }));
  assert.throws(() => assertOrderingAvailable(withPeriods, { name: 'Pancakes', mealPeriods: ['breakfast'] }, now, { at: new Date('2026-11-06T19:00:00Z') }), /not served at the time you chose/);
});

test('scheduled time joins the checkout signature only when chosen', () => {
  const cart = { orderType: 'pickup', email: 'a@b.c', items: [] };
  assert.equal(checkoutCartSignature(cart), checkoutCartSignature({ ...cart, scheduledFor: null }));
  assert.notEqual(checkoutCartSignature(cart), checkoutCartSignature({ ...cart, scheduledFor: '2026-11-06T16:30:00.000Z' }));
});

test("a scheduled order refunded before its kitchen start is never released to the kitchen", async () => {
  const { readFileSync } = await import("node:fs");
  const sync = readFileSync("features/keystone/utils/kitchenTicketSync.ts", "utf8");
  assert.match(sync, /order\.payments\.every\(\(payment[^)]*\) => String\(payment\.status \|\| ""\)\.toLowerCase\(\) === "refunded"\)\) continue;/);
});

test("the order-received email shows the total as money and links to the order, never minor units", async () => {
  const { orderReceivedText } = await import("../features/lib/order-confirmation-text");
  const text = orderReceivedText({ storeName: "Stack Kitchen", orderType: "pickup", orderNumber: "ORD-1", total: 1381, currencyCode: "usd", paid: true, statusUrl: "https://r.test/order/confirmed/o1?secretKey=k" });
  assert.match(text, /Total \$13\.81, paid by card\./);
  assert.match(text, /Order ORD-1 \(pickup\) is in\./);
  assert.match(text, /Track your order: https:\/\/r\.test\/order\/confirmed\/o1\?secretKey=k/);
  assert.doesNotMatch(text, /minor units/);
});

test("an online pickup order emails 'ready for pickup' once, and only online takeout orders get it", async () => {
  const { notifyOnlinePickupReady } = await import("../features/keystone/utils/restaurantNotifications");
  const events = new Map<string, any>();
  const order: any = { id: "o1", status: "ready", orderType: "takeout", orderSource: "online", orderNumber: "ORD-1", customerEmail: "g@x.co", customer: null };
  const prisma: any = {
    restaurantOrder: { findUnique: async () => order },
    storeSettings: { findUnique: async () => ({ name: "Stack Kitchen", address: "742 Artisan Way" }) },
    auditEvent: {
      upsert: async ({ where, create }: any) => { if (!events.has(where.eventKey)) events.set(where.eventKey, { id: `e${events.size}`, ...create }); return events.get(where.eventKey); },
      findUnique: async ({ where }: any) => where.eventKey ? events.get(where.eventKey) : [...events.values()].find((e) => e.id === where.id),
      findMany: async ({ where }: any) => [...events.values()].filter((e) => e.entityType === where.entityType && e.entityId === where.entityId),
      create: async ({ data }: any) => { const row = { id: `e${events.size}`, ...data }; events.set(data.eventKey || row.id, row); return row; },
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  const sent: any[] = [];
  const transport = async (message: any) => { sent.push(message); return { accepted: true }; };
  const context: any = { prisma, session: null, sudo: () => context };
  await notifyOnlinePickupReady(context, "o1", transport);
  await notifyOnlinePickupReady(context, "o1", transport);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, "Order ORD-1 is ready for pickup");
  assert.match(sent[0].text, /ready for pickup/);
  order.orderSource = "pos";
  events.clear();
  await notifyOnlinePickupReady(context, "o1", transport);
  assert.equal(sent.length, 1);
});

test("a reservation booked days ahead gets one reminder the day before; a same-day booking does not", async () => {
  const { sendDueReservationReminders } = await import("../features/keystone/utils/restaurantNotifications");
  const now = new Date("2026-11-06T12:00:00Z");
  const events = new Map<string, any>();
  const reservations = [
    { id: "r1", customerName: "Ana", customerEmail: "ana@x.co", partySize: 2, reservationDate: new Date("2026-11-07T00:00:00Z"), createdAt: new Date("2026-11-01T00:00:00Z") },
    { id: "r2", customerName: "Ben", customerEmail: "ben@x.co", partySize: 4, reservationDate: new Date("2026-11-07T00:00:00Z"), createdAt: new Date("2026-11-06T10:00:00Z") },
  ];
  const prisma: any = {
    reservation: { findMany: async () => reservations },
    storeSettings: { findUnique: async () => ({ name: "Stack Kitchen", timezone: "America/New_York", address: "742 Artisan Way", phone: "555-0100" }) },
    auditEvent: {
      upsert: async ({ where, create }: any) => { if (!events.has(where.eventKey)) events.set(where.eventKey, { id: `e${events.size}`, ...create }); return events.get(where.eventKey); },
      findUnique: async ({ where }: any) => where.eventKey ? events.get(where.eventKey) : [...events.values()].find((e) => e.id === where.id),
      findMany: async ({ where }: any) => [...events.values()].filter((e) => e.entityType === where.entityType && e.entityId === where.entityId),
      create: async ({ data }: any) => { const row = { id: `e${events.size}`, ...data }; events.set(data.eventKey || row.id, row); return row; },
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  const sent: any[] = [];
  const transport = async (m: any) => { sent.push(m); return { accepted: true }; };
  const context: any = { prisma, session: null, sudo: () => context };
  await sendDueReservationReminders(context, transport, now);
  await sendDueReservationReminders(context, transport, now);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "ana@x.co");
  assert.match(sent[0].text, /table for 2 at Stack Kitchen on Friday, November 6 at 7:00 PM/);
});
