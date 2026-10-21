import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import handlePaymentProviderWebhook from "../features/keystone/mutations/handlePaymentProviderWebhook";
import retryVerifiedRefundWebhook from "../features/keystone/mutations/retryVerifiedRefundWebhook";

// Synthetic local signature fixtures. SDK construction/verification performs no
// network request. No maintained credentials, database or provider API is used.
const secret = "offline_webhook_fixture_secret";
process.env.STRIPE_SECRET_KEY = "sk_test_offline_fixture_only";
process.env.STRIPE_WEBHOOK_SECRET = secret;
const stripe = new Stripe("sk_test_offline_fixture_only");
function signed(event: any) { const rawBody = JSON.stringify(event); return { providerCode: "pp_stripe_stripe", event, rawBody, headers: { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret }) } }; }
function fixture() {
 const inbox: any[] = [], refunds: any[] = []; const receipts = new Map(); const audits = new Map();
 const order: any = { id: "order", orderSource: "pos", status: "in_progress", total: 1000, currencyCode: "USD", customerId: null };
 const payment: any = { id: "payment", providerPaymentId: "pi_offline", paymentProviderId: "provider", orderId: "order", amount: 1000, refundedAmount: 0, tipAmount: 0, status: "processing", processedAt: null, currencyCode: "USD", paymentMethod: "credit_card", data: {} };
 const provider = { id: "provider", code: "pp_stripe_stripe", isInstalled: true, handleWebhookFunction: "stripe", getPaymentStatusFunction: "stripe" };
 const db: any = {
  orderAdjustment: { findFirst: async () => null },
  payment: { findUnique: async () => ({ ...payment, order }), findMany: async ({ where }: any = {}) => where.OR ? [] : [{ ...payment, order }], findFirst: async () => null, update: async ({ data }: any) => Object.assign(payment, data) },
  restaurantOrder: { findUnique: async () => ({ ...order, payments: [payment] }), updateMany: async () => ({ count: 0 }) },
  paymentWebhookEvent: {
   findUnique: async ({ where }: any) => inbox.find(row => row.id === where.id || row.eventKey === where.eventKey),
   update: async ({ where, data }: any) => Object.assign(inbox.find(row => row.id === where.id), data),
   updateMany: async ({ where, data }: any) => {
    const terminalStatuses = where.status?.notIn || [];
    const row = inbox.find(item => item.id === where.id && !terminalStatuses.includes(item.status));
    if (!row) return { count: 0 };
    const next = { ...data, ...(data.attempts?.increment ? { attempts: Number(row.attempts || 0) + data.attempts.increment } : {}) };
    Object.assign(row, next);
    return { count: 1 };
   },
  },
  refund: { findMany: async ({ where }: any) => refunds.filter(row => Object.entries(where).every(([key, value]) => row[key] === value)), findUnique: async ({ where }: any) => refunds.find(row => Object.entries(where).every(([key, value]) => row[key] === value)), create: async ({ data }: any) => { const row = { id: `refund-${refunds.length}`, ...data }; refunds.push(row); return row; }, update: async ({ where, data }: any) => Object.assign(refunds.find(row => row.id === where.id), data) },
  auditEvent: { upsert: async ({ where, create }: any) => { if (!audits.has(where.eventKey)) audits.set(where.eventKey, create); return audits.get(where.eventKey); } },
  receipt: { upsert: async ({ where, create }: any) => { if (!receipts.has(where.receiptNumber)) receipts.set(where.receiptNumber, create); return receipts.get(where.receiptNumber); } },
  $transaction: async (fn: any) => fn(db),
 };
 const context: any = { prisma: db, sudo: () => ({ query: {
  PaymentProvider: { findMany: async () => [provider] },
  Payment: { findMany: async ({ where }: any) => where.providerPaymentId.equals === payment.providerPaymentId ? [{ ...payment, order }] : [] },
  RestaurantOrder: { findOne: async () => order },
  PaymentWebhookEvent: { findMany: async ({ where }: any) => inbox.filter(row => row.eventKey === where.eventKey.equals), createOne: async ({ data }: any) => { const row = { id: `event-${inbox.length}`, ...data }; inbox.push(row); return row; } },
 }, db: { PaymentWebhookEvent: { ...db.paymentWebhookEvent, updateOne: db.paymentWebhookEvent.update } } }) };
 context.transaction = async (operation: any) => operation({ prisma: db });
 return { context, inbox, refunds, receipts, payment, audits, order };
}
function succeeded(id = "evt_success", reference = "pi_offline") { return { id, type: "payment_intent.succeeded", data: { object: { id: reference, amount_received: 1000, currency: "usd", status: "succeeded" } } }; }
test("real local Stripe signature verification rejects tampering before ledger writes", async () => {
 const f = fixture(); const event = signed(succeeded()); event.rawBody += " "; await assert.rejects(() => handlePaymentProviderWebhook(null, event, f.context), /adapter|signature/i); assert.equal(f.inbox.length, 0); assert.equal(f.payment.status, "processing");
});
test("signed success, delayed failure and duplicate success preserve captured amount/date/one receipt", async () => {
 const f = fixture(); await handlePaymentProviderWebhook(null, signed(succeeded()), f.context); const firstTime = f.payment.processedAt;
 await handlePaymentProviderWebhook(null, signed({ id: "evt_late_failure", type: "payment_intent.payment_failed", data: { object: { id: "pi_offline", last_payment_error: { message: "old failure" } } } }), f.context);
 await handlePaymentProviderWebhook(null, signed(succeeded("evt_other_success")), f.context);
 assert.equal(f.payment.status, "succeeded"); assert.equal(f.payment.processedAt, firstTime); assert.equal(f.receipts.size, 1);
});
test("signed external refund persists one unapproved provider-origin refund and cannot be erased by late success", async () => {
 const f = fixture(); await handlePaymentProviderWebhook(null, signed(succeeded()), f.context);
 const event = { id: "evt_external_refund", type: "charge.refunded", data: { object: { id: "ch_offline", payment_intent: "pi_offline", refunds: { has_more: false, data: [{ id: "re_offline", amount: 200, currency: "usd", status: "succeeded" }] } } } };
 await handlePaymentProviderWebhook(null, signed(event), f.context); await handlePaymentProviderWebhook(null, signed(event), f.context); await handlePaymentProviderWebhook(null, signed(succeeded("evt_late_paid")), f.context);
 assert.equal(f.refunds.length, 1); assert.equal(f.refunds[0].approvedById, null); assert.equal(f.refunds[0].providerData.restaurantOrigin, "provider_external"); assert.equal(f.payment.refundedAmount, 200); assert.equal(f.payment.status, "partially_refunded"); assert.equal(f.receipts.size, 2);
});
test("signed unmatched event remains retryable and converges after payment correlation", async () => {
 const f = fixture(); f.context.prisma.paymentSession = { findFirst: async () => null }; const event = succeeded("evt_before_payment", "pi_later");
 const delivery = signed(event);
 await assert.rejects(() => handlePaymentProviderWebhook(null, delivery, f.context), /correlation pending/); assert.equal(f.inbox[0].status, "failed"); assert.equal(f.inbox[0].attempts, 1);
 await assert.rejects(() => handlePaymentProviderWebhook(null, delivery, f.context), /correlation pending/); assert.equal(f.inbox[0].attempts, 2);
 f.payment.providerPaymentId = "pi_later"; await handlePaymentProviderWebhook(null, delivery, f.context); assert.equal(f.inbox.length, 1); assert.equal(f.inbox[0].status, "processed"); assert.equal(f.inbox[0].attempts, 3); assert.equal(f.payment.status, "succeeded");
});
test("webhook refuses ambiguous provider-payment correlation before financial writes", async () => {
 const f = fixture();
 const originalSudo = f.context.sudo;
 f.context.sudo = () => {
  const scoped = originalSudo();
  const findPayments = scoped.query.Payment.findMany;
  scoped.query.Payment.findMany = async (args: any) => args.where.providerPaymentId.equals === "pi_offline"
   ? [{ ...f.payment, order: f.order }, { ...f.payment, id: "payment-duplicate", order: f.order }]
   : findPayments(args);
  return scoped;
 };
 await assert.rejects(() => handlePaymentProviderWebhook(null, signed(succeeded()), f.context), /multiple local payments/);
 assert.equal(f.payment.status, "processing"); assert.equal(f.inbox[0].status, "failed");
 assert.match(f.inbox[0].error, /manual reconciliation required/);
});
test("signed refund event arriving before local payment correlation retries once and preserves the reversal", async () => {
 const f = fixture();
 f.context.prisma.payment.findFirst = async () => null;
 const event = { id: "evt_refund_before_payment", type: "charge.refunded", data: { object: {
  id: "ch_later", payment_intent: "pi_later", currency: "usd",
  refunds: { has_more: false, data: [{ id: "re_later", amount: 300, currency: "usd", status: "succeeded" }] },
 } } };
 const delivery = signed(event);
 await assert.rejects(() => handlePaymentProviderWebhook(null, delivery, f.context), /correlation pending/);
 assert.equal(f.inbox.length, 1); assert.equal(f.inbox[0].status, "failed"); assert.equal(f.refunds.length, 0); assert.equal(f.payment.refundedAmount, 0);

 f.payment.providerPaymentId = "pi_later";
 await handlePaymentProviderWebhook(null, delivery, f.context);
 assert.equal(f.inbox[0].status, "processed"); assert.equal(f.inbox[0].attempts, 2);
 assert.equal(f.refunds.length, 1); assert.equal(f.refunds[0].providerRefundId, "re_later");
 assert.equal(f.payment.refundedAmount, 300); assert.equal(f.payment.status, "partially_refunded");
 await handlePaymentProviderWebhook(null, delivery, f.context);
 await handlePaymentProviderWebhook(null, signed(succeeded("evt_capture_after_refund", "pi_later")), f.context);
 assert.equal(f.refunds.length, 1); assert.equal(f.payment.refundedAmount, 300); assert.equal(f.payment.status, "partially_refunded");
});
test("post-commit kitchen projection failure does not downgrade a processed webhook inbox row", async () => {
 const f = fixture(); f.order.orderSource = "online"; f.order.status = "open";
 const originalSudo = f.context.sudo;
 f.context.sudo = () => {
  const scoped = originalSudo();
  scoped.query.KitchenTicket = { findMany: async () => { throw new Error("offline kitchen projection failure"); } };
  return scoped;
 };
 await assert.rejects(() => handlePaymentProviderWebhook(null, signed(succeeded()), f.context), /offline kitchen projection failure/);
 assert.equal(f.payment.status, "succeeded"); assert.equal(f.inbox[0].status, "processed");
});
test("authorized recovery locally replays one correlated Stripe refund inbox row idempotently", async () => {
 const f = fixture();
 f.context.session = { itemId: "manager", data: { name: "Manager", role: { canManagePayments: true } } };
 f.context.prisma.payment.findFirst = async ({ where }: any) => where.providerPaymentId === f.payment.providerPaymentId && where.paymentProviderId === f.payment.paymentProviderId ? { ...f.payment, order: f.order } : null;
 const event = { id: "evt_local_refund_recovery", type: "refund.updated", data: { object: { id: "re_local_recovery", payment_intent: "pi_later", amount: 300, currency: "usd", status: "succeeded" } } };
 await assert.rejects(() => handlePaymentProviderWebhook(null, signed(event), f.context), /correlation pending/);
 f.payment.providerPaymentId = "pi_later";
 const result = await retryVerifiedRefundWebhook(null, { eventId: f.inbox[0].id }, f.context);
 assert.deepEqual(result, { success: true, status: "processed", refundCount: 1, alreadyProcessed: false });
 assert.equal(f.inbox[0].status, "processed"); assert.equal(f.inbox[0].attempts, 2);
 assert.equal(f.refunds.length, 1); assert.equal(f.payment.refundedAmount, 300); assert.equal(f.payment.status, "partially_refunded");
 assert.ok([...f.audits.values()].some((entry: any) => entry.eventType === "payment.webhook_refund_replayed"));
 const duplicate = await retryVerifiedRefundWebhook(null, { eventId: f.inbox[0].id }, f.context);
 assert.equal(duplicate.alreadyProcessed, true); assert.equal(f.refunds.length, 1); assert.equal(f.payment.refundedAmount, 300);
 assert.equal([...f.audits.values()].filter((entry: any) => entry.eventType === "payment.webhook_refund_replayed").length, 1);
});
test("local refund recovery refuses ambiguous payment identity and stored-value events", async () => {
 const ambiguous = fixture();
 ambiguous.context.session = { itemId: "manager", data: { name: "Manager", role: { canManagePayments: true } } };
 ambiguous.context.prisma.payment.findFirst = async () => null;
 const event = { id: "evt_ambiguous_refund", type: "refund.updated", data: { object: { id: "re_ambiguous", payment_intent: "pi_later", amount: 200, currency: "usd", status: "succeeded" } } };
 await assert.rejects(() => handlePaymentProviderWebhook(null, signed(event), ambiguous.context), /correlation pending/);
 ambiguous.payment.providerPaymentId = "pi_later";
 ambiguous.context.prisma.payment.findMany = async () => [{ ...ambiguous.payment, order: ambiguous.order }, { ...ambiguous.payment, id: "duplicate", order: ambiguous.order }];
 await assert.rejects(() => retryVerifiedRefundWebhook(null, { eventId: ambiguous.inbox[0].id }, ambiguous.context), /multiple payments/);
 assert.equal(ambiguous.refunds.length, 0); assert.equal(ambiguous.inbox[0].status, "failed");

 const gift = fixture();
 gift.context.session = { itemId: "manager", data: { name: "Manager", role: { canManagePayments: true } } };
 gift.context.prisma.payment.findFirst = async () => null;
 await assert.rejects(() => handlePaymentProviderWebhook(null, signed(event), gift.context), /correlation pending/);
 gift.payment.providerPaymentId = "pi_later"; gift.payment.data = { purpose: "online_gift_purchase" }; gift.order.orderSource = "gift_card";
 gift.context.prisma.payment.findMany = async () => [{ ...gift.payment, order: gift.order }];
 await assert.rejects(() => retryVerifiedRefundWebhook(null, { eventId: gift.inbox[0].id }, gift.context), /dedicated provider-reconciliation/);
 assert.equal(gift.refunds.length, 0); assert.equal(gift.inbox[0].status, "failed");

 const mismatch = fixture();
 mismatch.context.session = { itemId: "manager", data: { name: "Manager", role: { canManagePayments: true } } };
 mismatch.context.prisma.payment.findFirst = async () => null;
 const mismatchEvent = { id: "evt_mismatched_refund", type: "charge.refunded", data: { object: {
  id: "ch_mismatch", payment_intent: "pi_later", currency: "usd",
  refunds: { has_more: false, data: [{ id: "re_wrong_intent", payment_intent: "pi_other", amount: 100, currency: "usd", status: "succeeded" }] },
 } } };
 await assert.rejects(() => handlePaymentProviderWebhook(null, signed(mismatchEvent), mismatch.context), /correlation pending/);
 mismatch.payment.providerPaymentId = "pi_later";
 await assert.rejects(() => retryVerifiedRefundWebhook(null, { eventId: mismatch.inbox[0].id }, mismatch.context), /does not match the event payment intent/);
 assert.equal(mismatch.refunds.length, 0); assert.equal(mismatch.inbox[0].status, "failed");
});
test("local refund recovery requires a manager and fails closed on incomplete refund pages", async () => {
 const unauthorized = fixture();
 unauthorized.context.session = { itemId: "staff", data: { name: "Staff", role: { canManagePayments: false } } };
 let transactionCalls = 0;
 unauthorized.context.transaction = async (operation: any) => { transactionCalls++; return operation({ prisma: unauthorized.context.prisma }); };
 await assert.rejects(() => retryVerifiedRefundWebhook(null, { eventId: "missing" }, unauthorized.context), /Not authorized/);
 assert.equal(transactionCalls, 0);

 const f = fixture();
 f.context.session = { itemId: "manager", data: { name: "Manager", role: { canManagePayments: true } } };
 f.context.prisma.payment.findFirst = async ({ where }: any) => where.providerPaymentId === f.payment.providerPaymentId && where.paymentProviderId === f.payment.paymentProviderId ? { ...f.payment, order: f.order } : null;
 const event = { id: "evt_incomplete_refund_recovery", type: "charge.refunded", data: { object: {
  id: "ch_incomplete", payment_intent: "pi_later", currency: "usd",
  refunds: { has_more: true, data: [{ id: "re_partial_list", amount: 300, currency: "usd", status: "succeeded" }] },
 } } };
 await assert.rejects(() => handlePaymentProviderWebhook(null, signed(event), f.context), /correlation pending/);
 f.payment.providerPaymentId = "pi_later";
 await assert.rejects(() => retryVerifiedRefundWebhook(null, { eventId: f.inbox[0].id }, f.context), /complete refund list/);
 assert.equal(f.inbox[0].status, "failed"); assert.equal(f.refunds.length, 0); assert.equal(f.payment.refundedAmount, 0);
});
