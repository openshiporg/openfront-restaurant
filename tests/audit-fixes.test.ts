import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Stripe from "stripe";
import { assertOnlineOrderingCapacity } from "../features/keystone/utils/orderingCapacity";
import handlePaymentProviderWebhook from "../features/keystone/mutations/handlePaymentProviderWebhook";

// Offline: synthetic signature fixtures, no database and no provider call.
const secret = "offline_webhook_fixture_secret";
process.env.STRIPE_SECRET_KEY = "sk_test_offline_fixture_only";
process.env.STRIPE_WEBHOOK_SECRET = secret;
const stripe = new Stripe("sk_test_offline_fixture_only");
function signed(event: any) { const rawBody = JSON.stringify(event); return { providerCode: "pp_stripe_stripe", event, rawBody, headers: { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret }) } }; }
function webhookFixture() {
  const inbox: any[] = [];
  const provider = { id: "provider", code: "pp_stripe_stripe", isInstalled: true, handleWebhookFunction: "stripe", getPaymentStatusFunction: "stripe" };
  const prisma: any = {
    payment: { findMany: async () => [] },
    paymentSession: { findFirst: async () => null },
    paymentWebhookEvent: {
      update: async ({ where, data }: any) => { const row = inbox.find(r => r.id === where.id); Object.assign(row, { ...data, attempts: row.attempts + 1 }); return row; },
      updateMany: async ({ where, data }: any) => { const row = inbox.find(r => r.id === where.id && !where.status.notIn.includes(r.status)); if (!row) return { count: 0 }; Object.assign(row, { ...data, attempts: row.attempts + 1 }); return { count: 1 }; },
    },
  };
  const context: any = { prisma, sudo: () => ({ query: {
    PaymentProvider: { findMany: async () => [provider] },
    Payment: { findMany: async () => [] },
    PaymentWebhookEvent: { findMany: async ({ where }: any) => inbox.filter(r => r.eventKey === where.eventKey.equals), createOne: async ({ data }: any) => { const row = { id: `inbox-${inbox.length}`, ...data }; inbox.push(row); return row; } },
  } }) };
  return { context, inbox };
}

test("a paid online gift card is issued from the provider's payment event, once per delivery", async () => {
  const f = webhookFixture(); const issued: string[] = [];
  const event = { id: "evt_gift", type: "payment_intent.succeeded", data: { object: { id: "pi_gift", object: "payment_intent", amount: 5000, amount_received: 5000, currency: "usd", metadata: { purpose: "gift_card" } } } };
  const adapters = { issuePaidGiftCard: async (id: string) => { issued.push(id); return {} as any; } };
  assert.deepEqual(await handlePaymentProviderWebhook(null, signed(event), f.context, adapters), { success: true, error: null });
  assert.deepEqual(issued, ["pi_gift"]); assert.equal(f.inbox[0].status, "processed");
  // A failure to issue is not acknowledged, so the provider sends the event again.
  const g = webhookFixture();
  await assert.rejects(handlePaymentProviderWebhook(null, signed(event), g.context, { issuePaidGiftCard: async () => { throw new Error("database busy"); } }), /database busy/);
  assert.equal(g.inbox[0].status, "failed");
});

test("an event for an attempt that never became a payment is acknowledged; a success or refund is still retried", async () => {
  const f = webhookFixture();
  const declined = { id: "evt_declined", type: "payment_intent.payment_failed", data: { object: { id: "pi_abandoned", object: "payment_intent", amount: 1000, currency: "usd", metadata: {} } } };
  assert.deepEqual(await handlePaymentProviderWebhook(null, signed(declined), f.context), { success: true, error: null });
  assert.equal(f.inbox[0].status, "ignored");
  assert.deepEqual(await handlePaymentProviderWebhook(null, signed(declined), f.context), { success: true, error: null });
  const paid = { id: "evt_paid", type: "payment_intent.succeeded", data: { object: { id: "pi_unknown", object: "payment_intent", amount: 1000, amount_received: 1000, currency: "usd", metadata: {} } } };
  await assert.rejects(handlePaymentProviderWebhook(null, signed(paid), f.context), /correlation pending/);
  const refund = { id: "evt_refund", type: "refund.updated", data: { object: { id: "re_1", payment_intent: "pi_unknown", amount: 200, currency: "usd", status: "succeeded" } } };
  await assert.rejects(handlePaymentProviderWebhook(null, signed(refund), f.context), /correlation pending/);
});

test("an unpaid checkout stops holding an online order slot after 30 minutes; uncertain ones keep it", async () => {
  let where: any;
  const tx = { storeSettings: { findUnique: async () => ({ hours: { _ordering: { maxActiveOnlineOrders: 5 } } }) }, restaurantOrder: { count: async () => 0 }, paymentSession: { count: async (args: any) => { where = args.where; return 0; } } };
  const before = Date.now();
  await assertOnlineOrderingCapacity(tx);
  const byState = Object.fromEntries(where.OR.map((row: any) => [row.data.equals, row.createdAt]));
  for (const state of ["initializing", "ready"]) {
    const cutoff = byState[state].gte.getTime();
    assert.ok(cutoff >= before - 30 * 60 * 1000 - 5 && cutoff <= Date.now() - 30 * 60 * 1000 + 5);
  }
  for (const state of ["provider_pending", "unknown", "finalizing", "cancelling"]) { assert.ok(state in byState); assert.equal(byState[state], undefined); }
});

test("source rules: a charged shopper is never refused for a used-up promo, and the gift email does not promise online use", () => {
  const complete = fs.readFileSync("features/keystone/mutations/completeActiveCart.ts", "utf8");
  assert.match(complete, /if \(!claimed && isManual\) throw/);
  const gift = fs.readFileSync("features/keystone/mutations/storefrontPublic.ts", "utf8");
  assert.doesNotMatch(gift, /Enter it at checkout/);
  assert.match(gift, /paymentProviderId: provider\?\.id \|\| null/);
  const button = fs.readFileSync("features/storefront/modules/checkout/components/payment-button/index.tsx", "utf8");
  assert.match(button, /confirmError\?\.payment_intent\?\.status/);
});

test("source rules: refund recovery fails a refund the provider never made; closing the card form cancels the attempt", () => {
  const refund = fs.readFileSync("features/keystone/mutations/refundPayment.ts", "utf8");
  assert.match(refund, /reservation\.refund\.status === "unknown"[^\n]*pp_stripe_stripe/);
  assert.match(refund, /observed\.refundsComplete === true/);
  const pos = fs.readFileSync("features/platform/pos/screens/[orderId]/payment/PaymentClient.tsx", "utf8");
  assert.match(pos, /onOpenChange=\{\(open\) => !open && closeCardSession\(\)\}/);
  assert.match(fs.readFileSync("features/keystone/mutations/index.ts", "utf8"), /cancelPaymentAttempt: cancelPaymentAttemptMutation/);
});
