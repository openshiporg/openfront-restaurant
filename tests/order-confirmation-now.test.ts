import test from "node:test";
import assert from "node:assert/strict";
import { deliverOrderConfirmationNow, deliverQueuedNotification } from "../features/keystone/utils/restaurantNotifications";

// Offline audit-event store with just the calls the delivery state machine makes.
function fixture() {
  const rows: any[] = [
    { id: "n1", eventKey: "notification:order-confirmed:o1", eventType: "notification.queued", entityType: "RestaurantOrder", entityId: "o1", createdAt: new Date(), metadata: { to: "delivered@resend.dev", subject: "Order R-1 received", text: "received" } },
    { id: "n2", eventKey: "notification:order-confirmed:o2", eventType: "notification.queued", entityType: "RestaurantOrder", entityId: "o2", createdAt: new Date(), metadata: { to: "other@resend.dev", subject: "Order R-2 received", text: "received" } },
    { id: "g1", eventKey: "gift-delivery:g1", eventType: "notification.queued", entityType: "GiftCard", entityId: "g1", createdAt: new Date(), metadata: { to: "gift@resend.dev", subject: "gift", text: "gift" } },
  ];
  const tx = {
    auditEvent: {
      findUnique: async ({ where }: any) => rows.find((r) => (where.id ? r.id === where.id : r.eventKey === where.eventKey)) || null,
      findMany: async ({ where }: any) => rows.filter((r) => r.entityType === where.entityType && r.entityId === where.entityId),
      upsert: async ({ where, create }: any) => {
        const existing = rows.find((r) => r.eventKey === where.eventKey);
        if (existing) return existing;
        const row = { id: `a${rows.length}`, createdAt: new Date(), ...create }; rows.push(row); return row;
      },
    },
    giftCard: { findUnique: async () => null },
  };
  const context: any = { session: undefined, prisma: { ...tx, $transaction: async (fn: any) => fn(tx) } };
  return { rows, context };
}
const status = (rows: any[], id: string) => rows.filter((r) => r.entityType === "RestaurantNotification" && r.entityId === id).sort((a, b) => b.metadata.sequence - a.metadata.sequence)[0]?.metadata?.status;

test("sends this order's confirmation once and records accepted with the provider reference", async () => {
  const { rows, context } = fixture(); const sent: any[] = [];
  const transport = async (m: any) => { sent.push(m); return { accepted: true, reference: "<ref@resend>" }; };
  const out = await deliverOrderConfirmationNow(context, "o1", transport);
  assert.equal(out.status, "accepted");
  assert.equal(sent.length, 1); assert.equal(sent[0].to, "delivered@resend.dev");
  assert.equal(status(rows, "n1"), "accepted");
  assert.equal(rows.find((r) => r.eventType === "notification.accepted").metadata.reference, "<ref@resend>");
});

test("a second call (replay) and the staff Send button do not resend an accepted row", async () => {
  const { context } = fixture(); let calls = 0;
  const transport = async () => { calls += 1; return { accepted: true }; };
  await deliverOrderConfirmationNow(context, "o1", transport);
  await deliverOrderConfirmationNow(context, "o1", transport);
  assert.equal(calls, 1);
  const staff: any = { ...context, session: { itemId: "m", data: { role: { canManageOrders: true } } } };
  assert.equal((await deliverQueuedNotification(staff, "n1", transport, false)).status, "accepted");
  assert.equal(calls, 1);
});

test("other queued rows (other orders, gifts, campaigns) are never touched", async () => {
  const { rows, context } = fixture();
  await deliverOrderConfirmationNow(context, "o1", async () => ({ accepted: true }));
  for (const id of ["n2", "g1"]) assert.equal(status(rows, id), undefined);
  // The system path cannot be pointed at a non-confirmation row.
  await assert.rejects(deliverQueuedNotification(context, "g1", async () => ({ accepted: true }), false, true), /limited to order confirmations/);
});

test("a rejected or throwing transport never throws and is recorded for staff review", async () => {
  const a = fixture();
  assert.equal((await deliverOrderConfirmationNow(a.context, "o1", async () => ({ accepted: false }))).status, "failed");
  assert.equal(status(a.rows, "n1"), "failed");
  const b = fixture();
  assert.equal((await deliverOrderConfirmationNow(b.context, "o1", async () => { throw new Error("socket"); })).status, "unknown");
  assert.equal(status(b.rows, "n1"), "unknown");
});

test("no queued row for the order is a no-op", async () => {
  const { context } = fixture();
  assert.equal((await deliverOrderConfirmationNow(context, "missing", async () => ({ accepted: true }))).status, "no_event");
});
