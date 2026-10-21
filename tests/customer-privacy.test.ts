import test from 'node:test';
import assert from 'node:assert/strict';
import { exportMyRestaurantData, recordMyRestaurantPrivacy, resolveRestaurantPrivacyRequest } from '../features/keystone/mutations/customerPrivacy';
test('data export requires human identity and scopes every order to that customer', async () => {
  await assert.rejects(exportMyRestaurantData(null, null, {} as any), /Sign in/);
  await assert.rejects(exportMyRestaurantData(null, null, { session: { apiKeyId: 'key', itemId: 'u', data: {} } } as any), /Sign in/);
  let where: any;
  const ctx: any = { session: { itemId: 'u', data: { isActive: true } }, prisma: { user: { findUnique: async () => ({ id: 'u' }) }, restaurantOrder: { findMany: async (args: any) => { where = args.where; assert.equal(args.select.secretKey, undefined); return []; } }, auditEvent: { findMany: async () => [] } } };
  await exportMyRestaurantData(null, null, ctx); assert.deepEqual(where, { customerId: 'u' });
});
test('consent is purpose-bound, append-only and request-key retries are checked', async () => {
  const events: any[] = []; const ctx: any = { session: { itemId: 'u', data: { isActive: true } }, prisma: { $transaction: async (fn: any) => fn({ auditEvent: { findUnique: async ({ where }: any) => events.find(e => e.eventKey === where.eventKey), upsert: async ({ create }: any) => { const e = { ...create, id: 'e' }; events.push(e); return e; } } }) } };
  const args = { action: 'marketing_opt_out', idempotencyKey: 'request-123' };
  await recordMyRestaurantPrivacy(null, args, ctx); await recordMyRestaurantPrivacy(null, args, ctx); assert.equal(events.length, 1);
  assert.equal(events[0].after.purpose, 'restaurant_marketing');
  await assert.rejects(recordMyRestaurantPrivacy(null, { ...args, action: 'marketing_opt_in' }, ctx), /reused/);
  await assert.rejects(resolveRestaurantPrivacyRequest(null, { requestId: 'e', outcome: 'fulfilled', reason: 'case1' }, ctx), /management/);
});
