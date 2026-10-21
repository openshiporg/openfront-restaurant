import test from "node:test";
import assert from "node:assert/strict";
import addActiveCartItem from "../features/keystone/mutations/addActiveCartItem";
import updateCartItemQuantity from "../features/keystone/mutations/updateCartItemQuantity";
import removeCartItem from "../features/keystone/mutations/removeCartItem";
import updateActiveCart from "../features/keystone/mutations/updateActiveCart";
import { claimCheckoutSession } from "../features/keystone/utils/checkoutReservation";
import { cartMutationTransaction } from "../features/keystone/utils/cartMutationTransaction";

function harness() {
  let version = 0, reads = 0, attempts = 0;
  let beforeTouch: (() => Promise<void>) | undefined;
  let failWrite = false;
  let state: any = { id: "cart", userId: "owner", user: { id: "owner" }, orderType: "pickup", tipPercent: "0", items: [{ id: "line", menuItemId: "menu", quantity: 1, modifiers: [] }], paymentCollection: null };
  const hours = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(day => [day, { ranges: [{ open: "00:00", close: "23:59" }, { open: "23:59", close: "00:01" }] }]));
  function prismaFor(draft: any) {
    return {
      storeSettings: { findUnique: async () => ({ hours }) },
      cart: { findUnique: async () => structuredClone(draft), update: async ({ data }: any) => {
        if (beforeTouch && data.updatedAt) { const hook = beforeTouch; beforeTouch = undefined; await hook(); }
        Object.assign(draft, data); return draft;
      } },
      paymentCollection: {
        create: async ({ data }: any) => draft.paymentCollection = { id: "collection", ...data, paymentSessions: [] },
        update: async ({ data }: any) => Object.assign(draft.paymentCollection, data),
      },
      paymentSession: {
        updateMany: async () => { for (const session of draft.paymentCollection.paymentSessions) session.isSelected = false; },
        create: async ({ data }: any) => { const session = { id: "session", ...data }; draft.paymentCollection.paymentSessions.push(session); return session; },
      },
    };
  }
  async function transaction(fn: any, options: any) {
    assert.equal(options.isolationLevel, "Serializable"); attempts++;
    const currentVersion = version, draft = structuredClone(state);
    const result = await fn(prismaFor(draft), draft);
    if (version !== currentVersion) throw Object.assign(new Error("serialization conflict"), { code: "P2034" });
    state = draft; version++; return result;
  }
  const prisma: any = { $transaction: (fn: any, options: any) => transaction(fn, options) };
  const context: any = { session: { itemId: "owner", data: { isActive: true, role: {} } }, req: { headers: {} },
    transaction: (fn: any, options: any) => transaction((tx: any, draft: any) => {
      const readCart = async () => { reads++; return structuredClone(draft); };
      const item = async ({ where }: any) => { reads++; const line = draft.items.find((line: any) => line.id === where.id); return line ? { ...line, cart: { id: draft.id, user: draft.user } } : null; };
      const write = () => { if (failWrite) throw new Error("injected write failure"); };
      const delegate: any = {
        query: { Cart: { findOne: readCart }, CartItem: { findOne: item, createOne: async ({ data }: any) => { write(); draft.items.push({ id: "added", menuItemId: data.menuItem.connect.id, quantity: data.quantity, modifiers: [] }); return { id: "added" }; } },
          MenuItem: { findOne: async () => ({ id: "menu", name: "Meal", price: 100, available: true, modifiers: [], mealPeriods: ["all_day"] }) },
          StoreSettings: { findOne: async () => ({ timezone: "UTC", hours, pickupEnabled: true }) },
        },
        db: { Cart: { findOne: readCart, updateOne: async ({ data }: any) => { write(); Object.assign(draft, data); return draft; } },
          CartItem: {
            updateOne: async ({ where, data }: any) => { write(); Object.assign(draft.items.find((line: any) => line.id === where.id), data); },
            deleteOne: async ({ where }: any) => { write(); draft.items = draft.items.filter((line: any) => line.id !== where.id); },
          } },
      };
      return fn({ ...context, prisma: tx, sudo: () => delegate });
    }, options),
  };
  const claim = () => claimCheckoutSession(prisma, { cart: structuredClone(state), providerId: "manual", providerCode: "manual", checkoutQuote: { pricing: { total: 100 } }, fingerprint: "key" });
  return { context, prisma, claim, snapshot: () => structuredClone(state), reads: () => reads, attempts: () => attempts,
    onTouch: (fn: () => Promise<void>) => { beforeTouch = fn; }, fail: () => { failWrite = true; } };
}
const writers = [
  (context: any) => addActiveCartItem(null, { cartId: "cart", input: { menuItemId: "menu", quantity: 1 } }, context),
  (context: any) => updateCartItemQuantity(null, { cartItemId: "line", quantity: 2 }, context),
  (context: any) => removeCartItem(null, { cartItemId: "line" }, context),
  (context: any) => updateActiveCart(null, { cartId: "cart", data: { customerName: "Guest" } }, context),
];
test("every existing-cart writer rejects a checkout reservation and retains all contents", async () => {
  for (const writer of writers) {
    const h = harness(); await h.claim(); const before = h.snapshot();
    await assert.rejects(writer(h.context), /Checkout is reserved/); assert.deepEqual(h.snapshot(), before);
  }
});
test("checkout winning after a cart guard forces retry, then rejects each stale writer", async () => {
  for (const writer of writers) {
    const h = harness(); h.onTouch(async () => { await h.claim(); });
    await assert.rejects(writer(h.context), /Checkout is reserved/);
    assert.equal(h.snapshot().items.length, 1); assert.equal(h.snapshot().items[0].quantity, 1);
    assert.equal(h.snapshot().customerName, undefined); assert.equal(h.attempts(), 3);
  }
});
test("an edit winning before checkout invalidates the stale quote before provider reservation", async () => {
  const h = harness(), oldCart = h.snapshot();
  await updateCartItemQuantity(null, { cartItemId: "line", quantity: 2 }, h.context);
  await assert.rejects(claimCheckoutSession(h.prisma, { cart: oldCart, providerId: "manual", providerCode: "manual", checkoutQuote: { pricing: { total: 100 } }, fingerprint: "key" }), /Cart changed/);
  assert.equal(h.snapshot().paymentCollection, null); assert.equal(h.snapshot().items[0].quantity, 2);
});
test("foreign and anonymous callers cannot mutate carts; anonymous proof failure precedes privileged reads", async () => {
  const anonymous = harness(); anonymous.context.session = undefined;
  await assert.rejects(updateCartItemQuantity(null, { cartItemId: "line", quantity: 2 }, anonymous.context), /not found/);
  assert.equal(anonymous.reads(), 0);
  const foreign = harness(); foreign.context.session.itemId = "foreign";
  await assert.rejects(removeCartItem(null, { cartItemId: "line" }, foreign.context), /not found/);
  assert.equal(foreign.snapshot().items.length, 1);
});
test("child persistence failures and invalid quantities roll back the cart claim touch", async () => {
  const h = harness(), before = h.snapshot(); h.fail();
  await assert.rejects(removeCartItem(null, { cartItemId: "line" }, h.context), /injected/);
  assert.deepEqual(h.snapshot(), before);
  await assert.rejects(updateCartItemQuantity(null, { cartItemId: "line", quantity: 0 }, h.context), /Quantity/);
  assert.deepEqual(h.snapshot(), before);
});
test("cart serialization retries are bounded and do not retry business errors", async () => {
  let attempts = 0;
  await assert.rejects(cartMutationTransaction({ transaction: async () => { attempts++; throw { code: "P2034" }; } } as any, async () => null));
  assert.equal(attempts, 3); attempts = 0;
  await assert.rejects(cartMutationTransaction({ transaction: async () => { attempts++; throw new Error("business failure"); } } as any, async () => null), /business failure/);
  assert.equal(attempts, 1);
});
