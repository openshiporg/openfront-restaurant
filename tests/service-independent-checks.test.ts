import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateEqualCheckCharges, getActiveCheckAllocation, assertNoActiveCheckAllocation } from '../features/keystone/utils/checkAllocations';
import { splitCheckByGuest, splitCheckBySeat, recombineEqualChecks, splitCheckByItem } from '../features/keystone/mutations/splitCheck';
import { assertServiceTransition } from '../features/keystone/utils/serviceOrderState';

function harness() {
  let version = 0, failChildAt = 0;
  let state: any = {
    orders: [{ id: 'source', orderNumber: 'DINE-1', orderType: 'dine_in', orderSource: 'pos', status: 'served', currencyCode: 'USD', subtotal: 101, tax: 9, tip: 5, discount: 3, total: 112, guestCount: 3,
      tables: [{ id: 'table' }], payments: [], courses: [{ id: 'course', orderId: 'source', courseNumber: 1, status: 'fired' }],
      orderItems: [{ id: 'a', orderId: 'source', itemNameSnapshot: 'Soup', price: 33, quantity: 1, seatNumber: 1, courseId: 'course', firedAt: '2026-09-05T12:00:00Z' }, { id: 'b', orderId: 'source', itemNameSnapshot: 'Soup', price: 44, quantity: 1, seatNumber: 2, courseId: 'course', firedAt: '2026-09-05T12:00:00Z' }, { id: 'c', orderId: 'source', itemNameSnapshot: 'Soup', price: 24, quantity: 1, seatNumber: 3, courseId: 'course', firedAt: '2026-09-05T12:00:00Z' }] }],
    tickets: [{ id: 'ticket', orderId: 'source', stationId: 'grill', status: 'served', items: ['a', 'b', 'c'].map(id => ({ id, name: 'Soup', quantity: 1, station: 'grill', status: 'fulfilled', workSignature: `work-${id}` })) }],
    adjustments: [], events: [{ eventKey: 'pricing-policy:source', after: { version: 1, taxRate: 8, currencyCode: 'USD', deliveryFee: null, deliveryMinimum: null, pickupDiscount: null, serviceCharge: 0, taxBasis: 'item-subtotal-before-discount', voluntaryTip: true, legacyInferred: false } }], sequence: 1,
  };
  function delegates(draft: any) {
    const getOrder = (id: string) => draft.orders.find((order: any) => order.id === id);
    return {
      orderAdjustment: {
        findMany: async ({ where }: any) => draft.adjustments.filter((row: any) => row.idempotencyKey.startsWith(where.idempotencyKey.startsWith) && row.metadata?.parties?.some((party: any) => party.id === where.metadata.array_contains[0].id)),
        findFirst: async ({ where }: any) => [...draft.adjustments].reverse().find((row: any) => (!where.orderId || row.orderId === where.orderId) && row.idempotencyKey.startsWith(where.idempotencyKey.startsWith)) || null,
        findUnique: async ({ where }: any) => draft.adjustments.find((row: any) => row.idempotencyKey === where.idempotencyKey) || null,
        create: async ({ data }: any) => { const row = { id: `adjustment-${draft.sequence++}`, ...data }; draft.adjustments.push(row); return row; },
      },
      auditEvent: {
        findUnique: async ({ where }: any) => draft.events.find((event: any) => event.eventKey === where.eventKey) || null,
        upsert: async ({ where, create }: any) => { const prior = draft.events.find((event: any) => event.eventKey === where.eventKey); if (prior) return prior; draft.events.push(create); return create; },
      },
      restaurantOrder: {
        findUnique: async ({ where }: any) => { const order = getOrder(where.id); return order ? structuredClone(order) : null; },
        findMany: async ({ where }: any) => structuredClone(draft.orders.filter((order: any) => where.id.in.includes(order.id) && (!where.status?.not || order.status !== where.status.not))),
        create: async ({ data }: any) => { if (failChildAt && draft.orders.length === failChildAt) throw new Error('injected child failure'); const order = { ...data, id: `child-${draft.sequence++}`, orderItems: [], courses: [], payments: [], tables: data.tables?.connect || [] }; draft.orders.push(order); return structuredClone(order); },
        update: async ({ where, data }: any) => { const order = getOrder(where.id); Object.assign(order, data); if (data.tables) order.tables = data.tables.set || data.tables.connect; return structuredClone(order); },
      },
      payment: { count: async ({ where }: any) => getOrder(where.orderId).payments.filter((payment: any) => where.status.in.includes(payment.status)).length },
      orderCourse: {
        findUnique: async ({ where }: any) => draft.orders.flatMap((order: any) => order.courses).find((course: any) => course.id === where.id),
        create: async ({ data }: any) => { const course = { ...data, id: `course-${draft.sequence++}` }; getOrder(data.orderId).courses.push(course); return course; },
      },
      orderItem: { update: async ({ where, data }: any) => { const source = draft.orders.find((order: any) => order.orderItems.some((item: any) => item.id === where.id)); const item = source.orderItems.find((item: any) => item.id === where.id); source.orderItems = source.orderItems.filter((item: any) => item.id !== where.id); Object.assign(item, data); getOrder(data.orderId).orderItems.push(item); return item; } },
      kitchenTicket: {
        findMany: async ({ where }: any) => structuredClone(draft.tickets.filter((ticket: any) => ticket.orderId === where.orderId)),
        create: async ({ data }: any) => { const ticket = { ...data, id: `ticket-${draft.sequence++}` }; draft.tickets.push(ticket); return ticket; },
        update: async ({ where, data }: any) => Object.assign(draft.tickets.find((ticket: any) => ticket.id === where.id), data),
      },
    };
  }
  const prisma: any = {
    ...delegates(state),
    $transaction: async (fn: any, options: any) => { assert.equal(options.isolationLevel, 'Serializable'); const current = version, draft = structuredClone(state); const result = await fn(delegates(draft)); if (current !== version) throw { code: 'P2034' }; state = draft; version++; return result; },
  };
  const context: any = { session: { itemId: 'staff', data: { isActive: true, role: { canManageOrders: true } } }, prisma,
    sudo: () => ({ query: { RestaurantOrder: { findOne: async () => null } } }),
  };
  return { context, state: () => state, failChild: (at: number) => { failChildAt = at; }, tx: () => delegates(state) };
}
const equal = { orderId: 'source', guestCount: 3, idempotencyKey: 'equal-request-1' };
test('equal financial allocation conserves every component and differs by at most one cent', () => {
  for (let subtotal = 1; subtotal < 150; subtotal += 7) for (let count = 2; count <= 20; count++) {
    const original = { subtotal, tax: 13, tip: 7, discount: Math.floor(subtotal / 3), deliveryCharge: 19, total: subtotal + 13 + 7 + 19 - Math.floor(subtotal / 3) };
    const parts = allocateEqualCheckCharges(original, count);
    for (const field of Object.keys(original)) assert.equal(parts.reduce((sum, part) => sum + part[field as keyof typeof original], 0), original[field as keyof typeof original]);
    assert.ok(Math.max(...parts.map(part => part.total)) - Math.min(...parts.map(part => part.total)) <= 1);
    for (const part of parts) assert.equal(part.subtotal + part.tax + part.tip + part.deliveryCharge - part.discount, part.total);
  }
});
test('equal checks own distinct payable totals while retaining one production and inventory identity', async () => {
  const h = harness(), production = structuredClone(h.state().orders[0].orderItems), tickets = structuredClone(h.state().tickets);
  const result = await splitCheckByGuest(null, equal, h.context);
  assert.equal(result.success, true, result.error || ''); assert.equal(result.newOrderIds.length, 3);
  assert.deepEqual(h.state().orders.map((order: any) => order.total), [38, 37, 37]);
  assert.deepEqual(h.state().orders[0].orderItems, production); assert.deepEqual(h.state().tickets, tickets);
  for (const child of h.state().orders.slice(1)) { assert.equal(child.status, 'served'); assert.equal(child.orderItems.length, 0); assert.deepEqual(child.tables, [{ id: 'table' }]); }
  const allocation = await getActiveCheckAllocation(h.tx(), result.newOrderIds[1]);
  assert.equal(allocation!.ordinal, 2); assert.equal(allocation!.sourceOrderId, 'source'); assert.equal(allocation!.allocatedTotals.total, 37);
  await assert.rejects(assertNoActiveCheckAllocation(h.tx(), 'source'), /Recombine/);
  assert.throws(() => assertServiceTransition(h.state().orders[1], 'completed'), /payment/);
  h.state().orders[1].payments.push({ status: 'succeeded', amount: 37 });
  assert.doesNotThrow(() => assertServiceTransition(h.state().orders[1], 'completed'));
  assert.throws(() => assertServiceTransition(h.state().orders[2], 'completed'), /payment/);
});
test('concurrent equal retries commit one group and changed count cannot reuse a key', async () => {
  const h = harness();
  const [a, b] = await Promise.all([splitCheckByGuest(null, equal, h.context), splitCheckByGuest(null, equal, h.context)]);
  assert.equal(a.success, true); assert.deepEqual(a, b); assert.equal(h.state().orders.length, 3);
  assert.match((await splitCheckByGuest(null, { ...equal, guestCount: 4 }, h.context)).error!, /different guest count/);
});
test('equal allocation rejects unpaid prep, uncertain tenders, stored value and unauthorized callers', async () => {
  for (const mutate of [(order: any) => { order.status = 'in_progress'; }, (order: any) => { order.payments.push({ status: 'unknown', amount: 1 }); }, (order: any) => { order.orderSource = 'gift_card'; }, (order: any) => { order.courses[0].onHold = true; }]) {
    const h = harness(); mutate(h.state().orders[0]); const before = structuredClone(h.state());
    assert.equal((await splitCheckByGuest(null, equal, h.context)).success, false); assert.deepEqual(h.state(), before);
  }
  assert.match((await splitCheckByGuest(null, equal, { session: null, prisma: { $transaction: () => { throw new Error('privileged access'); } } } as any)).error!, /Not authorized/);
});
test('child creation failure rolls back every allocation and leaves the request retryable', async () => {
  const h = harness(), before = structuredClone(h.state()); h.failChild(2);
  assert.match((await splitCheckByGuest(null, equal, h.context)).error!, /injected child/); assert.deepEqual(h.state(), before);
  h.failChild(0); assert.equal((await splitCheckByGuest(null, equal, h.context)).success, true);
});
test('equal recombination restores full source charges and never moves food; captured money blocks it', async () => {
  const h = harness(); await splitCheckByGuest(null, equal, h.context);
  h.state().orders[1].payments.push({ status: 'succeeded', amount: 37 });
  assert.match((await recombineEqualChecks(null, { orderId: 'source' }, h.context)).error!, /Refund captured/);
  h.state().orders[1].payments[0] = { status: 'refunded', amount: 37, refundedAmount: 37 };
  const result = await recombineEqualChecks(null, { orderId: h.state().orders[2].id }, h.context);
  assert.equal(result.success, true, result.error || ''); assert.equal(h.state().orders[0].total, 112);
  assert.equal(h.state().orders[0].orderItems.length, 3);
  assert.ok(h.state().orders.slice(1).every((order: any) => order.status === 'cancelled' && order.total === 0 && !order.tables.length));
  assert.equal(await getActiveCheckAllocation(h.tx(), 'source'), null);
  assert.match((await splitCheckByGuest(null, equal, h.context)).error!, /recombined/);
});
test('allocated checks cannot be split again through the ordinary item route', async () => {
  const h = harness(); await splitCheckByGuest(null, equal, h.context);
  assert.match((await splitCheckByItem(null, { orderId: 'source', itemIds: ['a'] }, h.context)).error!, /Recombine/);
});
test('seat split atomically partitions every line/course/ticket and conserves totals', async () => {
  const h = harness();
  const result = await splitCheckBySeat(null, { orderId: 'source', idempotencyKey: 'seat-request-1' }, h.context);
  assert.equal(result.success, true, result.error || ''); assert.equal(result.newOrderIds.length, 3);
  assert.deepEqual(h.state().orders.map((order: any) => order.orderItems.map((item: any) => item.id)), [['a'], ['b'], ['c']]);
  assert.equal(h.state().orders.reduce((sum: number, order: any) => sum + order.total, 0), 112);
  for (const order of h.state().orders) for (const item of order.orderItems) assert.ok(order.courses.some((course: any) => course.id === item.courseId));
  assert.deepEqual(h.state().tickets.flatMap((ticket: any) => ticket.items).map((item: any) => item.workSignature).sort(), ['work-a', 'work-b', 'work-c']);
  const replay = await splitCheckBySeat(null, { orderId: 'source', idempotencyKey: 'seat-request-1' }, h.context);
  assert.deepEqual(replay, result); assert.equal(h.state().orders.length, 3);
});
test('seat split fails atomically on the last child or an unassigned item', async () => {
  const h = harness(), before = structuredClone(h.state()); h.failChild(2);
  assert.match((await splitCheckBySeat(null, { orderId: 'source', idempotencyKey: 'seat-request-1' }, h.context)).error!, /injected child/); assert.deepEqual(h.state(), before);
  h.failChild(0); h.state().orders[0].orderItems[2].seatNumber = null;
  assert.match((await splitCheckBySeat(null, { orderId: 'source', idempotencyKey: 'seat-request-1' }, h.context)).error!, /Assign every item/); assert.equal(h.state().orders.length, 1);
});

import { physicalGuestsForOrder } from '../features/keystone/utils/physicalParties';
import { mergeChecks } from '../features/keystone/mutations/splitCheck';
test('equal and seat checks count the original physical party once, including recombination', async () => {
  for (const mode of ['equal', 'seat']) {
    const h = harness();
    if (mode === 'equal') await splitCheckByGuest(null, equal, h.context);
    else await splitCheckBySeat(null, { orderId: 'source', idempotencyKey: 'seat-cover-test' }, h.context);
    const counts = await Promise.all(h.state().orders.map((order: any) => physicalGuestsForOrder(h.tx(), order)));
    assert.deepEqual(counts, [3, 0, 0]);
    if (mode === 'equal') {
      await recombineEqualChecks(null, { orderId: 'source' }, h.context);
      assert.equal(await physicalGuestsForOrder(h.tx(), h.state().orders[0]), 3);
    }
  }
});
test('merging the physical party owner into its split child transfers covers without duplication', async () => {
  const h = harness(); await splitCheckBySeat(null, { orderId: 'source', idempotencyKey: 'seat-cover-merge' }, h.context);
  const target = h.state().orders[1].id;
  const result = await mergeChecks(null, { orderId: target, sourceOrderId: 'source' }, h.context);
  assert.equal(result.success, true, result.error || '');
  assert.deepEqual(await Promise.all(h.state().orders.map((order: any) => physicalGuestsForOrder(h.tx(), order))), [0, 3, 0]);
  assert.equal(h.state().orders.find((order: any) => order.id === target).guestCount, 3);
  assert.equal(await physicalGuestsForOrder(h.tx(), { id: 'gift', orderSource: 'gift_card', guestCount: 1 }), 0);
});

import { transferPhysicalPartyOnCancellation } from '../features/keystone/utils/physicalParties';
test('cancelling the party owner transfers covers to surviving siblings and all-cancelled parties count zero', async () => {
  const h = harness(); await splitCheckBySeat(null, { orderId: 'source', idempotencyKey: 'seat-cancel-cover' }, h.context);
  const cancel = async (id: string) => {
    await h.context.prisma.$transaction(async (tx: any) => {
      const order = await tx.restaurantOrder.findUnique({ where: { id } });
      await transferPhysicalPartyOnCancellation(tx, order, 'staff');
      await tx.restaurantOrder.update({ where: { id }, data: { status: 'cancelled' } });
    }, { isolationLevel: 'Serializable' });
  };
  const totals = () => Promise.all(h.state().orders.map((order: any) => physicalGuestsForOrder(h.tx(), order)));
  await cancel('source'); assert.deepEqual(await totals(), [0, 3, 0]); assert.equal(h.state().orders[1].guestCount, 3);
  await cancel(h.state().orders[1].id); assert.deepEqual(await totals(), [0, 0, 3]); assert.equal(h.state().orders[2].guestCount, 3);
  await cancel(h.state().orders[2].id); assert.deepEqual(await totals(), [0, 0, 0]);
});
test('distinct-party merge preserves both party counts through a later split and reverse merge', async () => {
  const h = harness();
  const other = { ...structuredClone(h.state().orders[0]), id: 'other', orderNumber: 'DINE-2', guestCount: 2, orderItems: [], courses: [] };
  h.state().orders.push(other);
  h.state().events.push({ eventKey: 'pricing-policy:other', after: structuredClone(h.state().events[0].after) });
  const merged = await mergeChecks(null, { orderId: 'source', sourceOrderId: 'other' }, h.context);
  assert.equal(merged.success, true, merged.error || '');
  assert.equal(await physicalGuestsForOrder(h.tx(), h.state().orders[0]), 5);
  assert.equal(await physicalGuestsForOrder(h.tx(), h.state().orders[1]), 0);
  // Membership copying and re-merging a child of the same party are tested
  // through actual item splits on a check whose amounts still match its food.
  const same = harness(); await splitCheckBySeat(null, { orderId: 'source', idempotencyKey: 'seat-reverse-merge' }, same.context);
  assert.equal((await mergeChecks(null, { orderId: 'source', sourceOrderId: same.state().orders[1].id }, same.context)).success, true);
  assert.equal((await Promise.all(same.state().orders.map((order: any) => physicalGuestsForOrder(same.tx(), order)))).reduce((a, b) => a + b, 0), 3);
});
