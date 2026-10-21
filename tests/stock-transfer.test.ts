import test from 'node:test';
import assert from 'node:assert/strict';
import { transferRestaurantStock } from '../features/keystone/mutations/stockTransfer';
function fixture() {
  const items: any = { a: { id: 'a', sku: 'flour', unit: 'kg', currentStock: '2.00', location: { isActive: true } }, b: { id: 'b', sku: 'flour', unit: 'g', currentStock: '0.00', location: { isActive: true } } }, events: any[] = [], movements: any[] = [];
  let fail = false, chain = Promise.resolve();
  const tx: any = { ingredient: { findUnique: async ({ where }: any) => items[where.id], update: async ({ where, data }: any) => { if (where.id === 'b' && fail) throw new Error('persist failed'); return Object.assign(items[where.id], data); } }, stockMovement: { create: async ({ data }: any) => { const row = { id: `m-${movements.length}`, ...data }; movements.push(row); return row; } }, auditEvent: { findMany: async () => [], findUnique: async ({ where }: any) => events.find(e => e.eventKey === where.eventKey), upsert: async ({ create }: any) => { events.push(create); return create; } } };
  const context: any = { session: { itemId: 'm', data: { isActive: true, role: { canManageInventory: true } } }, prisma: { $transaction: (fn: any, options: any) => { assert.equal(options.isolationLevel, 'Serializable'); const result = chain.then(async () => { const before = JSON.stringify({ items, movements, events }); try { return await fn(tx); } catch (e) { const restored = JSON.parse(before); Object.assign(items, restored.items); movements.splice(0, movements.length, ...restored.movements); events.splice(0, events.length, ...restored.events); throw e; } }); chain = result.catch(() => {}); return result; } } };
  return { items, movements, events, context, fail: () => { fail = true; } };
}
const args = { fromId: 'a', toId: 'b', quantity: 1, reason: 'kitchen restock', idempotencyKey: 'transfer-123' };
test('stock transfer requires authority, SKU match and available compatible units', async () => {
  await assert.rejects(transferRestaurantStock(null, args, {} as any), /authorized/);
  const f = fixture(); f.items.b.sku = 'sugar'; await assert.rejects(transferRestaurantStock(null, args, f.context), /SKU/);
  f.items.b.sku = 'flour'; await assert.rejects(transferRestaurantStock(null, { ...args, quantity: 3 }, f.context), /Insufficient/);
  f.items.b.unit = 'liter'; await assert.rejects(transferRestaurantStock(null, args, f.context), /converted/);
});
test('paired conversion survives concurrent duplicate/retry and rolls back destination failure', async () => {
  const f = fixture(); await Promise.all([transferRestaurantStock(null, args, f.context), transferRestaurantStock(null, args, f.context)]);
  assert.equal(f.items.a.currentStock, '1.00'); assert.equal(f.items.b.currentStock, '1000.00'); assert.equal(f.movements.length, 2);
  await assert.rejects(transferRestaurantStock(null, { ...args, quantity: 0.5 }, f.context), /reused/);
  const bad = fixture(); bad.fail(); await assert.rejects(transferRestaurantStock(null, args, bad.context), /persist/); assert.equal(bad.items.a.currentStock, '2.00'); assert.equal(bad.movements.length, 0);
});
