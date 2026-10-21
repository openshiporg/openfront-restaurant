import test from 'node:test';
import assert from 'node:assert/strict';
import { businessDate, money, tenderTotals, toCsv } from '../features/lib/financial-ledger';
import { calculateMenuItemPerformance, calculatePaymentMethodBreakdown, orderNetCollected } from '../features/platform/reports/lib/reportHelpers';
import { closeRestaurantBusinessDay, recordRestaurantCashMovement, restaurantBusinessDays } from '../features/keystone/mutations/businessDay';

test('tenders retain partially/full refunded gross and separate period refunds', () => {
  const result = tenderTotals([{ id: 'p', amount: 1000, status: 'partially_refunded', paymentMethod: 'cash', tipAmount: 100 }], [{ amount: 200, status: 'succeeded', payment: { paymentMethod: 'cash' } }, { amount: 50, status: 'unknown', payment: { paymentMethod: 'cash' } }]);
  assert.deepEqual(result.cash, { gross: 1000, refunds: 200, net: 800, tips: 100 });
  assert.equal(tenderTotals([], [{ amount: 200, status: 'succeeded', payment: { paymentMethod: 'cash' } }]).cash.net, -200);
});
test('venue cutoff handles overnight and DST independently of process timezone', () => {
  assert.equal(businessDate(new Date('2026-03-08T07:30:00Z'), 'America/New_York', 240), '2026-03-07');
  assert.equal(businessDate(new Date('2026-03-08T08:00:00Z'), 'America/New_York', 240), '2026-03-08');
  assert.throws(() => businessDate(new Date(), 'America/New_York', 1440));
  for (const v of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => money(v));
});
test('CSV preserves quotes/newlines and neutralizes formula strings', () => {
  assert.equal(toCsv([['=1+2', 'a"b', 'line\n2', -2]]), '"\'=1+2","a""b","line\n2","-2"');
});
test('reports preserve void/comp and refund effects', () => {
  const p: any = { amount: '1000', status: 'partially_refunded', refundedAmount: 200, paymentMethod: 'cash' };
  assert.equal(calculatePaymentMethodBreakdown([p]).cash.total, 800);
  assert.equal(orderNetCollected({ payments: [p] } as any), 800);
  const rows = calculateMenuItemPerformance([{ menuItem: { id: 'm', name: 'New name' }, itemNameSnapshot: 'Original', price: 1000, quantity: 1, adjustmentTotal: 300 }, { menuItem: { id: 'm' }, price: 1000, quantity: 1, isVoided: true }]);
  assert.equal(rows[0].revenue, 700); assert.equal(rows[0].name, 'Original'); assert.equal(rows[0].quantitySold, 1);
});
const manager: any = { itemId: 'm', data: { isActive: true, role: { canManagePayments: true } } };
function context(events: any[], pending = 0) {
  const tx = { auditEvent: { findMany: async () => events, findUnique: async ({ where }: any) => events.find(e => e.eventKey === where.eventKey), upsert: async ({ create }: any) => { events.push(create); return create; } }, payment: { count: async () => pending, findMany: async () => [{ id: 'p', amount: 1000, tipAmount: 0, currencyCode: 'USD', status: 'succeeded', paymentMethod: 'cash' }] }, refund: { count: async () => 0, findMany: async () => [] } };
  return { session: manager, prisma: { $transaction: async (fn: any, options: any) => { assert.equal(options.isolationLevel, 'Serializable'); return fn(tx); } } } as any;
}
const opened = () => ({ entityId: 'day', eventType: 'business_day.opened', after: { startAt: '2026-09-05T00:00:00Z', currencyCode: 'USD', timezone: 'UTC', openingFloat: 100 } });
test('anonymous read and write reject before privileged access', async () => {
  await assert.rejects(restaurantBusinessDays(null, null, {} as any), /authorized/);
  await assert.rejects(closeRestaurantBusinessDay(null, { id: 'day', countedCash: 0, reason: '' }, {} as any), /authorized/);
});
test('close rejects unresolved money, unexplained variance; repeat is immutable', async () => {
  const args = { id: 'day', countedCash: 1100, reason: '' };
  await assert.rejects(closeRestaurantBusinessDay(null, args, context([opened()], 1)), /pending/);
  await assert.rejects(closeRestaurantBusinessDay(null, { ...args, countedCash: 1000 }, context([opened()])), /variance/);
  const events = [opened()]; const ctx = context(events);
  const result = await closeRestaurantBusinessDay(null, args, ctx); assert.equal(result.variance, 0);
  assert.deepEqual(await closeRestaurantBusinessDay(null, args, ctx), result);
  await assert.rejects(closeRestaurantBusinessDay(null, { ...args, countedCash: 1099 }, ctx), /immutable/);
  await assert.rejects(recordRestaurantCashMovement(null, { id: 'day', amount: 1, direction: 'in', reason: 'adjust', idempotencyKey: 'request-123' }, ctx), /open business day/);
});
import { businessDayStart } from '../features/lib/financial-ledger';
test('first close includes earlier same-day tenders and cutoff resolves DST gaps', () => {
  assert.equal(businessDayStart('2026-09-05', 'America/New_York', 0).toISOString(), '2026-09-05T04:00:00.000Z');
  assert.equal(businessDayStart('2026-03-08', 'America/New_York', 150).toISOString(), '2026-03-08T07:00:00.000Z');
});
