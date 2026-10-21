import test from "node:test";
import assert from "node:assert/strict";
import { nextPaymentStatus, webhookPaymentStatus, stripeRefundReference, equalTenderAmounts, firstSettlementTime, allocateTenderTip, refundedTipValue } from "../features/keystone/utils/paymentState";
import refundPayment from "../features/keystone/mutations/refundPayment";
import { approveManagerApproval, requestManagerApproval } from "../features/keystone/utils/managerApproval";
import { idempotencyFingerprint } from "../features/keystone/utils/idempotency";

test("reordered success/failure/authorization observations cannot erase captured/refunded money", () => {
  for (const settled of ["succeeded", "partially_refunded", "refunded"]) for (const event of ["failed", "cancelled", "processing", "authorized", "succeeded"]) assert.equal(nextPaymentStatus(settled, event), settled);
  assert.equal(nextPaymentStatus("unknown", "succeeded"), "succeeded");
  assert.equal(nextPaymentStatus("failed", "succeeded"), "succeeded");
  assert.equal(webhookPaymentStatus("CHECKOUT.ORDER.APPROVED"), "authorized");
  assert.equal(webhookPaymentStatus("PAYMENT.CAPTURE.COMPLETED"), "succeeded");
});
test("Stripe refund identity cannot confuse charge and intent", () => {
  assert.deepEqual(stripeRefundReference("ch_sale"), { charge: "ch_sale" });
  assert.deepEqual(stripeRefundReference("pi_sale"), { payment_intent: "pi_sale" });
  assert.throws(() => stripeRefundReference("paypal-capture"));
});

function fixture() {
  let refunds: any[] = []; const attempts: any[] = []; const approvals: any[] = []; const receipts = new Map();
  const payment: any = { id: "payment", amount: 1000, refundedAmount: 0, status: "succeeded", paymentMethod: "cash", currencyCode: "USD", orderId: "order" };
  let queue = Promise.resolve(); let failReceipt = false;
  const db: any = {
    orderAdjustment: { findFirst: async () => null },
    restaurantOrder: { findUnique: async () => ({ id: "order", customerId: null }) },
    payment: { findUnique: async () => ({ ...payment }), update: async ({ data }: any) => Object.assign(payment, data) },
    refund: {
      findUnique: async ({ where }: any) => refunds.find(r => where.id ? r.id === where.id : r.idempotencyKey === where.idempotencyKey),
      findMany: async ({ where }: any) => refunds.filter(r => r.paymentId === where.paymentId && (!where.status || (typeof where.status === "string" ? r.status === where.status : where.status.in.includes(r.status))) && (!where.providerRefundId || r.providerRefundId === where.providerRefundId)),
      create: async ({ data }: any) => { const row = { id: `refund-${refunds.length}`, ...data }; refunds.push(row); return row; },
      update: async ({ where, data }: any) => Object.assign(refunds.find(r => r.id === where.id), data),
      updateMany: async ({ where, data }: any) => { const row = refunds.find(r => r.id === where.id && where.status.in.includes(r.status)); if (row) Object.assign(row, data); return { count: row ? 1 : 0 }; },
    },
    managerApproval: {
      findUnique: async ({ where }: any) => approvals.find(r => r.id === where.id),
      create: async ({ data }: any) => { const row = { id: `approval-${approvals.length}`, ...data }; approvals.push(row); return row; },
      update: async ({ where, data }: any) => Object.assign(approvals.find(r => r.id === where.id), data),
      updateMany: async ({ where, data }: any) => { const row = approvals.find(r => r.id === where.id && r.status === where.status); if (row) Object.assign(row, data); return { count: row ? 1 : 0 }; },
    },
    idempotencyKey: { findUnique: async ({ where }: any) => attempts.find(r => r.idempotencyKey === where.idempotencyKey), create: async ({ data }: any) => { const row = { id: `attempt-${attempts.length}`, ...data }; attempts.push(row); return row; }, update: async ({ where, data }: any) => Object.assign(attempts.find(r => r.id === where.id), data) },
    auditEvent: { upsert: async () => ({}) },
    receipt: { upsert: async ({ where, create }: any) => { if (failReceipt) { failReceipt = false; throw new Error("receipt storage interrupted"); } if (!receipts.has(where.receiptNumber)) receipts.set(where.receiptNumber, create); return receipts.get(where.receiptNumber); } },
    $transaction: async (fn: any) => { const run = queue.then(async () => { const before = structuredClone({ refunds, payment, approvals }); try { return await fn(db); } catch (error) { refunds = before.refunds; Object.assign(payment, before.payment); approvals.splice(0, approvals.length, ...before.approvals); throw error; } }); queue = run.catch(() => {}); return run; },
  };
  const context: any = { prisma: db, session: { itemId: "cashier", data: { role: { canManagePayments: true } } }, sudo: () => ({ query: { Payment: { findOne: async () => ({ ...payment, order: { id: "order", orderNumber: "1" } }) } } }) };
  function args(key: string, amount: number) { const requestPayload = { actionType: "refund_payment", targetId: "payment", reason: "return", amount }; const id = `approval-${key}`; approvals.push({ id, requestPayload, requestFingerprint: idempotencyFingerprint(requestPayload), requestedById: "cashier", approvedById: "manager", status: "approved", expiresAt: new Date(Date.now() + 60000) }); return { paymentId: "payment", amount, reason: "return", idempotencyKey: key, managerApprovalId: id }; }
  return { context, payment, receipts, approvals, args, failNextReceipt: () => { failReceipt = true; } };
}
test("unauthorized refund fails before persistence", async () => { const result = await refundPayment(null, { paymentId: "p", amount: 1, reason: "r", idempotencyKey: "k" }, { session: undefined } as any); assert.equal(result.success, false); assert.match(result.error!, /authorized/); });
test("concurrent distinct partial refunds retain aggregate and duplicate finalization stays one receipt", async () => {
  const f = fixture(); const a = f.args("a", 300), b = f.args("b", 200);
  const results = await Promise.all([refundPayment(null, a, f.context), refundPayment(null, b, f.context)]);
  assert.ok(results.every(r => r.success), JSON.stringify(results)); assert.equal(f.payment.refundedAmount, 500); assert.equal(f.payment.status, "partially_refunded"); assert.equal(f.receipts.size, 2);
  assert.equal((await refundPayment(null, a, f.context)).success, true); assert.equal(f.payment.refundedAmount, 500); assert.equal(f.receipts.size, 2);
  const over = await refundPayment(null, f.args("over", 501), f.context); assert.equal(over.success, false); assert.equal(f.payment.refundedAmount, 500);
});
test("interrupted finalization retains unknown reservation and retries same approval/key", async () => {
  const f = fixture(); const args = f.args("recovery", 400); f.failNextReceipt();
  const first = await refundPayment(null, args, f.context); assert.equal(first.success, false); assert.equal(first.status, "unknown"); assert.ok(first.refundId); assert.equal(f.payment.refundedAmount, 0);
  const next = await refundPayment(null, args, f.context); assert.equal(next.success, true); assert.equal(f.payment.refundedAmount, 400); assert.equal(f.receipts.size, 1);
});
test("same key cannot refund a changed amount", async () => { const f = fixture(); const args = f.args("fixed", 100); await refundPayment(null, args, f.context); const result = await refundPayment(null, { ...args, amount: 200 }, f.context); assert.equal(result.success, false); assert.equal(f.payment.refundedAmount, 100); });
test("ordinary payment operators can request but cannot approve; managers cannot approve themselves", async () => {
 const f = fixture(); const requested = await requestManagerApproval(null, { actionType: "refund_payment", targetId: "payment", reason: "return", amount: 20 }, f.context);
 f.context.session.itemId = "other-cashier";
 await assert.rejects(() => approveManagerApproval(null, { approvalId: requested.id }, f.context), /authorized/);
 f.context.session.data.role.canManageStaff = true; f.context.session.itemId = "cashier";
 await assert.rejects(() => approveManagerApproval(null, { approvalId: requested.id }, f.context), /own correction/);
 f.context.session.itemId = "manager"; const approved = await approveManagerApproval(null, { approvalId: requested.id }, f.context); assert.equal(approved.status, "approved");
});

test("equal guest tender plan conserves remainder cents without zero tenders", () => { assert.deepEqual(equalTenderAmounts(1000, 3), [334, 333, 333]); assert.throws(() => equalTenderAmounts(1, 2)); assert.throws(() => equalTenderAmounts(1000, 0)); });

test("delayed and reordered events never move first settlement into another business day", () => { const paidAt = new Date("2026-09-05T02:00:00Z"); const nextDay = new Date("2026-09-06T12:00:00Z"); for (const delayed of ["failed", "authorized", "succeeded"]) assert.equal(firstSettlementTime(paidAt, nextPaymentStatus("succeeded", delayed), nextDay), paidAt); assert.equal(firstSettlementTime(null, "succeeded", nextDay), nextDay); });

test("split tenders allocate one tip with remainder conservation and refund reversal", () => {
 const first = allocateTenderTip(101, 1101, 500, 601, []); const second = allocateTenderTip(101, 1101, 601, 0, [{ amount: 500, tipAmount: first, refundedAmount: 0 }]); assert.equal(first + second, 101);
 const original = { amount: 1000, tipAmount: 100, refundedAmount: 200 }; assert.equal(refundedTipValue(original), 20); assert.equal(allocateTenderTip(100, 1000, 200, 0, [original]), 20);
});
