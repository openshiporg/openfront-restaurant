import test from 'node:test';
import assert from 'node:assert/strict';
import { receivePurchaseOrder, countIngredientStock } from '../features/keystone/mutations/purchasing';
const manager: any = { itemId: 'm', data: { isActive: true, role: { canManageInventory: true } } };
function setup() {
  const movements: any[] = [], events: any[] = [];
  const ingredient = { id: 'i', unit: 'kg', currentStock: '0.00' }, po = { id: 'po', status: 'sent', lineItems: [{ ingredientId: 'i', unit: 'kg', unitCost: 2, quantity: 10 }] };
  let fail = false;
  const tx: any = { storeSettings: { findUnique: async () => ({ currencyCode: 'USD' }) }, auditEvent: { findUnique: async ({ where }: any) => events.find(e => e.eventKey === where.eventKey), upsert: async ({ create }: any) => { events.push(create); return create; } }, purchaseOrder: { findUnique: async () => po, update: async ({ data }: any) => Object.assign(po, data) }, ingredient: { findUnique: async () => ingredient, update: async ({ data }: any) => { if (fail) throw new Error('persist failed'); return Object.assign(ingredient, data); } }, stockMovement: { findUnique: async ({ where }: any) => movements.find(m => m.eventKey === where.eventKey), findMany: async () => movements, create: async ({ data }: any) => { const row = { id: `movement-${movements.length}`, ...data }; movements.push(row); return row; } } };
  let chain = Promise.resolve();
  const ctx: any = { session: manager, prisma: { $transaction: (fn: any, options: any) => { assert.equal(options.isolationLevel, 'Serializable'); const work = chain.then(async () => { const backup = JSON.stringify({ movements, events, ingredient, po }); try { return await fn(tx); } catch(e) { const b = JSON.parse(backup); movements.splice(0, movements.length, ...b.movements); events.splice(0, events.length, ...b.events); Object.assign(ingredient, b.ingredient); Object.assign(po, b.po); throw e; } }); chain = work.catch(() => {}); return work; } } };
  return { ctx, ingredient, movements, events, po, setFail: (value: boolean) => { fail = value; } };
}
const receipt = (quantity: number, key = 'receipt-123') => ({ id: 'po', lines: [{ ingredientId: 'i', quantity }], reference: 'packing-1', idempotencyKey: key, currencyCode: 'USD' });
test('unauthorized receiving rejects without any database access', async () => {
  await assert.rejects(receivePurchaseOrder(null, receipt(2), {} as any), /authorized/);
});
test('partial, replay and final receipts post stock exactly once', async () => {
  const f = setup();
  await Promise.all([receivePurchaseOrder(null, receipt(4), f.ctx), receivePurchaseOrder(null, receipt(4), f.ctx)]);
  assert.equal(f.ingredient.currentStock, '4.00'); assert.equal(f.movements.length, 1); assert.equal(f.po.status, 'partially_received');
  await receivePurchaseOrder(null, receipt(6, 'receipt-456'), f.ctx); assert.equal(f.ingredient.currentStock, '10.00'); assert.equal(f.po.status, 'received');
  await assert.rejects(receivePurchaseOrder(null, receipt(4, 'receipt-extra'), f.ctx), /receivable/);
});
test('over-receipt, reused key, persistence failure leave durable balances unchanged', async () => {
  const f = setup();
  await assert.rejects(receivePurchaseOrder(null, receipt(11), f.ctx), /exceeds/);
  f.setFail(true); await assert.rejects(receivePurchaseOrder(null, receipt(4), f.ctx), /persist/); assert.equal(f.movements.length, 0);
  f.setFail(false); await receivePurchaseOrder(null, receipt(4), f.ctx);
  await assert.rejects(receivePurchaseOrder(null, receipt(5), f.ctx), /reused/); assert.equal(f.ingredient.currentStock, '4.00');
});
test('stock count detects stale balance and retries its own event safely', async () => {
  const f = setup(); const args = { ingredientId: 'i', counted: 2, expectedStock: 0, reason: 'count sheet', idempotencyKey: 'count-123' };
  await countIngredientStock(null, args, f.ctx); await countIngredientStock(null, args, f.ctx); assert.equal(f.movements.length, 1);
  await assert.rejects(countIngredientStock(null, { ...args, idempotencyKey: 'count-456' }, f.ctx), /Stock changed/);
});
import { stockQuantity, combineRecipeIngredients } from '../features/lib/stock-units';
test('recipe stock conversion aggregates repeated ingredients and rejects incompatible units', () => {
  assert.equal(stockQuantity(100, 'g', 'kg'), 0.1);
  assert.equal(stockQuantity(1, 'liter', 'ml'), 1000);
  assert.throws(() => stockQuantity(1, 'kg', 'liter'), /converted/);
  assert.throws(() => stockQuantity(-1, 'g', 'kg'), /positive/);
  assert.deepEqual(combineRecipeIngredients([{ ingredientId: 'i', quantity: 1, unit: 'g' }, { ingredientId: 'i', quantity: 2, unit: 'g' }]), [{ ingredientId: 'i', quantity: 3, unit: 'g' }]);
});
