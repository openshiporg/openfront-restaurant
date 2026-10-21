import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSalesMetrics, generateTimeSeriesData, operationalDaySummary, venueTodayRange } from '../features/platform/reports/lib/reportHelpers';
const order = (id: string, guests: number, physicalGuestCount: number, amount: number): any => ({ id, orderNumber: id, orderType: 'dine_in', orderSource: 'pos', status: 'completed', guestCount: guests, physicalGuestCount, subtotal: amount, tax: 0, tip: 0, discount: 0, total: amount, createdAt: '2026-09-05T12:00:00Z', payments: [{ amount, status: 'succeeded', refundedAmount: 0 }] });
test('sales totals and chart covers exclude financial children while collecting all independent payments', () => {
  const rows = [order('source', 5, 5, 34), order('child-a', 1, 0, 33), order('child-b', 1, 0, 33)];
  const metrics = calculateSalesMetrics(rows, rows);
  assert.equal(metrics.totalGuests, 5); assert.equal(metrics.previousGuests, 5); assert.equal(metrics.totalRevenue, 100);
  const buckets = generateTimeSeriesData(rows, '2026-09-05T00:00:00Z', '2026-09-06T00:00:00Z');
  assert.equal(buckets.reduce((sum, bucket) => sum + bucket.guests, 0), 5);
});
test('operational day collections include today refunds against older payments and exclude gift liabilities', () => {
  const rows = [order('source', 5, 5, 34), order('child', 1, 0, 33), { ...order('gift', 1, 1, 500), orderSource: 'gift_card' }];
  const payments = [{ amount: 100, status: 'partially_refunded', order: { orderSource: 'pos' } }, { amount: 500, status: 'succeeded', order: { orderSource: 'gift_card' } }];
  const refunds = [{ amount: 20, status: 'succeeded', payment: { order: { orderSource: 'pos' } } }, { amount: 50, status: 'succeeded', payment: { order: { orderSource: 'online' } } }, { amount: 500, status: 'succeeded', payment: { order: { orderSource: 'gift_card' } } }];
  const result = operationalDaySummary(rows, payments, refunds);
  assert.deepEqual(result, { netCollections: 30, completedChecks: 2, covers: 5, dineInChecksWithGuests: 1 });
  assert.equal(operationalDaySummary([], [], refunds).netCollections, -70);
});
test('today boundaries follow restaurant timezone and daylight saving, never the previous seven days', () => {
  assert.deepEqual(venueTodayRange('America/New_York', new Date('2026-09-06T02:00:00Z')), { startDate: '2026-09-05T04:00:00.000Z', endDate: '2026-09-06T03:59:59.999Z' });
  const spring = venueTodayRange('America/New_York', new Date('2026-03-08T16:00:00Z'));
  assert.equal(Date.parse(spring.endDate) - Date.parse(spring.startDate) + 1, 23 * 3600000);
});

import { recordedOrderVoidCount } from '../features/platform/reports/lib/reportHelpers';
test('normal split/merge cancellations and item voids cannot become whole-order void statistics', () => {
  assert.equal(recordedOrderVoidCount([
    { order: { id: 'merge-source' }, metadata: { sourceOrderId: 'old' } },
    { order: { id: 'equal-child' }, metadata: { kind: 'equal_member' } },
    { order: { id: 'item-correction' }, metadata: { wholeOrder: false } },
    { order: { id: 'actual-void' }, metadata: { wholeOrder: true } },
    { order: { id: 'actual-void' }, metadata: { wholeOrder: true } },
  ]), 1);
});
