import test from "node:test";
import assert from "node:assert/strict";
import { splitCheckByItem, mergeChecks } from "../features/keystone/mutations/splitCheck";
import { recordedDeliveryCharge } from "../features/keystone/utils/orderPricingPolicy";

function harness() {
  const policy = { version: 1, taxRate: 7.5, currencyCode: "USD", deliveryFee: 501, deliveryMinimum: 0, pickupDiscount: null, serviceCharge: 0, taxBasis: "item-subtotal-before-discount", voluntaryTip: true, legacyInferred: false };
  let state: any = {
    orders: [{ id: "source", orderNumber: "original", orderType: "delivery", status: "ready", subtotal: 1000, tax: 75, tip: 101, discount: 0, total: 1677, currencyCode: "USD", tables: [], payments: [], orderItems: [{ id: "first", quantity: 1, price: 400 }, { id: "second", quantity: 1, price: 600 }] }],
    events: [{ eventKey: "pricing-policy:source", after: policy }], adjustments: [],
  };
  function delegates(draft: any) {
    return {
      auditEvent: { findUnique: async ({ where }: any) => draft.events.find((event: any) => event.eventKey === where.eventKey), upsert: async ({ where, create }: any) => { const prior = draft.events.find((event: any) => event.eventKey === where.eventKey); if (prior) return prior; draft.events.push(create); return create; } },
      restaurantOrder: {
        findUnique: async ({ where }: any) => draft.orders.find((order: any) => order.id === where.id), findMany: async () => draft.orders,
        create: async ({ data }: any) => { const order = { ...data, id: "new", orderItems: [], tables: [], payments: [] }; draft.orders.push(order); return order; },
        update: async ({ where, data }: any) => { const order = draft.orders.find((order: any) => order.id === where.id); Object.assign(order, data); return order; },
      },
      orderAdjustment: { findFirst: async ({ where }: any) => [...draft.adjustments].reverse().find((row: any) => (!where.orderId || row.orderId === where.orderId) && row.idempotencyKey.startsWith(where.idempotencyKey.startsWith)) || null, findUnique: async ({ where }: any) => draft.adjustments.find((item: any) => item.idempotencyKey === where.idempotencyKey), create: async ({ data }: any) => { draft.adjustments.push(data); return data; } },
      payment: { count: async () => 0 },
      orderItem: { update: async ({ where, data }: any) => { const owner = draft.orders.find((order: any) => order.orderItems.some((item: any) => item.id === where.id)); const line = owner.orderItems.find((item: any) => item.id === where.id); owner.orderItems = owner.orderItems.filter((item: any) => item.id !== line.id); Object.assign(line, data); draft.orders.find((order: any) => order.id === data.orderId).orderItems.push(line); } },
      kitchenTicket: { findMany: async () => [] },
    };
  }
  const prisma: any = { auditEvent: { upsert: (args: any) => delegates(state).auditEvent.upsert(args) }, $transaction: async (fn: any) => { const draft = structuredClone(state); const result = await fn(delegates(draft)); state = draft; return result; } };
  const context: any = { session: { itemId: "staff", data: { isActive: true, role: { canManageOrders: true } } }, prisma, sudo: () => ({ query: { RestaurantOrder: { findOne: async () => null } } }) };
  return { context, state: () => state };
}
test("item split conserves captured tax, delivery fee, tip and total and clones original pricing policy", async () => {
  const h = harness();
  const result = await splitCheckByItem(null, { orderId: "source", itemIds: ["first"] }, h.context);
  assert.equal(result.success, true, result.error || "");
  const [original, split] = h.state().orders;
  assert.equal(original.total + split.total, 1677); assert.equal(original.tax + split.tax, 75);
  assert.equal(recordedDeliveryCharge(original) + recordedDeliveryCharge(split), 501);
  assert.equal(split.total, 670); assert.equal(split.tip, 40);
  assert.deepEqual(h.state().events.find((event: any) => event.eventKey === "pricing-policy:new").after, h.state().events[0].after);
  const retry = await splitCheckByItem(null, { orderId: "source", itemIds: ["first"] }, h.context);
  assert.equal(retry.success, true); assert.equal(h.state().orders.length, 2);
});
test("merge rejects incompatible captured tax policy without moving items or money", async () => {
  const h = harness(); await splitCheckByItem(null, { orderId: "source", itemIds: ["first"] }, h.context);
  h.state().events.find((event: any) => event.eventKey === "pricing-policy:new").after.taxRate = 9;
  const before = structuredClone(h.state());
  const result = await mergeChecks(null, { orderId: "source", sourceOrderId: "new" }, h.context);
  assert.match(result.error!, /different recorded pricing/); assert.deepEqual(h.state(), before);
});
test("compatible merge preserves both assessed delivery charges and complete totals", async () => {
  const h = harness(); await splitCheckByItem(null, { orderId: "source", itemIds: ["first"] }, h.context);
  const result = await mergeChecks(null, { orderId: "source", sourceOrderId: "new" }, h.context);
  assert.equal(result.success, true, result.error || "");
  const [target, source] = h.state().orders;
  assert.equal(target.total, 1677); assert.equal(recordedDeliveryCharge(target), 501);
  assert.equal(source.total, 0); assert.equal(source.status, "cancelled"); assert.equal(target.orderItems.length, 2);
});
test("delivery checks in transit cannot be split into duplicate handoff obligations", async () => {
  const h = harness(); h.state().orders[0].status = "dispatched";
  const result = await splitCheckByItem(null, { orderId: "source", itemIds: ["first"] }, h.context);
  assert.equal(result.success, false); assert.equal(h.state().orders.length, 1);
});
