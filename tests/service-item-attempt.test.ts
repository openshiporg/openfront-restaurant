import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveServiceItemAttempt, clearServiceItemAttempt, SERVICE_ITEM_ATTEMPT_TTL } from '../features/lib/service-item-attempt';
function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const input = { orderId: 'order', tableId: 'table', menuItemId: 'burger', quantity: 1, courseNumber: 1, seatNumber: 2, specialInstructions: 'Guest private allergy note', modifierIds: ['no-dairy'] };
test('uncertain item submission survives a fresh page and preserves the exact request identity', async () => {
  const disk = storage();
  const first = await reserveServiceItemAttempt(disk, 'staff', input, 1000);
  // Response was lost: no success clear occurs. A fresh page has no in-memory state.
  const afterReload = await reserveServiceItemAttempt(disk, 'staff', { ...input }, 2000);
  assert.deepEqual(afterReload, first);
  assert.deepEqual({ ...input, ...afterReload }, { ...input, ...first });
  assert.equal(disk.values.size, 1);
  assert.ok(!JSON.stringify([...disk.values.values()]).includes(input.specialInstructions));
  clearServiceItemAttempt(disk, 'staff', 'table');
  const intentionalNextAddition = await reserveServiceItemAttempt(disk, 'staff', input, 3000);
  assert.notEqual(intentionalNextAddition.idempotencyKey, first.idempotencyKey);
});
test('uncertain first addition keeps original null orderId after the new check appears on reload', async () => {
  const disk = storage();
  const first = await reserveServiceItemAttempt(disk, 'staff', { ...input, orderId: null }, 1000);
  const afterReload = await reserveServiceItemAttempt(disk, 'staff', { ...input, orderId: 'newly-created-check' }, 2000);
  assert.deepEqual(afterReload, first); assert.equal(afterReload.orderId, null);
});
test('changed payload or foreign check cannot silently replace an unresolved attempt', async () => {
  const disk = storage();
  const first = await reserveServiceItemAttempt(disk, 'staff', input, 1000);
  for (const change of [{ quantity: 2 }, { specialInstructions: 'changed' }, { orderId: 'other' }, { modifierIds: ['extra-cheese'] }]) {
    await assert.rejects(reserveServiceItemAttempt(disk, 'staff', { ...input, ...change }, 2000), /unresolved/);
  }
  assert.deepEqual(await reserveServiceItemAttempt(disk, 'staff', input, 2000), first);
  assert.notEqual((await reserveServiceItemAttempt(disk, 'other-staff', input, 2000)).idempotencyKey, first.idempotencyKey);
});
test('expired or malformed attempts fail closed until explicitly reviewed and cleared', async () => {
  const disk = storage(); await reserveServiceItemAttempt(disk, 'staff', input, 1000);
  await assert.rejects(reserveServiceItemAttempt(disk, 'staff', input, SERVICE_ITEM_ATTEMPT_TTL + 1001), /expired/);
  await assert.rejects(reserveServiceItemAttempt(disk, 'staff', input, 999), /invalid/);
  const key = [...disk.values.keys()][0]; disk.values.set(key, '{broken');
  await assert.rejects(reserveServiceItemAttempt(disk, 'staff', input, 2000), /invalid/);
  clearServiceItemAttempt(disk, 'staff', 'table');
  assert.ok((await reserveServiceItemAttempt(disk, 'staff', input, 2000)).idempotencyKey);
});
test('storage failure stops submission before a retry identity can be lost', async () => {
  const disk = storage(); disk.setItem = () => { throw new Error('Storage unavailable'); };
  let sent = false;
  await assert.rejects((async () => { await reserveServiceItemAttempt(disk, 'staff', input, 1000); sent = true; })(), /Storage unavailable/);
  assert.equal(sent, false);
});
