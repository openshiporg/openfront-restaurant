import test from 'node:test';
import assert from 'node:assert/strict';
import { receivePurchaseOrder, countIngredientStock } from '../features/keystone/mutations/purchasing';
import { recordRestaurantPurchaseInvoice, recordRestaurantPurchaseCredit, restaurantPurchaseEvidence, restaurantIngredientLots, setRestaurantLotHold } from '../features/keystone/mutations/purchaseEvidence';
import { readStockLots, validateReceiptLot } from '../features/keystone/utils/inventoryLots';
import { transferRestaurantStock } from '../features/keystone/mutations/stockTransfer';
import { depleteInventoryForCompletedOrder } from '../features/keystone/utils/inventoryLedger';
import { recordWaste, reverseWaste } from '../features/keystone/mutations/wasteManagement';
function harness() {
  let state: any = { auditEvent: [], stockMovement: [], wasteLog: [], idempotencyKey: [], restaurantOrder: [], purchaseOrder: [{ id: 'po', vendorId: 'vendor', vendor: { id: 'vendor', name: 'Supplier' }, status: 'sent', lineItems: [{ ingredientId: 'source', quantity: 10, unit: 'kg', unitCost: 2 }] }], ingredient: [{ id: 'source', name: 'Flour', sku: 'flour', unit: 'kg', currentStock: '0.00', locationId: 'l1', location: { isActive: true } }, { id: 'target', name: 'Flour kitchen', sku: 'flour', unit: 'g', currentStock: '0.00', locationId: 'l2', location: { isActive: true } }] };
  let sequence = 0, conflict = false, failEvent = '', queue = Promise.resolve();
  const match = (row: any, where: any): boolean => Object.entries(where || {}).every(([key, value]: any) => {
    if (key === 'OR') return value.some((part: any) => match(row, part));
    if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([op, expected]: any) => op === 'in' ? expected.includes(row[key]) : op === 'not' ? row[key] !== expected : op === 'gte' ? row[key] >= expected : op === 'lt' ? row[key] < expected : op === 'lte' ? row[key] <= expected : op === 'gt' ? row[key] > expected : true);
    return row[key] === value;
  });
  const clone = (value: any) => value == null ? value : structuredClone(value);
  const prisma: any = { storeSettings: { findUnique: async () => ({ currencyCode: 'USD' }) } };
  for (const model of Object.keys(state)) prisma[model] = {
    findUnique: async ({ where }: any) => clone(state[model].find((row: any) => match(row, where))),
    findMany: async ({ where, take = 10000 }: any) => clone(state[model].filter((row: any) => match(row, where)).slice(0, take)),
    create: async ({ data }: any) => { const row = { id: `${model}-${++sequence}`, createdAt: new Date(), ...clone(data) }; state[model].push(row); return clone(row); },
    update: async ({ where, data }: any) => { const row = state[model].find((row: any) => match(row, where)); if (!row) throw Error('missing mock row'); Object.assign(row, clone(data)); return clone(row); },
    upsert: async ({ where, create }: any) => { if (create.eventType === failEvent) throw Error('Injected write failure'); const prior = state[model].find((row: any) => match(row, where)); if (prior) return clone(prior); return prisma[model].create({ data: create }); },
  };
  prisma.$transaction = (callback: any, options: any) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const run = queue.then(async () => { if (conflict) { conflict = false; throw Object.assign(Error('serialization'), { code: 'P2034' }); } const before = clone(state); try { return await callback(prisma); } catch (error) { state = before; throw error; } });
    queue = run.catch(() => {}); return run;
  };
  const context: any = { prisma, session: { itemId: 'manager', data: { isActive: true, role: { canManageInventory: true, canReadInventory: true } } } };
  return { context, prisma, state: () => state, fail: (name: string) => { failEvent = name; }, conflict: () => { conflict = true; } };
}
async function receive(h: ReturnType<typeof harness>, q = 4, key = 'receipt-one', lot = 'LOT-A', expiryDate = '2098-01-01') {
  await receivePurchaseOrder(null, { id: 'po', reference: key, idempotencyKey: key, currencyCode: 'USD', lines: [{ ingredientId: 'source', quantity: q, lotCode: lot, expiryDate }] }, h.context);
  return h.state().stockMovement.find((row: any) => row.eventKey === `purchase-receipt:${key}:source`);
}
const invoice = (receiptId: string, extra = {}) => ({ id: 'po', reference: 'INV-1', currencyCode: 'USD', idempotencyKey: 'invoice-one', lines: [{ receiptId, quantity: 4, unitCostMinor: 200 }], ...extra });

test('receipt lots bind actual partial quantities, reject invalid expiry and preserve original on retry', async () => {
  const h = harness(); const first = await receive(h); await receive(h);
  assert.equal(h.state().ingredient[0].currentStock, '4.00'); assert.equal(h.state().stockMovement.length, 1);
  assert.equal((await readStockLots(h.prisma, 'source')).lots[0].quantity, 4);
  assert.equal((await readStockLots(h.prisma, 'source')).lots[0].rootReceiptId, first.id);
  await receive(h, 6, 'receipt-two', 'LOT-B'); assert.equal(h.state().purchaseOrder[0].status, 'received');
  assert.throws(() => validateReceiptLot({ lotCode: 'LOT', expiryDate: '2026-02-30' }), /expiry/);
  assert.throws(() => validateReceiptLot({ expiryDate: '2027-01-01' }), /lot code/);
});
test('invoice rejects unauthorized, foreign receipt, overquantity, wrong currency and unexplained cost variance', async () => {
  const h = harness(); const receipt = await receive(h);
  await assert.rejects(recordRestaurantPurchaseInvoice(null, invoice(receipt.id), { ...h.context, session: undefined }), /permission/);
  for (const args of [invoice('foreign'), invoice(receipt.id, { lines: [{ receiptId: receipt.id, quantity: 5, unitCostMinor: 200 }] }), invoice(receipt.id, { currencyCode: 'EUR' }), invoice(receipt.id, { lines: [{ receiptId: receipt.id, quantity: 4, unitCostMinor: 201 }] })]) await assert.rejects(recordRestaurantPurchaseInvoice(null, args, h.context));
  assert.equal(h.state().auditEvent.filter((e: any) => e.eventType === 'purchase.invoice_matched').length, 0);
});
test('partial invoice match, uncertain retry and concurrent overlapping matches conserve received units', async () => {
  const h = harness(); const receipt = await receive(h); h.conflict();
  const args = invoice(receipt.id, { lines: [{ receiptId: receipt.id, quantity: 2, unitCostMinor: 200 }] });
  const first = await recordRestaurantPurchaseInvoice(null, args, h.context); assert.deepEqual(await recordRestaurantPurchaseInvoice(null, args, h.context), first);
  const results = await Promise.allSettled(['A', 'B'].map(suffix => recordRestaurantPurchaseInvoice(null, { ...args, reference: `INV-${suffix}`, idempotencyKey: `invoice-${suffix}-request` }, h.context)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const evidence = await restaurantPurchaseEvidence(null, { id: 'po' }, h.context);
  assert.equal(evidence.receipts[0].unbilledQuantity, 0); assert.equal(evidence.events.filter((e: any) => e.eventType === 'purchase.invoice_matched').length, 2);
});
test('invoice write failure rolls back matching and corrected invoice requires proportional credit evidence', async () => {
  const h = harness(); const receipt = await receive(h); h.fail('purchase.invoice_matched');
  await assert.rejects(recordRestaurantPurchaseInvoice(null, invoice(receipt.id), h.context), /Injected/);
  assert.equal((await restaurantPurchaseEvidence(null, { id: 'po' }, h.context)).receipts[0].unbilledQuantity, 4);
  h.fail(''); const original = await recordRestaurantPurchaseInvoice(null, invoice(receipt.id), h.context);
  const credit = { id: 'po', invoiceId: original.eventId, reference: 'CR-1', reason: 'Corrected supplier unit price', idempotencyKey: 'credit-one', lines: [{ invoiceLineIndex: 0, quantity: 4, amountMinor: 1 }] };
  await assert.rejects(recordRestaurantPurchaseCredit(null, credit, h.context), /proportionally/);
  credit.lines[0].amountMinor = 800; await recordRestaurantPurchaseCredit(null, credit, h.context); await recordRestaurantPurchaseCredit(null, credit, h.context);
  const corrected = await recordRestaurantPurchaseInvoice(null, invoice(receipt.id, { reference: 'INV-CORRECTED', idempotencyKey: 'invoice-corrected', varianceReason: 'Supplier corrected agreed price', lines: [{ receiptId: receipt.id, quantity: 4, unitCostMinor: 210 }] }), h.context);
  assert.equal(corrected.totalMinor, 840); assert.equal(corrected.varianceMinor, 40); assert.equal(h.state().ingredient[0].currentStock, '4.00');
  await assert.rejects(recordRestaurantPurchaseCredit(null, { ...credit, reference: 'CR-2', idempotencyKey: 'credit-two' }, h.context), /exceeds/);
});
test('actual transfer preserves original lot, FEFO waste/reversal restores exact allocations and hold reaches destination', async () => {
  const h = harness(); const receipt = await receive(h);
  const transfer = { fromId: 'source', toId: 'target', quantity: 2, reason: 'Kitchen replenishment', idempotencyKey: 'transfer-one' };
  await transferRestaurantStock(null, transfer, h.context); await transferRestaurantStock(null, transfer, h.context);
  let target = await restaurantIngredientLots(null, { ingredientId: 'target' }, h.context);
  assert.equal(target.lots[0].quantity, 2000); assert.equal(target.lots[0].rootReceiptId, receipt.id);
  const waste = await recordWaste(null, { ingredientId: 'target', quantity: '500', reason: 'Spill', idempotencyKey: 'waste-one' }, h.context);
  assert.equal(waste.success, true); target = await restaurantIngredientLots(null, { ingredientId: 'target' }, h.context); assert.equal(target.lots[0].remainingQuantity, 1500);
  const reversal = { wasteLogId: waste.wasteLogId!, reason: 'Duplicate spill recording corrected', idempotencyKey: 'waste-reverse-one' };
  assert.equal((await reverseWaste(null, reversal, h.context)).success, true); assert.equal((await reverseWaste(null, reversal, h.context)).success, true);
  target = await restaurantIngredientLots(null, { ingredientId: 'target' }, h.context); assert.equal(target.lots[0].remainingQuantity, 2000);
  await setRestaurantLotHold(null, { receiptId: receipt.id, onHold: true, reason: 'Supplier recall notice 20', idempotencyKey: 'hold-one' }, h.context);
  assert.equal((await restaurantIngredientLots(null, { ingredientId: 'target' }, h.context)).lots[0].onHold, true);
});
test('production depletion uses eligible actual received lots; expired/held stock fails atomically but waste remains possible', async () => {
  const h = harness(); const receipt = await receive(h, 4, 'expired-receipt', 'EXPIRED', '2001-01-01');
  h.state().restaurantOrder.push({ id: 'order', orderNumber: '1', status: 'completed', orderItems: [{ id: 'item', quantity: 1, kitchenStartedAt: new Date() }] });
  h.state().auditEvent.push({ eventKey: 'recipe-snapshot:item', after: { recipeId: 'recipe', recipeYield: 1, ingredients: [{ ingredientId: 'source', unit: 'kg', quantity: 1 }] } });
  await assert.rejects(depleteInventoryForCompletedOrder('order', h.context), /Expired, held/);
  assert.equal(h.state().stockMovement.length, 1); assert.equal(h.state().ingredient[0].currentStock, '4.00');
  const result = await recordWaste(null, { ingredientId: 'source', quantity: '1', reason: 'Expired supplier lot', idempotencyKey: 'expired-waste' }, h.context); assert.equal(result.success, true);
  assert.equal((await readStockLots(h.prisma, 'source')).lots[0].remainingQuantity, 3);
  const fresh = harness(); await receive(fresh); fresh.state().restaurantOrder.push({ id: 'order', orderNumber: '1', status: 'completed', orderItems: [{ id: 'item', quantity: 1, kitchenStartedAt: new Date() }] }); fresh.state().auditEvent.push({ eventKey: 'recipe-snapshot:item', after: { recipeId: 'recipe', recipeYield: 1, ingredients: [{ ingredientId: 'source', unit: 'kg', quantity: 1 }] } });
  await depleteInventoryForCompletedOrder('order', fresh.context); await depleteInventoryForCompletedOrder('order', fresh.context); assert.equal((await readStockLots(fresh.prisma, 'source')).lots[0].remainingQuantity, 3);
});
test('negative counts consume tracked lots, positive counts remain untracked and failed lot write rolls back stock', async () => {
  const h = harness(); await receive(h);
  await countIngredientStock(null, { ingredientId: 'source', counted: 3, expectedStock: 4, reason: 'Count sheet', idempotencyKey: 'count-negative' }, h.context);
  await countIngredientStock(null, { ingredientId: 'source', counted: 5, expectedStock: 3, reason: 'Count correction', idempotencyKey: 'count-positive' }, h.context);
  let lots = await restaurantIngredientLots(null, { ingredientId: 'source' }, h.context); assert.equal(lots.lots[0].remainingQuantity, 3); assert.equal(lots.untrackedQuantity, 2);
  h.fail('inventory.lot_allocated');
  const result = await recordWaste(null, { ingredientId: 'source', quantity: '1', reason: 'Spill', idempotencyKey: 'failed-waste' }, h.context);
  assert.equal(result.success, false); lots = await restaurantIngredientLots(null, { ingredientId: 'source' }, h.context); assert.equal(lots.lots[0].remainingQuantity, 3); assert.equal(lots.ingredient.currentStock, '5.00');
});

import { purchaseLineAmount } from '../features/keystone/mutations/purchaseEvidence';
import { Ingredient } from '../features/keystone/models/Ingredient';
import { graphql } from '@keystone-6/core';
test('fractional unit prices round after quantity multiplication and stock denomination cannot race first receipt', () => {
  assert.equal(purchaseLineAmount(100000, '0.001', 'USD'), 100);
  assert.equal(purchaseLineAmount(100, '1.005', 'USD'), 101);
  assert.equal(purchaseLineAmount(100, '0.125', 'KWD'), 125);
  const field = (Ingredient.fields.unit as any)({ fieldKey: 'unit', listKey: 'Ingredient', lists: {}, provider: 'postgresql' });
  assert.equal(field.access.update({ session: { data: { role: { canManageInventory: true } } } }), false);
  assert.equal((Ingredient.access as any).operation.delete({ session: { data: { role: { canManageInventory: true } } } }), false);
  const inverse = (Ingredient.fields.stockMovements as any)({ fieldKey: 'stockMovements', listKey: 'Ingredient', lists: { StockMovement: { types: { relateTo: { many: { where: graphql.String, create: graphql.String, update: graphql.String } }, findManyArgs: {}, output: graphql.String, where: graphql.String } } }, provider: 'postgresql' });
  assert.equal(inverse.access.update({}), false);
});
test('production reconciliation cannot assign later received lots to earlier preparation', async () => {
  const h = harness(); await receive(h);
  h.state().restaurantOrder.push({ id: 'order', orderNumber: '1', status: 'completed', orderItems: [{ id: 'item', quantity: 1, kitchenStartedAt: new Date('2000-01-01') }] });
  h.state().auditEvent.push({ eventKey: 'recipe-snapshot:item', after: { recipeId: 'recipe', recipeYield: 1, ingredients: [{ ingredientId: 'source', unit: 'kg', quantity: 1 }] } });
  await assert.rejects(depleteInventoryForCompletedOrder('order', h.context), /later-received/);
  assert.equal(h.state().stockMovement.length, 1);
});
