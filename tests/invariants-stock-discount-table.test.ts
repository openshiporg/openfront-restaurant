import test from 'node:test';
import assert from 'node:assert/strict';
import { recordWaste, adjustInventory, stockShortMessage } from '../features/keystone/mutations/wasteManagement';
import { Discount } from '../features/keystone/models/Discount';
import { DiscountRule } from '../features/keystone/models/DiscountRule';
import { Table } from '../features/keystone/models/Table';

const manager = { itemId: 'u', data: { isActive: true, role: { canManageInventory: true } } };

function inventory(currentStock: string) {
  const stock: any = { id: 'ing', name: 'Brioche buns', unit: 'ea', currentStock };
  const writes: string[] = [];
  const tx: any = {
    wasteLog: { findUnique: async () => null, create: async ({ data }: any) => { writes.push('waste'); return { id: 'w', ...data }; } },
    stockMovement: { findUnique: async () => null, findMany: async () => [], create: async ({ data }: any) => { writes.push('movement'); return { id: 'm', ...data }; } },
    ingredient: { findUnique: async () => stock, update: async ({ data }: any) => { writes.push('stock'); return Object.assign(stock, data); } },
    auditEvent: { findUnique: async () => null, findMany: async () => [], upsert: async ({ create }: any) => create, create: async ({ data }: any) => data },
  };
  const prisma: any = {
    ...tx,
    idempotencyKey: { findUnique: async () => null, create: async ({ data }: any) => ({ id: 'a', ...data }), update: async ({ data }: any) => data, upsert: async ({ create }: any) => ({ id: 'a', ...create }) },
    $transaction: async (fn: any) => fn(tx),
  };
  return { stock, writes, context: { session: manager, prisma, sudo() { return this; } } as any };
}

test('waste cannot write off more than is on hand, and nothing is written', async () => {
  const f = inventory('6.00');
  const result = await recordWaste(null, { ingredientId: 'ing', quantity: '10', reason: 'expired', idempotencyKey: 'waste-key-1' }, f.context);
  assert.equal(result.success, false);
  assert.match(String(result.error), /Only 6 ea of Brioche buns is on hand, so 10 ea can't be written off/);
  assert.deepEqual(f.writes, []);
  assert.equal(f.stock.currentStock, '6.00');
});

test('waste within stock still posts and takes stock down', async () => {
  const f = inventory('6.00');
  const result = await recordWaste(null, { ingredientId: 'ing', quantity: '4', reason: 'expired', idempotencyKey: 'waste-key-2' }, f.context);
  assert.equal(result.success, true, String(result.error));
  assert.equal(f.stock.currentStock, '2.00');
});

test('manual adjustment cannot take stock below zero, additions still work', async () => {
  const f = inventory('3.00');
  const refused = await adjustInventory(null, { ingredientId: 'ing', quantity: '-5', reason: 'Dropped tray', idempotencyKey: 'adjust-key-1' }, f.context);
  assert.equal(refused.success, false);
  assert.match(String(refused.error), /stock can't go down by 5 ea/);
  assert.deepEqual(f.writes, []);
  const added = await adjustInventory(null, { ingredientId: 'ing', quantity: '2', reason: 'Found case', idempotencyKey: 'adjust-key-2' }, f.context);
  assert.equal(added.success, true, String(added.error));
  assert.equal(f.stock.currentStock, '5.00');
});

test('adding stock to an ingredient that is already below zero is allowed', async () => {
  const f = inventory('-300.00');
  const added = await adjustInventory(null, { ingredientId: 'ing', quantity: '2', reason: 'Found case', idempotencyKey: 'adjust-key-3' }, f.context);
  assert.equal(added.success, true, String(added.error));
  assert.equal(f.stock.currentStock, '-298.00');
});

test('shortage message for an empty ingredient', () => {
  assert.match(stockShortMessage({ name: 'Maggi', unit: 'g', currentStock: '0.00' }, 300, 'waste'), /^Maggi has none on hand, so 300 g can't be written off/);
});

function validate(list: any, resolvedData: any, item?: any, context?: any) {
  const errors: string[] = [];
  const result = list.hooks.validateInput({ resolvedData, item, context, addValidationError: (m: string) => errors.push(m), operation: item ? 'update' : 'create' });
  return Promise.resolve(result).then(() => errors);
}

test('discount dates and usage bounds', async () => {
  assert.deepEqual(await validate(Discount, { startsAt: new Date('2026-11-10'), endsAt: new Date('2026-11-01') }), ['A discount has to end after it starts.']);
  assert.deepEqual(await validate(Discount, { endsAt: new Date('2026-12-01') }, { startsAt: new Date('2026-11-01'), usageCount: 0 }), []);
  assert.match((await validate(Discount, { usageLimit: 2 }, { startsAt: new Date(), usageCount: 5 }))[0], /used 5 times/);
  assert.match((await validate(Discount, { usageLimit: 0 }, { startsAt: new Date(), usageCount: 0 }))[0], /at least 1/);
});

test('discount rule value bounds', async () => {
  assert.deepEqual(await validate(DiscountRule, { type: 'percentage', value: 150 }), ['A percentage discount can be at most 100%.']);
  assert.deepEqual(await validate(DiscountRule, { value: -500 }, { type: 'fixed' }), ["A discount can't take off a negative amount."]);
  assert.deepEqual(await validate(DiscountRule, { type: 'fixed', value: 1500 }), []);
});

test('table numbers are unique per floor, case and spaces ignored', async () => {
  const seen: any[] = [];
  const context: any = { prisma: { table: { findFirst: async ({ where }: any) => { seen.push(where); return where.floorId === 'main' ? { id: 'other' } : null; } } } };
  assert.deepEqual(await validate(Table, { tableNumber: ' 4 ', floor: { connect: { id: 'main' } } }, undefined, context), ['Table 4 already exists on this floor. Give this table a different number.']);
  assert.deepEqual(await validate(Table, { tableNumber: '4', floor: { connect: { id: 'patio' } } }, undefined, context), []);
  assert.deepEqual(await validate(Table, { capacity: 6 }, { id: 't', tableNumber: '4', floorId: 'main' }, context), [], 'saves that leave number and floor alone are not checked');
  assert.equal(seen[0].tableNumber.mode, 'insensitive');
  assert.deepEqual(seen[2] ?? null, null);
});
