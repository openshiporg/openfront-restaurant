import test from "node:test";
import assert from "node:assert/strict";
import processPayment from "../features/keystone/mutations/processPayment";
import { compOrderItem, voidOrder, voidOrderItem } from "../features/keystone/mutations/voidComp";
import { claimCheckoutSession, checkoutCartSignature } from "../features/keystone/utils/checkoutReservation";
import { cancelCheckoutPaymentSession } from "../features/keystone/mutations/checkoutRecovery";
import { providerRefundObservation, recordVerifiedProviderRefund } from "../features/keystone/utils/providerRefunds";
import { issueGiftCard } from "../features/keystone/mutations/issueGiftCard";
import { enqueueRestaurantNotification, deliverQueuedNotification, acknowledgeRestaurantNotification } from "../features/keystone/utils/restaurantNotifications";


import completeActiveCart from "../features/keystone/mutations/completeActiveCart";
import { finalizeRefundWithClient } from "../features/keystone/utils/refundLedger";
import { canonicalIdempotencyParams, idempotencyFingerprint } from "../features/keystone/utils/idempotency";

function database() {
  const records: Record<string, any[]> = {}; let sequence = 0; let queue = Promise.resolve(); let failTable = "";
  const db: any = {};
  for (const name of ["giftCard", "giftCardTransaction", "restaurantOrder", "payment", "auditEvent", "receipt", "cart", "paymentCollection", "paymentSession", "orderAdjustment", "refund", "orderItem", "idempotencyKey", "managerApproval", "storeSettings", "user", "paymentProvider"]) {
    records[name] = [];
    const find = (where: any) => records[name].find(row => Object.entries(where).every(([key, value]) => row[key] === value));
    const create = async ({ data }: any) => { if (failTable === name) { failTable = ""; throw new Error("storage interrupted"); } const row = { id: `${name}-${++sequence}`, createdAt: new Date(), ...data }; records[name].push(row); return row; };
    db[name] = {
      findUnique: async ({ where, include }: any) => { const row = find(where); return include?.paymentCollection && row ? { ...row, paymentCollection: records.paymentCollection.find(collection => collection.id === row.paymentCollectionId) ? { ...records.paymentCollection.find(collection => collection.id === row.paymentCollectionId), paymentSessions: records.paymentSession.filter(session => session.paymentCollectionId === row.paymentCollectionId) } : null } : include?.order && row ? { ...row, order: records.restaurantOrder.find(order => order.id === row.orderId) } : include?.giftCard && row ? { ...row, giftCard: records.giftCard.find(card => card.id === row.giftCardId) } : include?.payments && row ? { ...row, payments: records.payment.filter(payment => payment.orderId === row.id) } : row; },
      findMany: async ({ where }: any) => records[name].filter(row => Object.entries(where || {}).every(([key, value]: any) => value?.path ? row[key]?.[value.path[0]] === value.equals : value?.in ? value.in.includes(row[key]) : row[key] === value)),
      findFirst: async ({ where }: any) => records[name].find(row => Object.entries(where || {}).every(([key, value]: any) => value?.in ? value.in.includes(row[key]) : typeof value === "object" && value?.startsWith ? String(row[key]).startsWith(value.startsWith) : row[key] === value)),
      create,
      update: async ({ where, data }: any) => Object.assign(find(where), data),
      updateMany: async ({ where, data }: any) => { const rows = records[name].filter(row => Object.entries(where).every(([key, value]) => row[key] === value)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; },
      upsert: async ({ where, create: data }: any) => find(where) || create({ data }),
    };
  }
  db.$transaction = async (fn: any) => { const run = queue.then(async () => { const snapshot = structuredClone(records); try { return await fn(db); } catch (error) { for (const key of Object.keys(records)) records[key] = snapshot[key]; throw error; } }); queue = run.catch(() => {}); return run; };
  const context: any = { prisma: db, session: { itemId: "manager", data: { role: { canManageGiftCards: true, canManagePayments: true, canManageOrders: true } } }, sudo: () => ({ query: { StoreSettings: { findOne: async () => ({ currencyCode: "USD" }) } } }) };
  return { db, records, context, failNext: (name: string) => { failTable = name; } };
}
function checkoutCompletionFixture() {
  const f = database();
  const quoteCart: any = {
    id: "cart", orderType: "pickup", email: "guest@example.test", customerName: "Original guest", customerPhone: "",
    deliveryAddress: "", deliveryAddress2: "", deliveryCity: "", deliveryState: "", deliveryZip: "", deliveryCountryCode: "",
    tipPercent: "0", user: null,
    items: [{ id: "cart-line", quantity: 1, specialInstructions: "Original instructions", menuItem: { id: "deleted-menu" }, modifiers: [{ id: "deleted-modifier" }] }],
  };
  const quote = {
    version: 1,
    cart: quoteCart,
    cartSignature: checkoutCartSignature(quoteCart),
    items: [{ menuItem: { id: "deleted-menu", name: "Purchased soup", kitchenStation: "expo" }, unitPrice: 1000, quantity: 1, modifiers: [{ id: "deleted-modifier", name: "No salt", priceAdjustment: 0 }], specialInstructions: "Original instructions" }],
    pricing: { subtotal: 1000, tax: 100, tip: 0, pickupDiscount: 0, deliveryFee: 0, total: 1100 },
    currencyCode: "USD",
  };
  const session: any = { id: "session", amount: 1100, idempotencyKey: "quote", isSelected: true, isInitiated: true, paymentCollectionId: "collection", paymentProviderId: "manual", data: { state: "ready", checkoutQuote: quote, providerCode: "pp_system_default" }, paymentProvider: { id: "manual", code: "pp_system_default" } };
  const cart: any = { ...structuredClone(quoteCart), items: [{ ...quoteCart.items[0], menuItem: null, modifiers: [] }], paymentCollection: { id: "collection", paymentSessions: [session] } };
  f.records.cart.push({ ...structuredClone(cart), paymentCollection: undefined, paymentCollectionId: "collection", orderId: null, items: structuredClone(cart.items) });
  f.records.paymentCollection.push({ id: "collection", amount: 1100 });
  f.records.paymentSession.push(structuredClone(session));
  f.records.auditEvent.push({ id: "private-recipe", eventKey: "checkout-recipe:session:0", after: { recipeYield: 1, ingredients: [{ ingredientId: "stock", quantity: 2 }] } });
  f.context.sudo = () => ({ query: { Cart: { findOne: async () => cart }, StoreSettings: { findOne: async () => ({ taxRate: 50, currencyCode: "USD" }) } } });
  return { f, quote, session, cart };
}
test("cash-funded issuance atomically creates liability, tender, receipt and stable replay", async () => {
 const f = database(); const args = { code: "GIFT-123456", amount: 1000, idempotencyKey: "first" };
 const card = await issueGiftCard(null, args, f.context); assert.equal(card.balance, 1000); assert.equal(f.records.payment[0].amount, 1000); assert.equal(f.records.giftCardTransaction[0].type, "issue"); assert.equal(f.records.restaurantOrder[0].orderSource, "gift_card"); assert.equal(f.records.receipt.length, 1);
 const repeat = await issueGiftCard(null, args, f.context); assert.equal(repeat.id, card.id); assert.equal(f.records.payment.length, 1);
 await assert.rejects(() => issueGiftCard(null, { ...args, amount: 2000 }, f.context), /different issuance/);
});
test("issuance failure rolls back cash/value and rejects unauthorized/free-value input", async () => {
 const f = database(); f.failNext("giftCardTransaction"); await assert.rejects(() => issueGiftCard(null, { code: "GIFT-123456", amount: 1000, idempotencyKey: "fail" }, f.context), /interrupted/); assert.equal(f.records.giftCard.length, 0); assert.equal(f.records.payment.length, 0);
 await assert.rejects(() => issueGiftCard(null, { code: "GIFT-123456", amount: 0, idempotencyKey: "zero" }, f.context), /positive/);
 f.context.session.data.role.canManagePayments = false; await assert.rejects(() => issueGiftCard(null, { code: "GIFT-123456", amount: 1000, idempotencyKey: "no" }, f.context), /required/);
});
async function queued(f: ReturnType<typeof database>, to = "guest@example.test") { return enqueueRestaurantNotification(f.db, "manager", { eventKey: "order-confirmation:o1", entityType: "RestaurantOrder", entityId: "o1", to, subject: "Order received", text: "Pickup confirmed" }); }
test("notification is durable before dispatch; concurrent delivery claims permit only one transport call", async () => {
 const f = database(); const row = await queued(f); assert.ok(row.id); assert.equal((await queued(f)).id, row.id); let calls = 0; let release: () => void = () => {}; const wait = new Promise<void>(resolve => { release = resolve; });
 const first = deliverQueuedNotification(f.context, row.id, async () => { calls++; await wait; return { accepted: true, reference: "fake-accepted" }; });
 await new Promise(resolve => setTimeout(resolve, 5)); await assert.rejects(() => deliverQueuedNotification(f.context, row.id, async () => { calls++; return { accepted: true }; }), /in-flight/); release();
 assert.equal((await first).status, "accepted"); assert.equal(calls, 1); assert.equal((await deliverQueuedNotification(f.context, row.id, async () => { throw new Error("must not send again"); })).status, "accepted");
});
test("unknown delivery requires explicit duplicate-risk retry and manual evidence is separate", async () => {
 const f = database(); const row = await queued(f);
 const first = await deliverQueuedNotification(f.context, row.id, async () => { throw new Error("socket disconnected after send"); }); assert.equal(first.status, "unknown");
 await assert.rejects(() => deliverQueuedNotification(f.context, row.id, async () => ({ accepted: true })), /unknown/);
 const retry = await deliverQueuedNotification(f.context, row.id, async () => ({ accepted: true }), true); assert.equal(retry.status, "accepted");
 await assert.rejects(() => acknowledgeRestaurantNotification(null, { notificationId: row.id, reason: "" }, f.context), /evidence/);
 assert.equal((await acknowledgeRestaurantNotification(null, { notificationId: row.id, reason: "Customer confirmed by phone" }, f.context)).status, "acknowledged");
});
test("invalid recipient stays recoverable without transport and unauthorized dispatch does not probe DB", async () => {
 const f = database(); const row = await queued(f, "bad\nrecipient"); const result = await deliverQueuedNotification(f.context, row.id, async () => { throw new Error("must not call transport"); }); assert.equal(result.status, "failed");
 await assert.rejects(() => deliverQueuedNotification({ session: undefined } as any, "unknown", async () => ({ accepted: true })), /required/);
});
test("checkout placement preserves its reviewed quote across settings/catalog changes", async () => {
 const { f, cart } = checkoutCompletionFixture();
 const result = await completeActiveCart(null, { cartId: "cart" }, f.context); assert.equal(result.status, "open"); const order = f.records.restaurantOrder[0]; assert.equal(order.total, 1100); assert.equal(f.records.auditEvent.find(row => row.eventType === "order.pricing_policy").after.taxRate, 10); assert.equal(order.customerName, "Original guest"); assert.equal(f.records.orderItem[0].itemNameSnapshot, "Purchased soup"); assert.equal(f.records.orderItem[0].menuItemId, null); assert.equal(f.records.orderItem[0].modifiersSnapshot[0].name, "No salt"); assert.equal(f.records.auditEvent.filter(row => row.eventType === "notification.queued").length, 1);
 cart.order = result; const repeat = await completeActiveCart(null, { cartId: "cart" }, f.context); assert.equal(repeat.id, result.id); assert.equal(f.records.restaurantOrder.length, 1);
});

test("direct GraphQL completion rejects cart identity drift after review before placement", async () => {
 const { f } = checkoutCompletionFixture();
 f.records.cart[0].customerName = "Edited outside checkout";
 await assert.rejects(() => completeActiveCart(null, { cartId: "cart" }, f.context), /Cart changed after checkout review/);
 assert.equal(f.records.restaurantOrder.length, 0); assert.equal(f.records.payment.length, 0);
});

test("direct GraphQL completion rejects session amount or quote drift after the initial read", async () => {
 const changedAmount = checkoutCompletionFixture();
 changedAmount.f.records.paymentSession[0].amount = 900;
 await assert.rejects(() => completeActiveCart(null, { cartId: "cart" }, changedAmount.f.context), /session amount no longer matches/);
 assert.equal(changedAmount.f.records.restaurantOrder.length, 0); assert.equal(changedAmount.f.records.payment.length, 0);

 const changedQuote = checkoutCompletionFixture();
 changedQuote.f.records.paymentSession[0].data.checkoutQuote.pricing.total = 900;
 await assert.rejects(() => completeActiveCart(null, { cartId: "cart" }, changedQuote.f.context), /quote changed after review/);
 assert.equal(changedQuote.f.records.restaurantOrder.length, 0); assert.equal(changedQuote.f.records.payment.length, 0);
});

test("final placement rechecks quote/session identity after its preflight transaction", async () => {
 const { f } = checkoutCompletionFixture();
 const readSession = f.db.paymentSession.findUnique; let reads = 0;
 f.db.paymentSession.findUnique = async (args: any) => {
   if (++reads === 2) f.records.paymentSession[0].amount = 900;
   return readSession(args);
 };
 await assert.rejects(() => completeActiveCart(null, { cartId: "cart" }, f.context), /session amount no longer matches/);
 assert.equal(reads, 2); assert.equal(f.records.restaurantOrder.length, 0); assert.equal(f.records.payment.length, 0);
});








test("verified external refunds preserve provider scope, amount/currency and exact-once ledger/receipt", async () => {
 const f = database(); f.records.restaurantOrder.push({ id: "external-order", customerId: null, orderNumber: "EXT1" }); f.records.payment.push({ id: "external-payment", orderId: "external-order", paymentProviderId: "stripe", amount: 1000, refundedAmount: 0, status: "succeeded", paymentMethod: "credit_card", currencyCode: "USD", data: {} });
 const input = { paymentId: "external-payment", providerId: "stripe", providerCode: "pp_stripe_stripe", refund: providerRefundObservation({ id: "re_1", amount: 300, currency: "usd", status: "succeeded" }) };
 const record = () => f.db.$transaction((tx: any) => recordVerifiedProviderRefund(tx, input)); await record(); await record(); assert.equal(f.records.payment[0].refundedAmount, 300); assert.equal(f.records.refund.length, 1); assert.equal(f.records.receipt.length, 1); assert.equal(f.records.refund[0].approvedById, null);
 await f.db.$transaction((tx: any) => recordVerifiedProviderRefund(tx, { ...input, refund: { ...input.refund, status: "failed" } })); assert.equal(f.records.payment[0].refundedAmount, 300); assert.equal(f.records.refund[0].status, "succeeded");
 await assert.rejects(() => f.db.$transaction((tx: any) => recordVerifiedProviderRefund(tx, { ...input, providerId: "wrong-provider" })), /provider/);
 await assert.rejects(() => f.db.$transaction((tx: any) => recordVerifiedProviderRefund(tx, { ...input, refund: { ...input.refund, id: "re_over", amount: 701 } })), /exceeds/); assert.equal(f.records.payment[0].refundedAmount, 300);
 await assert.rejects(() => f.db.$transaction((tx: any) => recordVerifiedProviderRefund(tx, { ...input, refund: { ...input.refund, currencyCode: "JPY" } })), /currency/);
});
test("provider refund callback joins a pending local approved refund without duplicate money", async () => {
 const f = database(); f.records.restaurantOrder.push({ id: "order", customerId: null }); f.records.payment.push({ id: "payment", orderId: "order", paymentProviderId: "stripe", amount: 1000, refundedAmount: 0, status: "succeeded", currencyCode: "USD", paymentMethod: "credit_card", data: {} });
 f.records.refund.push({ id: "local-refund", idempotencyKey: "local-attempt", paymentId: "payment", orderId: "order", amount: 200, status: "unknown", approvedById: "manager", reason: "Return" });
 await f.db.$transaction((tx: any) => recordVerifiedProviderRefund(tx, { paymentId: "payment", providerId: "stripe", providerCode: "pp_stripe_stripe", refund: providerRefundObservation({ id: "re_local", amount: 200, currency: "USD", status: "succeeded", metadata: { restaurantRefundKey: "local-attempt" } }) }));
 assert.equal(f.records.refund.length, 1); assert.equal(f.records.refund[0].id, "local-refund"); assert.equal(f.records.refund[0].approvedById, "manager"); assert.equal(f.records.payment[0].refundedAmount, 200);
 assert.equal(providerRefundObservation({ id: "paypal-refund", amount: { value: "100", currency_code: "JPY" }, status: "COMPLETED" }).amount, 100);
 assert.equal(providerRefundObservation({ id: "paypal-refund", amount: { value: "1.25", currency_code: "USD" }, status: "COMPLETED" }).amount, 125);
});
test("checkout cancellation cannot race an active capture and local unpaid cancellation releases quote", async () => {
 const f = database(); const session: any = { id: "session", isSelected: true, isInitiated: true, data: { state: "finalizing", checkoutQuote: {} }, paymentProvider: { code: "pp_system_default" } }; const cart: any = { id: "cart", paymentCollection: { paymentSessions: [session] } }; f.records.cart.push({ id: "cart" }); f.records.paymentSession.push(session);
 f.records.auditEvent.push({ id: "private-recipe", eventKey: "checkout-recipe:session:0", after: { recipeYield: 1, ingredients: [{ ingredientId: "stock", quantity: 2 }] } });
 f.context.sudo = () => ({ query: { Cart: { findOne: async () => cart } } });
 await assert.rejects(() => cancelCheckoutPaymentSession(null, { cartId: "cart", paymentSessionId: "session" }, f.context), /capture is in flight/);
 // The transaction harness rolls back object copies on rejection.
 f.records.paymentSession[0].data.state = "ready"; session.data.state = "ready";
 assert.equal((await cancelCheckoutPaymentSession(null, { cartId: "cart", paymentSessionId: "session" }, f.context)).success, true); assert.equal(f.records.paymentSession[0].isSelected, false); assert.equal(f.records.paymentSession[0].data.state, "cancelled");
});

test("checkout reservation serializes different providers and restarts cancelled quotes with a fresh provider key", async () => {
 const f = database(); const cart = { id: "cart", orderType: "pickup", items: [{ id: "line", menuItemId: "menu", quantity: 1, modifiers: [] }] }; f.records.cart.push(structuredClone(cart));
 const input = { cart, providerId: "stripe", providerCode: "pp_stripe_stripe", checkoutQuote: { pricing: { total: 1000 }, items: [] }, fingerprint: "same-contents" };
 const results = await Promise.allSettled([claimCheckoutSession(f.db, input), claimCheckoutSession(f.db, { ...input, providerId: "paypal", providerCode: "pp_paypal_paypal" })]); assert.equal(results.filter(result => result.status === "fulfilled").length, 1); assert.equal(f.records.paymentSession.length, 1);
 const firstKey = f.records.paymentSession[0].idempotencyKey; const replay = await claimCheckoutSession(f.db, input); assert.equal(replay.session.idempotencyKey, firstKey);
 f.records.paymentSession[0].data.state = "cancelled"; f.records.paymentSession[0].isSelected = false;
 const restarted = await claimCheckoutSession(f.db, input); assert.notEqual(restarted.session.idempotencyKey, firstKey); assert.equal(f.records.paymentSession.filter(row => row.isSelected).length, 1);
});
test("checkout reservation rejects cart edits that committed after quote validation", async () => {
 const f = database(); const cart = { id: "cart", orderType: "pickup", items: [{ id: "line", menuItemId: "menu", quantity: 1, modifiers: [] }] }; f.records.cart.push({ ...structuredClone(cart), items: [{ ...cart.items[0], quantity: 2 }] });
 await assert.rejects(() => claimCheckoutSession(f.db, { cart, providerId: "stripe", providerCode: "pp_stripe_stripe", checkoutQuote: { pricing: { total: 1000 } }, fingerprint: "old" }), /Cart changed/); assert.equal(f.records.paymentSession.length, 0);
});

test("partially refunded tender keeps its net reservation and only exact balance can be recollected", async () => {
 const f = database(); f.records.restaurantOrder.push({ id: "order", status: "in_progress", total: 1000, tip: 0, currencyCode: "USD", customerId: null }); f.records.payment.push({ id: "old", orderId: "order", idempotencyKey: "old", amount: 1000, refundedAmount: 200, status: "partially_refunded", paymentMethod: "cash" });
 f.context.sudo = () => ({ query: { PaymentProvider: { findMany: async () => [{ id: "manual", code: "pp_system_default" }] }, RestaurantOrder: { findOne: async () => f.records.restaurantOrder[0] } } });
 const rejected = await processPayment(null, { orderId: "order", amount: 201, paymentMethod: "cash", idempotencyKey: "too-much" }, f.context); assert.equal(rejected.success, false); assert.match(rejected.error!, /remaining balance/);
 const paid = await processPayment(null, { orderId: "order", amount: 200, paymentMethod: "cash", idempotencyKey: "remainder" }, f.context); assert.equal(paid.success, true, paid.error || ""); assert.equal(paid.remainingBalance, 0); assert.equal(f.records.payment.length, 2); assert.equal(f.records.restaurantOrder[0].status, "in_progress");
});
test("independently approved served-but-unpaid comp preserves production and issues a correction receipt", async () => {
 const f = database(); const orderId = "served-check", itemId = "served-item", reason = "Food quality issue";
 f.records.restaurantOrder.push({ id: orderId, orderNumber: "SERVED1", status: "served", orderType: "dine_in", currencyCode: "USD", subtotal: 2000, tax: 200, tip: 0, discount: 0, total: 2200 });
 f.records.orderItem.push({ id: itemId, orderId, itemNameSnapshot: "Soup", price: 1000, quantity: 1, adjustmentTotal: 0, isVoided: false }, { id: "other-item", orderId, itemNameSnapshot: "Bread", price: 1000, quantity: 1, adjustmentTotal: 0, isVoided: false });
 const requestPayload = canonicalIdempotencyParams({ actionType: "comp_item", targetId: itemId, reason, amount: 500 });
 f.records.managerApproval.push({ id: "approval", actionType: "comp_item", targetId: itemId, reason, amount: 500, requestPayload, requestFingerprint: idempotencyFingerprint(requestPayload), requestedById: "manager", approvedById: "owner", status: "approved", expiresAt: new Date(Date.now() + 60_000) });
 f.db.managerApproval.updateMany = async ({ where, data }: any) => {
   const approval = f.records.managerApproval.find(row => row.id === where.id && row.status === where.status && row.requestedById === where.requestedById && row.approvedById !== "manager" && row.expiresAt > where.expiresAt.gt);
   if (!approval) return { count: 0 };
   Object.assign(approval, data); return { count: 1 };
 };
 f.context.sudo = () => ({ query: {
   StoreSettings: { findOne: async () => ({ currencyCode: "USD" }) },
   RestaurantOrder: { findOne: async () => null },
 } });
 const result = await compOrderItem(null, { orderItemId: itemId, reason, compAmount: 500, managerApprovalId: "approval", idempotencyKey: "served-comp" }, f.context);
 assert.equal(result.success, true, result.error || ""); assert.equal(result.adjustedAmount, 500);
 assert.equal(f.records.restaurantOrder[0].status, "served"); assert.equal(f.records.restaurantOrder[0].subtotal, 1500); assert.equal(f.records.restaurantOrder[0].total, 1650);
 assert.equal(f.records.orderItem[0].adjustmentTotal, 500); assert.equal(f.records.orderItem[0].isVoided, false);
 assert.equal(f.records.managerApproval[0].status, "consumed"); assert.equal(f.records.orderAdjustment[0].approvedById, "owner");
 assert.equal(f.records.receipt[0].kind, "correction"); assert.equal(f.records.receipt[0].amount, -550); assert.equal(f.records.receipt[0].snapshot.preparedProductionPreserved, true);
});

test("approved correction cannot reprice unknown tender and cancellation rejects residual captured money", async () => {
 const f = database(); f.records.restaurantOrder.push({ id: "order", status: "in_progress", total: 1000, currencyCode: "USD" }); f.records.orderItem.push({ id: "item", orderId: "order", price: 1000, quantity: 1 }); f.records.payment.push({ orderId: "order", amount: 1000, status: "unknown" });
 const item = await voidOrderItem(null, { orderItemId: "item", reason: "wrong item", managerApprovalId: "approved", idempotencyKey: "item-void" }, f.context); assert.equal(item.success, false); assert.match(item.error!, /tenders/); assert.equal(f.records.orderAdjustment.length, 0);
 f.records.payment[0].status = "partially_refunded"; f.records.payment[0].refundedAmount = 200;
 const order = await voidOrder(null, { orderId: "order", reason: "cancel", managerApprovalId: "approved", idempotencyKey: "void-order" }, f.context); assert.equal(order.success, false); assert.match(order.error!, /remaining captured value/); assert.equal(f.records.restaurantOrder[0].status, "in_progress");
});
test("independent allocated checks accept separate partial tenders and child refunds without duplicating production or sibling money", async () => {
 const f = database(); const originalTotals = { subtotal: 1001, tax: 0, tip: 0, discount: 0, deliveryCharge: 0, total: 1001 }; const allocations = [501, 500].map(total => ({ ...originalTotals, subtotal: total, total }));
 f.records.restaurantOrder.push({ id: "source", orderNumber: "S1", status: "served", ...allocations[0], currencyCode: "USD", customerId: null }, { id: "child", orderNumber: "C1", status: "served", ...allocations[1], currencyCode: "USD", customerId: null });
 f.records.orderItem.push({ id: "food", orderId: "source", itemNameSnapshot: "Dinner", quantity: 1, price: 1001 });
 f.records.orderAdjustment.push({ id: "group", idempotencyKey: "equal-check-group:one", metadata: { sourceOrderId: "source", sourceOrderNumber: "S1", memberOrderIds: ["source", "child"], originalTotals, allocations, sourceItems: [{ itemNameSnapshot: "Dinner", quantity: 1, price: 1001 }] } }, ...["source", "child"].map(orderId => ({ id: orderId, orderId, idempotencyKey: `equal-check-member:${orderId}`, metadata: { groupId: "equal-check-group:one" } })));
 f.context.sudo = () => ({ query: { PaymentProvider: { findMany: async () => [{ id: "manual", code: "pp_system_default" }] }, RestaurantOrder: { findOne: async ({ where }: any) => f.records.restaurantOrder.find(row => row.id === where.id) } } });
 const input = { orderId: "source", amount: 200, paymentMethod: "cash", idempotencyKey: "allocated-partial" }; const first = await processPayment(null, input, f.context); assert.equal(first.success, true, first.error || ""); assert.equal(first.remainingBalance, 301);
 const child = await processPayment(null, { orderId: "child", amount: 500, paymentMethod: "cash", idempotencyKey: "allocated-child" }, f.context); assert.equal(child.success, true, child.error || ""); await processPayment(null, input, f.context); assert.equal(f.records.payment.length, 2);
 const source = await processPayment(null, { orderId: "source", amount: 301, paymentMethod: "cash", idempotencyKey: "allocated-remainder" }, f.context); assert.equal(source.success, true, source.error || ""); assert.ok(f.records.restaurantOrder.every(row => row.status === "served"));
 const childPayment = f.records.payment.find(row => row.orderId === "child"); const refund = await f.db.refund.create({ data: { amount: 100, paymentId: childPayment.id, status: "processing", idempotencyKey: "child-refund" } });
 await f.db.$transaction((tx: any) => finalizeRefundWithClient(tx, { refundId: refund.id, payment: { ...childPayment, order: f.records.restaurantOrder[1] }, providerResult: {}, finalStatus: "succeeded", providerRefundId: "local-child-refund" }));
 assert.equal(f.records.payment.find(row => row.id === childPayment.id).refundedAmount, 100); assert.equal(f.records.payment.filter(row => row.orderId === "source").reduce((sum, row) => sum + row.amount - (row.refundedAmount || 0), 0), 501); assert.equal(f.records.orderItem.length, 1); assert.equal(f.records.orderItem[0].orderId, "source");
 const receipt = f.records.receipt.find(row => row.kind === "refund"); assert.equal(receipt.snapshot.checkAllocation.sourceOrderId, "source"); assert.equal(receipt.snapshot.checkAllocation.allocatedTotals.total, 500);
});
