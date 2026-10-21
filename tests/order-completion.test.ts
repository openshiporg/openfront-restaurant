import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizePaidOrderWithClient, reconcileCompletedOrderOperations } from '../features/keystone/utils/orderCompletion';
import { reconcileClosedOrderTables } from '../features/keystone/utils/tableOccupancy';

function fixture(status: string, payments: any[]) {
  const events = new Map();
  const order = { id: 'o', status, total: 1000, payments };
  const tx = { restaurantOrder: {
    findUnique: async () => order,
    update: async () => { throw new Error('Tender must never mutate service'); },
  }, auditEvent: { upsert: async ({ where, create }: any) => {
    if (!events.has(where.eventKey)) events.set(where.eventKey, create);
    return events.get(where.eventKey);
  } } };
  return { tx, order, events };
}
for (const status of ['open', 'sent_to_kitchen', 'in_progress', 'ready', 'served', 'completed']) {
  test(`full payment preserves ${status} service; retry is one financial event`, async () => {
    const { tx, order, events } = fixture(status, [{ status: 'succeeded', amount: 1000 }]);
    assert.equal(await finalizePaidOrderWithClient(tx, 'o', 'cashier'), true);
    await finalizePaidOrderWithClient(tx, 'o', 'cashier');
    assert.equal(order.status, status);
    assert.equal(events.size, 1);
    assert.equal([...events.values()][0].eventType, 'order.paid');
  });
}
test('partial, authorized and unknown tender cannot prove full payment', async () => {
  for (const payments of [[{ status: 'succeeded', amount: 999 }], [{ status: 'authorized', amount: 1000 }], [{ status: 'unknown', amount: 1000 }], [{ status: 'partially_refunded', amount: 1000, refundedAmount: 1 }]]) {
    const { tx, events } = fixture('open', payments);
    assert.equal(await finalizePaidOrderWithClient(tx, 'o', 'a'), false);
    assert.equal(events.size, 0);
  }
});
test('split net tenders settle money without advancing kitchen', async () => {
  const { tx } = fixture('in_progress', [{ status: 'partially_refunded', amount: 600, refundedAmount: 100 }, { status: 'succeeded', amount: 500 }]);
  assert.equal(await finalizePaidOrderWithClient(tx, 'o', 'a'), true);
});
test('cancelled order and audit persistence failure fail closed', async () => {
  const cancelled = fixture('cancelled', [{ status: 'succeeded', amount: 1000 }]);
  await assert.rejects(finalizePaidOrderWithClient(cancelled.tx, 'o', 'a'), /cancelled/);
  const f = fixture('open', [{ status: 'succeeded', amount: 1000 }]);
  f.tx.auditEvent.upsert = async () => { throw new Error('disk unavailable'); };
  await assert.rejects(finalizePaidOrderWithClient(f.tx, 'o', 'a'), /disk/);
  assert.equal(f.order.status, 'open');
});
test('paid but unfinished order does not invoke operational completion side effects', async () => {
  const ctx: any = { sudo: () => ({ query: { RestaurantOrder: { findOne: async () => ({ id: 'o', status: 'in_progress' }) } } }) };
  await reconcileCompletedOrderOperations('o', ctx);
});
test('table cleanup uses transactional current occupancy and preserves reservations', async () => {
  for (const [active, seated, expected] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    let writes = 0;
    const tx = { restaurantOrder: { findUnique: async () => ({ status: 'completed', tables: [{ id: 't' }] }), count: async () => active }, reservation: { count: async () => seated }, waitlistEntry: { count: async () => 0 }, table: { updateMany: async ({ where, data }: any) => { assert.equal(where.status, 'occupied'); assert.equal(data.status, 'cleaning'); writes++; } } };
    await reconcileClosedOrderTables('o', { prisma: { $transaction: async (fn: any, options: any) => { assert.equal(options.isolationLevel, 'Serializable'); return fn(tx); } } } as any);
    assert.equal(writes, expected);
  }
});
