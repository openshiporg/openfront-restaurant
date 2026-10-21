import test from 'node:test';
import assert from 'node:assert/strict';
import { transitionPurchaseOrder } from '../features/keystone/mutations/purchasing';
function fixture() {
  const po: any = { id: 'po', status: 'draft', vendorId: 'vendor', lineItems: [{ ingredientId: 'ingredient', quantity: 4, unit: 'kg', unitCost: 2 }] };
  const events: any[] = [], receipts = [{ id: 'receipt', ingredientId: 'ingredient', quantity: '1.00' }];
  let vendorExists = true, ingredientExists = true, stockWrites = 0;
  const tx: any = { storeSettings: { findUnique: async () => ({ currencyCode: 'USD' }) }, vendor: { findUnique: async () => vendorExists ? { id: 'vendor' } : null }, ingredient: { findUnique: async () => ingredientExists ? { id: 'ingredient', unit: 'kg' } : null, update: async () => { stockWrites++; } }, stockMovement: { findMany: async () => receipts, create: async () => { stockWrites++; } }, purchaseOrder: { findUnique: async () => po, update: async ({ data }: any) => { const old = { ...po }; Object.assign(po, data); return { ...old, ...data }; } }, auditEvent: { upsert: async ({ create }: any) => { events.push(create); return create; } } };
  const context: any = { session: { itemId: 'manager', data: { isActive: true, role: { canManageInventory: true } } }, prisma: { $transaction: async (fn: any, options: any) => { assert.equal(options.isolationLevel, 'Serializable'); return fn(tx); } } };
  return { context, po, events, receipts, missingVendor: () => { vendorExists = false; }, missingIngredient: () => { ingredientExists = false; }, stockWrites: () => stockWrites };
}
test('send rejects malformed receipt contracts while draft remains editable', async () => {
  for (const edit of [(f: any) => f.po.lineItems.push({ ...f.po.lineItems[0] }), (f: any) => f.missingIngredient(), (f: any) => f.missingVendor(), (f: any) => f.po.lineItems[0].unit = 'liters', (f: any) => f.po.lineItems[0].unitCost = -1, (f: any) => f.po.lineItems[0].unitCost = null, (f: any) => f.po.lineItems[0].quantity = 0, (f: any) => f.po.lineItems = []]) {
    const f = fixture(); edit(f);
    await assert.rejects(transitionPurchaseOrder(null, { id: 'po', status: 'sent' }, f.context));
    assert.equal(f.po.status, 'draft'); assert.equal(f.events.length, 0);
  }
});
test('valid send and retry retain one transition event; unauthorized call performs no operation', async () => {
  const f = fixture();
  await assert.rejects(transitionPurchaseOrder(null, { id: 'po', status: 'sent' }, {} as any), /authorized/);
  await transitionPurchaseOrder(null, { id: 'po', status: 'sent' }, f.context);
  await transitionPurchaseOrder(null, { id: 'po', status: 'sent' }, f.context);
  assert.equal(f.po.status, 'sent'); assert.equal(f.events.filter(event => event.eventType === 'purchase_order.transition').length, 1);
});
test('partial cancellation preserves receipt movements and stock, with auditable remainder semantics', async () => {
  const f = fixture(); f.po.status = 'partially_received';
  await transitionPurchaseOrder(null, { id: 'po', status: 'cancelled' }, f.context);
  assert.equal(f.po.status, 'cancelled'); assert.equal(f.stockWrites(), 0);
  assert.deepEqual(f.events[0].metadata.receivedMovements, f.receipts);
  assert.equal(f.events[0].metadata.cancelledRemainderOnly, true);
  await transitionPurchaseOrder(null, { id: 'po', status: 'cancelled' }, f.context); assert.equal(f.events.filter(event => event.eventType === 'purchase_order.transition').length, 1);
  await assert.rejects(transitionPurchaseOrder(null, { id: 'po', status: 'received' }, f.context), /receipt/);
});
