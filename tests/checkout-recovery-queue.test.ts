import test from "node:test";
import assert from "node:assert/strict";
import { unplacedCheckoutAttempts } from "../features/keystone/mutations/checkoutRecovery";

function recoveryContext() {
  const rows = [
    { id: "manual", isSelected: true, amount: 1000, createdAt: new Date("2026-09-01T00:00:00Z"), data: { state: "ready", checkoutQuote: { version: 1 }, providerCode: "pp_system_default" }, paymentProvider: { code: "pp_system_default" }, paymentCollection: { cart: { id: "cart-1", customerName: "Guest 1" } } },
    { id: "provider", isSelected: true, amount: 2000, createdAt: new Date("2026-09-02T00:00:00Z"), data: { state: "unknown", checkoutQuote: { version: 1 }, paymentIntentId: "intent-1" }, paymentProvider: { code: "pp_stripe_stripe" }, paymentCollection: { cart: { id: "cart-2", customerName: "Guest 2" } } },
    { id: "cancelling", isSelected: true, amount: 3000, createdAt: new Date("2026-09-03T00:00:00Z"), data: { state: "cancelling", checkoutQuote: { version: 1 }, paymentIntentId: "intent-2" }, paymentProvider: { code: "pp_stripe_stripe" }, paymentCollection: { cart: { id: "cart-3", customerName: "Guest 3" } } },
    { id: "legacy-manual", isSelected: true, amount: 4000, createdAt: new Date("2026-09-04T00:00:00Z"), data: { state: "ready", providerCode: "pp_system_default" }, paymentProvider: { code: "pp_system_default" }, paymentCollection: { cart: { id: "cart-4", customerName: "Guest 4" } } },
    { id: "legacy-provider", isSelected: true, amount: 5000, createdAt: new Date("2026-09-05T00:00:00Z"), data: { state: "unknown", paymentIntentId: "intent-legacy" }, paymentProvider: { code: "pp_stripe_stripe" }, paymentCollection: { cart: { id: "cart-5", customerName: "Guest 5" } } },
  ];
  const ctx: any = {
    session: { itemId: "manager", data: { role: { canManageOrders: true, canManagePayments: true } } },
    prisma: {
      paymentSession: {
        findMany: async ({ where, skip, take }: any) => {
          assert.equal(where.isSelected, true);
          assert.deepEqual(where.paymentCollection, { cart: { orderId: null } });
          assert.equal(where.data, undefined);
          assert.deepEqual(where.OR.map((entry: any) => entry.data.path), Array(6).fill(["state"]));
          return rows.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).slice(skip, skip + take);
        },
        count: async ({ where }: any) => {
          assert.equal(where.isSelected, true);
          assert.deepEqual(where.paymentCollection, { cart: { orderId: null } });
          return rows.length;
        },
      },
      restaurantOrder: { count: async ({ where }: any) => { assert.equal(where.orderSource, "online"); assert.deepEqual(where.status.in, ["open", "sent_to_kitchen", "in_progress", "ready", "dispatched"]); return 2; } },
      storeSettings: { findUnique: async () => ({ hours: { _ordering: { maxActiveOnlineOrders: 5 } } }) },
    },
  };
  return ctx;
}

test("checkout recovery queue includes all unresolved unplaced attempts and paginates on the server", async () => {
  const context = recoveryContext();
  const first = await unplacedCheckoutAttempts(null, { skip: 0, take: 1 }, context);
  assert.equal(first.totalCount, 5);
  assert.equal(first.activeReservations, 5);
  assert.equal(first.activeOnlineOrders, 2);
  assert.equal(first.capacityUsed, 7);
  assert.equal(first.capacityLimit, 5);
  assert.equal(first.capacityAtLimit, true);
  assert.equal(first.hasMore, true);
  assert.equal(first.items[0].cartId, "cart-1");
  assert.equal(first.items[0].canCancel, true);
  const second = await unplacedCheckoutAttempts(null, { skip: 1, take: 1 }, context);
  assert.equal(second.items[0].id, "provider");
  assert.equal(second.items[0].canCancel, true);
  assert.equal(second.hasMore, true);
  const third = await unplacedCheckoutAttempts(null, { skip: 2, take: 1 }, context);
  assert.equal(third.items[0].id, "cancelling");
  assert.equal(third.items[0].canCancel, false);
  assert.equal(third.items[0].canRecover, true);
  assert.equal(third.hasMore, true);
  const fourth = await unplacedCheckoutAttempts(null, { skip: 3, take: 1 }, context);
  assert.equal(fourth.items[0].id, "legacy-manual");
  assert.equal(fourth.items[0].requiresManualReview, true);
  assert.equal(fourth.items[0].canRecover, false);
  assert.equal(fourth.items[0].canCancel, true);
  const fifth = await unplacedCheckoutAttempts(null, { skip: 4, take: 1 }, context);
  assert.equal(fifth.items[0].id, "legacy-provider");
  assert.equal(fifth.items[0].requiresManualReview, true);
  assert.equal(fifth.items[0].canRecover, false);
  assert.equal(fifth.items[0].canCancel, false);
  assert.equal(fifth.hasMore, false);
});

test("checkout recovery queue is authorized and pagination is bounded", async () => {
  let reads = 0;
  const context: any = { session: { itemId: "staff", data: { role: { canManageOrders: true } } }, prisma: { paymentSession: { findMany: async () => { reads++; return []; }, count: async () => 0 } } };
  await assert.rejects(() => unplacedCheckoutAttempts(null, { skip: 0, take: 50 }, context), /Order and payment management/);
  await assert.rejects(() => unplacedCheckoutAttempts(null, { skip: -1, take: 50 }, recoveryContext()), /pagination/);
  await assert.rejects(() => unplacedCheckoutAttempts(null, { skip: 0, take: 101 }, recoveryContext()), /pagination/);
  assert.equal(reads, 0);
});
