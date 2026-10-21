import test from "node:test";
import assert from "node:assert/strict";


import { reserveGiftRefundValue } from "../features/keystone/utils/giftRefundReserve";
import { finalizeRefundWithClient } from "../features/keystone/utils/refundLedger";
import { previewRestaurantCampaign, createRestaurantCampaign, dispatchRestaurantCampaign } from "../features/keystone/mutations/restaurantCampaigns";
import { deliverQueuedNotification } from "../features/keystone/utils/restaurantNotifications";

// In-memory transaction scheduling and rollback only; no Keystone root, database,
// environment credentials, network or live provider is loaded by these tests.
function fixture() {
  const rows: Record<string, any[]> = {}; let sequence = 0, fail = ""; let queue = Promise.resolve();
  const db: any = {};
  const match = (row: any, where: any): boolean => Object.entries(where || {}).every(([key, value]: any) => value?.path ? value.path.reduce((out: any, part: string) => out?.[part], row[key]) === value.equals : value?.in ? value.in.includes(row[key]) : value?.gte ? new Date(row[key]) >= value.gte : typeof value === "object" && value?.startsWith ? String(row[key]).startsWith(value.startsWith) : row[key] === value);
  for (const name of ["storeSettings", "paymentProvider", "payment", "restaurantOrder", "giftCard", "giftCardTransaction", "auditEvent", "receipt", "refund", "user", "orderAdjustment"]) {
    rows[name] = [];
    const find = (where: any) => rows[name].find(row => match(row, where));
    const listed = ({ where, orderBy, take }: any) => { const found = rows[name].filter(row => match(row, where)); if (orderBy) found.reverse(); return found.slice(0, take || found.length); };
    const create = async ({ data }: any) => { if (fail === name) { fail = ""; throw new Error("local persistence interrupted"); } const row = { id: `${name}-${++sequence}`, createdAt: new Date(), occurredAt: new Date(), ...data }; rows[name].push(row); return row; };
    db[name] = { create, count: async ({ where }: any) => rows[name].filter(row => match(row, where)).length,
      findMany: async (args: any) => listed(args), findFirst: async (args: any) => listed(args)[0] || null,
      findUnique: async ({ where, include }: any) => { const row = find(where); if (!row) return null; return { ...row, ...(include?.giftCard ? { giftCard: rows.giftCard.find(gift => gift.id === row.giftCardId) } : {}), ...(include?.order ? { order: rows.restaurantOrder.find(order => order.id === row.orderId) } : {}), ...(include?.paymentProvider ? { paymentProvider: rows.paymentProvider.find(provider => provider.id === row.paymentProviderId) } : {}) }; },
      update: async ({ where, data }: any) => Object.assign(find(where), data),
      updateMany: async ({ where, data }: any) => { const found = rows[name].filter(row => match(row, where)); found.forEach(row => Object.assign(row, data)); return { count: found.length }; },
      upsert: async ({ where, create: data }: any) => find(where) || create({ data }),
    };
  }
  db.$transaction = async (fn: any) => { const next = queue.then(async () => { const snapshot = structuredClone(rows); try { return await fn(db); } catch (error) { for (const key of Object.keys(rows)) rows[key] = snapshot[key]; throw error; } }); queue = next.catch(() => {}); return next; };
  rows.storeSettings.push({ id: 1, currencyCode: "USD" }); rows.paymentProvider.push({ id: "stripe", code: "pp_stripe_stripe", isInstalled: true, createPaymentFunction: "stripe", getPaymentStatusFunction: "stripe" });
  const context: any = { prisma: db, req: { socket: { remoteAddress: "192.0.2.42" } }, session: { itemId: "manager", data: { role: { canManageUsers: true, canManageOrders: true, canManagePayments: true, canManageGiftCards: true } } } };
  const input = { token: "a".repeat(64), amount: 2500, buyerEmail: "buyer@example.test", recipientEmail: "recipient@example.test", message: "Happy birthday" };
  const createAdapter: any = { createPayment: async () => ({ paymentIntentId: "pi_offline", clientSecret: "offline_client_secret" }) };
  const statusAdapter: any = { getPaymentStatus: async () => ({ status: "succeeded", amount: 2500, data: { currency: "usd" }, refunds: [], refundsComplete: true }) };
  const consent = (id: string, action = "marketing_opt_in") => { rows.auditEvent.push({ id: `consent-${++sequence}`, entityType: "CustomerPrivacy", entityId: id, eventType: `privacy.${action}`, occurredAt: new Date(), after: { purpose: "restaurant_marketing", channel: "authenticated_account" } }); };
  return { db, rows, context, input, createAdapter, statusAdapter, consent, failNext: (name: string) => { fail = name; } };
}







test("campaign preview excludes absent, revoked and erasure-requested consent; unauthorized managers cannot probe customers", async () => {
  const f = fixture(); for (const id of ["yes", "no", "revoked", "erased"]) f.rows.user.push({ id, email: `${id}@example.test`, isActive: true, staffRole: null });
  f.consent("yes"); f.consent("revoked"); f.consent("revoked", "marketing_opt_out"); f.consent("erased"); f.consent("erased", "request_erasure");
  const preview = await previewRestaurantCampaign(null, {}, f.context); assert.deepEqual(preview.recipients.map(row => row.id), ["yes"]);
  f.context.session.data.role.canManageUsers = false; await assert.rejects(() => previewRestaurantCampaign(null, {}, f.context), /required/);
});
test("campaign queue is immutable and send-time opt-out suppresses transport with an audited terminal outcome", async () => {
  const f = fixture(); f.rows.user.push({ id: "customer", email: "customer@example.test", isActive: true, staffRole: null }); f.consent("customer");
  const args = { requestKey: "campaign-123", subject: "Restaurant news", text: "New seasonal dishes", customerIds: ["customer"] }; const campaign = await createRestaurantCampaign(null, args, f.context); assert.equal(campaign.queued, 1); assert.equal((await createRestaurantCampaign(null, args, f.context)).id, campaign.id);
  await assert.rejects(() => createRestaurantCampaign(null, { ...args, text: "Changed" }, f.context), /different content/);
  f.consent("customer", "marketing_opt_out"); let calls = 0; const result = await dispatchRestaurantCampaign(null, { campaignId: campaign.id }, f.context, async () => { calls++; return { accepted: true }; }); assert.equal(calls, 0); assert.equal(result.outcomes[0].status, "suppressed");
});
test("concurrent campaign dispatch sends accepted messages once and changed address is suppressed", async () => {
  const f = fixture(); f.rows.user.push({ id: "one", email: "one@example.test", isActive: true, staffRole: null }, { id: "two", email: "two@example.test", isActive: true, staffRole: null }); f.consent("one"); f.consent("two");
  const campaign = await createRestaurantCampaign(null, { requestKey: "campaign-456", subject: "News", text: "Seasonal dishes", customerIds: ["one", "two"] }, f.context); f.rows.user[1].email = "changed@example.test";
  let calls = 0; const transport = async () => { calls++; return { accepted: true }; }; await Promise.all([dispatchRestaurantCampaign(null, { campaignId: campaign.id }, f.context, transport), dispatchRestaurantCampaign(null, { campaignId: campaign.id }, f.context, transport)]); assert.equal(calls, 1);
  await dispatchRestaurantCampaign(null, { campaignId: campaign.id }, f.context, transport); assert.equal(calls, 1);
});

test("ten uncertain campaign attempts do not starve a later eligible queued recipient", async () => {
 const f = fixture(); for (let index = 0; index < 11; index++) { const id = `c${index}`; f.rows.user.push({ id, email: `${id}@example.test`, isActive: true, staffRole: null }); f.consent(id); }
 const campaign = await createRestaurantCampaign(null, { requestKey: "campaign-recovery", subject: "News", text: "New dishes", customerIds: f.rows.user.map(row => row.id) }, f.context);
 const notifications = f.rows.auditEvent.filter(row => row.eventType === "notification.queued"); notifications.slice(0, 10).forEach(row => f.rows.auditEvent.push({ id: `unknown-${row.id}`, entityType: "RestaurantNotification", entityId: row.id, metadata: { sequence: 2, status: "unknown" } }));
 let calls = 0; const result = await dispatchRestaurantCampaign(null, { campaignId: campaign.id }, f.context, async () => { calls++; return { accepted: true }; }); assert.equal(calls, 1); assert.equal(result.outcomes[0].status, "accepted");
});
