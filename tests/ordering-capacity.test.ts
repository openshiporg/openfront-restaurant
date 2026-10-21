import test from 'node:test';
import assert from 'node:assert/strict';
import { assertOnlineOrderingCapacity } from '../features/keystone/utils/orderingCapacity';
function tx(limit: any, active: number, reserved: number) { return { storeSettings: { findUnique: async ({ where }: any) => { assert.equal(where.id, 1); return { hours: { _ordering: { maxActiveOnlineOrders: limit } } }; } }, restaurantOrder: { count: async () => active }, paymentSession: { count: async ({ where }: any) => { assert.equal(where.paymentCollection.cart.orderId, null); assert.ok(where.OR.some((x: any) => x.data.equals === 'unknown')); return reserved; } } }; }
test('online capacity counts unresolved reservations and frees served/cancelled space', async () => {
  await assert.rejects(assertOnlineOrderingCapacity(tx(5, 3, 2)), /online order limit/);
  await assertOnlineOrderingCapacity(tx(5, 3, 1));
  await assertOnlineOrderingCapacity(tx(0, 500, 500));
  await assert.rejects(assertOnlineOrderingCapacity(tx(-1, 0, 0)), /Invalid/);
});
import { claimCheckoutSession } from '../features/keystone/utils/checkoutReservation';
test('serialized checkout claims reserve the final slot once and allow the original retry at capacity', async () => {
  const carts: any = { a: { id: 'a', items: [] }, b: { id: 'b', items: [] } };
  const sessions: any[] = [];
  let tail = Promise.resolve();
  const prisma = { $transaction: async (fn: any, options: any) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const prior = tail; let release!: () => void; tail = new Promise<void>(resolve => { release = resolve; }); await prior;
    try { return await fn({
      ...tx(1, 0, sessions.length),
      cart: { findUnique: async ({ where }: any) => carts[where.id], update: async ({ where, data }: any) => { carts[where.id].paymentCollection = { id: data.paymentCollectionId, paymentSessions: sessions.filter(s => s.paymentCollectionId === data.paymentCollectionId) }; } },
      paymentCollection: { create: async () => ({ id: `collection-${sessions.length}` }), update: async () => ({}) },
      paymentSession: { count: async () => sessions.length, updateMany: async () => ({}), create: async ({ data }: any) => { const session = { id: `session-${sessions.length}`, ...data }; sessions.push(session); for (const cart of Object.values(carts) as any[]) if (cart.paymentCollection?.id === session.paymentCollectionId) cart.paymentCollection.paymentSessions.push(session); return session; } },
    }); } finally { release(); }
  } };
  const input = (id: string) => ({ cart: { id, items: [] }, providerId: 'stripe', providerCode: 'stripe', checkoutQuote: { pricing: { total: 100 } }, fingerprint: id });
  const results = await Promise.allSettled([claimCheckoutSession(prisma, input('a')), claimCheckoutSession(prisma, input('b'))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(sessions.length, 1);
  assert.equal((await claimCheckoutSession(prisma, input('a'))).replay, true);
});
