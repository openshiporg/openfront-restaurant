import test from 'node:test';
import assert from 'node:assert/strict';
import { depleteInventoryForCompletedOrder } from '../features/keystone/utils/inventoryLedger';
import { restaurantBusinessDay } from '../features/keystone/mutations/businessDay';
function fixture() {
  const order: any = { id: 'o', orderNumber: '1', status: 'completed', orderItems: [{ id: 'i', quantity: 2 }] };
  const events: any[] = [];
  const stock: any = { id: 'ing', unit: 'g', currentStock: '100.00' }, movements: any[] = [];
  let snapshot: any = { after: { recipeId: 'r', recipeYield: 1, ingredients: [{ ingredientId: 'ing', unit: 'g', quantity: 10 }] } };
  const tx: any = { restaurantOrder: { findUnique: async () => order }, auditEvent: { findMany: async () => [], findUnique: async ({ where }: any) => where.eventKey.startsWith('recipe-snapshot:') ? snapshot : events.find(e => e.eventKey === where.eventKey), upsert: async ({ create }: any) => { events.push(create); return create; } }, stockMovement: { findMany: async () => movements, findUnique: async ({ where }: any) => movements.find(m => m.eventKey === where.eventKey), create: async ({ data }: any) => { const row = { id: `m-${movements.length}`, ...data }; movements.push(row); return row; } }, ingredient: { findUnique: async () => stock, update: async ({ data }: any) => Object.assign(stock, data) } };
  const context: any = { prisma: { $transaction: async (fn: any, options: any) => { assert.equal(options.isolationLevel, 'Serializable'); return fn(tx); } } };
  return { context, order, movements, stock, missingSnapshot: () => { snapshot = null; } };
}
test('frozen recipes deplete once across check moves and legacy event keys never repost', async () => {
  const f = fixture(); await depleteInventoryForCompletedOrder('o', f.context); f.order.id = 'moved'; await depleteInventoryForCompletedOrder('moved', f.context);
  assert.equal(f.stock.currentStock, '80.00'); assert.equal(f.movements.length, 1);
  const old = fixture(); old.movements.push({ eventKey: 'sale:old-order:i:ing' }); old.missingSnapshot(); await depleteInventoryForCompletedOrder('o', old.context); assert.equal(old.stock.currentStock, '100.00');
});
test('unprepared cancellations consume nothing, prepared cancellation records loss, missing history rejects', async () => {
  const f = fixture(); f.order.status = 'cancelled'; await depleteInventoryForCompletedOrder('o', f.context); assert.equal(f.movements.length, 0);
  f.order.orderItems[0].kitchenStartedAt = new Date(); await depleteInventoryForCompletedOrder('o', f.context); assert.equal(f.movements[0].type, 'waste');
  const missing = fixture(); missing.missingSnapshot(); await assert.rejects(depleteInventoryForCompletedOrder('o', missing.context), /Missing production/);
});
test('business close carries late committed postings forward without recounting assigned IDs', async () => {
  const oldOpen = { entityId: 'old', eventType: 'business_day.opened', after: { startAt: '2026-09-01T00:00:00Z' } };
  const oldClose = { entityId: 'old', eventType: 'business_day.closed', after: { paymentIds: ['assigned'], refundIds: ['old-refund'] } };
  const current = { entityId: 'current', eventType: 'business_day.opened', after: { startAt: '2026-09-02T00:00:00Z', currencyCode: 'USD', openingFloat: 0 } };
  const events = [oldOpen, oldClose, current];
  const payment = (id: string) => ({ id, processedAt: new Date('2026-09-01T23:59:00Z'), status: 'succeeded', amount: 100, currencyCode: 'USD', paymentMethod: 'cash', tipAmount: 0 });
  const tx: any = { auditEvent: { findMany: async ({ where }: any) => where.entityId ? events.filter(e => e.entityId === where.entityId) : events }, payment: { findMany: async ({ where }: any) => { assert.equal(where.processedAt.gte.toISOString(), '2026-09-01T00:00:00.000Z'); return [payment('assigned'), payment('late')]; } }, refund: { findMany: async () => [] } };
  const context: any = { session: { itemId: 'm', data: { isActive: true, role: { canManagePayments: true } } }, prisma: { $transaction: (fn: any) => fn(tx) } };
  const result = await restaurantBusinessDay(null, { id: 'current' }, context);
  assert.deepEqual(result.summary.paymentIds, ['late']); assert.deepEqual(result.summary.carriedPaymentIds, ['late']); assert.equal(result.summary.expectedCash, 100);
});
import { restaurantOperationsRecovery } from '../features/keystone/mutations/operationsRecovery';
test('older unresolved recovery remains visible after more than 1000 later successes', async () => {
  const recent = Array.from({ length: 1000 }, (_, i) => ({ id: `id-${i}`, entityId: `order-${i}`, eventType: 'operations.reconciled', after: { operation: 'inventory' } }));
  const old = { id: 'old', entityId: 'needs-review', eventType: 'operations.recovery_required', after: { operation: 'inventory', error: 'Missing snapshot' } };
  let pages = 0;
  const context: any = { session: { itemId: 'm', data: { isActive: true, role: { canManageInventory: true } } }, prisma: { auditEvent: { findMany: async ({ cursor, orderBy }: any) => { pages++; assert.deepEqual(orderBy, [{ occurredAt: 'desc' }, { id: 'desc' }]); return cursor ? [old] : recent; } } } };
  const result = await restaurantOperationsRecovery(null, null, context); assert.equal(pages, 2); assert.equal(result[0].orderId, 'needs-review');
});
