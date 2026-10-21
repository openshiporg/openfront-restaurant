import test from "node:test";
import assert from "node:assert/strict";
import { assertCorrectedBalanceCoversCapturedPayments, assertMutableServiceOrder, assertServiceItemCorrectionAllowed, assertServiceTransition, serviceTransaction, assertTablesAvailable } from "../features/keystone/utils/serviceOrderState";
import { reservationIntervalsOverlap, assertReservationWindow } from "../features/keystone/utils/serviceSeating";
import { mapOrderItemsByStation, getUncoveredKitchenWorkItems, reconcileRestaurantOrderStatus } from "../features/keystone/utils/kitchenTicketSync";
import { recalculateServiceOrder } from "../features/keystone/utils/serviceOrderTotals";
import transitionRestaurantOrder from "../features/keystone/mutations/transitionRestaurantOrder";
import { updateKitchenTicketStatus, fulfillKitchenTicketItem } from "../features/keystone/mutations/kdsTickets";
const paid = { status: "served", total: 100, payments: [{ status: "succeeded", amount: 100 }], courses: [] };
test("all close paths require fulfilled service and complete, certain, net payment", () => {
  assert.throws(() => assertServiceTransition({ ...paid, payments: [] }, "completed"), /payment/);
  assert.throws(() => assertServiceTransition({ ...paid, payments: [{ status: "succeeded", amount: 99 }] }, "completed"), /payment/);
  assert.throws(() => assertServiceTransition({ ...paid, status: "ready" }, "completed"), /transition/);
  assert.throws(() => assertServiceTransition(paid, "completed", [{ status: "ready" }]), /Kitchen/);
  assert.throws(() => assertServiceTransition({ ...paid, courses: [{ status: "pending" }] }, "completed"), /held/);
  assert.throws(() => assertServiceTransition({ ...paid, payments: [...paid.payments, { status: "unknown", amount: 1 }] }, "completed"), /uncertain/);
  assert.throws(() => assertServiceTransition({ ...paid, payments: [{ status: "partially_refunded", amount: 100, refundedAmount: 1 }] }, "completed"), /payment/);
  assert.doesNotThrow(() => assertServiceTransition(paid, "completed", [{ status: "served" }]));
});
test("handoff and close require ticket coverage for every active item but allow itemless checks", () => {
  const readyOrder = { ...paid, status: "ready", orderType: "dine_in", orderItems: [{ id: "food" }, { id: "voided", isVoided: true }] };
  assert.throws(() => assertServiceTransition(readyOrder, "served", []), /Every active order item needs/);
  assert.throws(() => assertServiceTransition(readyOrder, "served", [{ status: "ready", orderItems: [{ id: "other" }] }]), /Every active order item needs/);
  assert.throws(() => assertServiceTransition(readyOrder, "served", [{ status: "ready", orderItems: [], items: [{ id: "food" }] }]), /Every active order item needs/);
  assert.doesNotThrow(() => assertServiceTransition(readyOrder, "served", [{ status: "ready", orderItems: [{ id: "food" }] }]));
  assert.throws(() => assertServiceTransition({ ...paid, orderItems: [{ id: "food" }] }, "completed", []), /Every active order item needs/);
  assert.doesNotThrow(() => assertServiceTransition({ ...paid, orderItems: [{ id: "food" }] }, "completed", [{ status: "served", items: [{ id: "food" }] }]));
  assert.doesNotThrow(() => assertServiceTransition({ ...paid, orderItems: [] }, "completed", []));
  assert.doesNotThrow(() => assertServiceTransition({ ...paid, orderItems: [{ id: "voided", isVoided: true }] }, "completed", []));
});
test("terminal and tender-reserved charges cannot be edited", () => {
  for (const status of ["served", "completed", "cancelled"]) assert.throws(() => assertMutableServiceOrder({ status }));
  for (const status of ["unknown", "authorized", "processing", "succeeded", "partially_refunded"]) assert.throws(() => assertMutableServiceOrder({ status: "open", payments: [{ status }] }));
  assert.doesNotThrow(() => assertMutableServiceOrder({ status: "open", payments: [{ status: "failed" }] }));
});
test("served service permits only approved payable comps and never reprices below net captured money", () => {
  assert.equal(assertServiceItemCorrectionAllowed({ status: "served", payments: [] }, "comp"), true);
  assert.throws(() => assertServiceItemCorrectionAllowed({ status: "served", payments: [] }, "void"), /cannot be voided/);
  assert.throws(() => assertServiceItemCorrectionAllowed({ status: "served", payments: [{ status: "unknown", amount: 100 }] }, "comp"), /uncertain tenders/);
  assert.doesNotThrow(() => assertCorrectedBalanceCoversCapturedPayments({ payments: [{ status: "partially_refunded", amount: 1000, refundedAmount: 250 }] }, 750));
  assert.throws(() => assertCorrectedBalanceCoversCapturedPayments({ payments: [{ status: "succeeded", amount: 1000 }] }, 999), /below captured payments/);
});
test("corrected totals exclude voids and preserve comp value when another item changes", async () => {
  let written: any;
  const tx = { auditEvent: { findUnique: async () => ({ after: { taxRate: 10 } }) }, restaurantOrder: { findUnique: async () => ({ currencyCode: "USD", orderType: "dine_in", tip: 10, discount: 5, orderItems: [{ quantity: 2, price: 100, adjustmentTotal: 50 }, { quantity: 1, price: 900, isVoided: true }, { quantity: 2, price: 10 }] }), update: async (args: any) => (written = args.data) } };
  await recalculateServiceOrder(tx, "order", { taxRate: 90 });
  assert.deepEqual(written, { subtotal: 170, tax: 17, total: 192 });
});
test("kitchen payload carries modifiers/seat/course and gates held work", () => {
  const item = { id: "i", quantity: 1, itemNameSnapshot: "Burger", kitchenStationSnapshot: "grill", modifiersSnapshot: [{ name: "No dairy" }], seatNumber: 2, courseNumber: 1, course: { status: "fired", onHold: false }, firedAt: "2026-09-05T12:00:00Z" };
  assert.deepEqual(mapOrderItemsByStation({ onHold: true, orderItems: [item] }), {});
  assert.deepEqual(mapOrderItemsByStation({ orderItems: [{ ...item, course: { status: "pending" } }] }), {});
  const ticketItem = mapOrderItemsByStation({ orderItems: [item] }).grill[0];
  assert.equal(ticketItem.modifiers?.[0].name, "No dairy"); assert.equal(ticketItem.seatNumber, 2);
  assert.deepEqual(getUncoveredKitchenWorkItems([ticketItem], [{ status: "served", items: [ticketItem] }]), []);
  const refired = mapOrderItemsByStation({ orderItems: [{ ...item, firedAt: "2026-09-05T12:02:00Z" }] }).grill[0];
  assert.equal(getUncoveredKitchenWorkItems([refired], [{ status: "cancelled", items: [ticketItem] }]).length, 1);
});
test("serialization retry is bounded and never retries unrelated failures", async () => {
  let attempts = 0;
  assert.equal(await serviceTransaction({ $transaction: async (fn: any) => { if (++attempts < 3) throw { code: "P2034" }; return fn({}); } }, async () => 7), 7);
  assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(serviceTransaction({ $transaction: async () => { attempts++; throw new Error("injected line failure"); } }, async () => 7), /line failure/);
  assert.equal(attempts, 1);
});
test("cross-midnight and touching reservation intervals use actual intersection", async () => {
  assert.equal(reservationIntervalsOverlap(new Date("2026-09-06T00:15:00Z"), 60, new Date("2026-09-05T23:45:00Z"), 90), true);
  assert.equal(reservationIntervalsOverlap(new Date("2026-09-06T01:15:00Z"), 60, new Date("2026-09-05T23:45:00Z"), 90), false);
  const tx = { table: { findUnique: async () => ({ capacity: 4 }) }, reservation: { findMany: async () => [{ id: "previous", reservationDate: "2026-09-05T23:45:00Z", duration: 90 }] } };
  await assert.rejects(assertReservationWindow(tx, "table", 2, new Date("2026-09-06T00:15:00Z"), 60), /overlapping/);
});
test("exclusive table allocation rejects occupied resources and insufficient capacity", async () => {
  const tx = { table: { findMany: async () => [{ id: "table", tableNumber: "1", capacity: 2, status: "available", orders: [] }] } };
  await assert.rejects(assertTablesAvailable(tx, ["table"], 3), /capacity/);
  tx.table.findMany = async () => [{ id: "table", tableNumber: "1", capacity: 2, status: "occupied", orders: [{ id: "other" }] }] as any;
  await assert.rejects(assertTablesAvailable(tx, ["table"], 1), /unavailable/);
});
test("unauthorized mutations cannot access privileged context", async () => {
  const context: any = { session: undefined, sudo: () => { throw new Error("privileged read attempted"); }, prisma: { $transaction: () => { throw new Error("transaction attempted"); } } };
  await assert.rejects(transitionRestaurantOrder(null, { orderId: "order", status: "completed" }, context), /Not authorized/);
  assert.equal((await updateKitchenTicketStatus(null, { ticketId: "ticket", status: "served" }, context)).error, "Not authorized");
});
test("order handoff mutation refuses an itemful order with no kitchen ticket coverage", async () => {
  let writes = 0;
  const order = { id: "order", status: "ready", orderType: "dine_in", total: 100, payments: [], orderItems: [{ id: "food", isVoided: false }], courses: [] };
  const tx: any = {
    restaurantOrder: { findUnique: async () => order, update: async () => { writes++; return order; } },
    kitchenTicket: { findMany: async () => [] },
  };
  const context: any = { session: { itemId: "manager", data: { role: { canManageOrders: true } } }, prisma: { $transaction: async (fn: any) => fn(tx) }, sudo: () => { throw new Error("must not run post-commit sync"); } };
  await assert.rejects(() => transitionRestaurantOrder(null, { orderId: "order", status: "served" }, context), /Every active order item needs/);
  assert.equal(writes, 0);
});
test("stale KDS item and ticket changes cannot regress terminal orders", async () => {
  const tx = { kitchenTicket: { findUnique: async () => ({ id: "ticket", status: "ready", order: { id: "order", status: "completed" }, orderItems: [], items: [{ id: "item" }] }), update: async () => { throw new Error("unexpected write"); } } };
  const context: any = { session: { itemId: "staff", data: { isActive: true, role: { canManageKitchen: true } } }, prisma: { $transaction: async (fn: any) => fn(tx) } };
  assert.match((await updateKitchenTicketStatus(null, { ticketId: "ticket", status: "in_progress" }, context)).error!, /no longer active/);
  assert.match((await fulfillKitchenTicketItem(null, { ticketId: "ticket", itemId: "item", fulfilled: true }, context)).error!, /Terminal/);
  for (const status of ["completed", "cancelled", "served"]) {
    const ctx: any = { prisma: { $transaction: async (fn: any) => fn({ restaurantOrder: { findUnique: async () => ({ status }), update: () => { throw new Error("regression"); } } }) } };
    await reconcileRestaurantOrderStatus("order", ctx);
  }
});

import createPOSOrder from "../features/keystone/mutations/createPOSOrder";
import { moveServiceItems } from "../features/keystone/mutations/splitCheck";
function posHarness(failLine = false) {
  let state: any = { orders: [], lines: [], courses: [], events: [] };
  let sequence = 0;
  let queue = Promise.resolve();
  function delegates(snapshot: any) {
    return {
      auditEvent: { findUnique: async ({ where }: any) => snapshot.events.find((event: any) => event.eventKey === where.eventKey), upsert: async ({ create }: any) => { snapshot.events.push(create); return create; } },
      restaurantOrder: { findUnique: async ({ where }: any) => snapshot.orders.find((order: any) => order.id === where.id), create: async ({ data }: any) => { const order = { ...data, id: `order-${++sequence}` }; snapshot.orders.push(order); return order; } },
      orderCourse: { create: async ({ data }: any) => { const course = { ...data, id: `course-${++sequence}` }; snapshot.courses.push(course); return course; } },
      orderItem: { create: async ({ data }: any) => { if (failLine) throw new Error("injected line persistence failure"); snapshot.lines.push(data); return data; } },
      table: { updateMany: async () => ({ count: 0 }) },
    };
  }
  const prisma: any = {
    auditEvent: { findUnique: async (args: any) => delegates(state).auditEvent.findUnique(args) },
    restaurantOrder: { findUnique: async (args: any) => delegates(state).restaurantOrder.findUnique(args) },
    $transaction: async (fn: any) => {
      const previous = queue; let release!: () => void; queue = new Promise(resolve => { release = resolve; }); await previous;
      const draft = structuredClone(state);
      try { const result = await fn(delegates(draft)); state = draft; return result; } finally { release(); }
    },
  };
  const hours = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(day => [day, { ranges: [{ open: "00:00", close: "23:59" }, { open: "23:59", close: "00:01" }] }]));
  const context: any = { prisma, session: { itemId: "staff", data: { isActive: true, role: { canManageOrders: true } } }, sudo: () => ({ query: {
    StoreSettings: { findOne: async () => ({ timezone: "UTC", hours, currencyCode: "USD", taxRate: 10 }) },
    MenuItem: { findOne: async () => ({ id: "menu", available: true, name: "Meal", price: 100, modifiers: [], mealPeriods: ["all_day"] }) },
    RestaurantOrder: { findOne: async () => null }, // Dispatch is separately tested; this fake has no GraphQL projection.
  } }) };
  return { context, state: () => state };
}
const posArgs: any = { idempotencyKey: "request-1", orderType: "takeout", items: [{ menuItemId: "menu", quantity: 1 }] };
test("POS commits one complete order on retry and concurrent duplicate requests", async () => {
  const harness = posHarness();
  const [first, concurrent] = await Promise.all([createPOSOrder(null, posArgs, harness.context), createPOSOrder(null, posArgs, harness.context)]);
  const retry = await createPOSOrder(null, posArgs, harness.context);
  assert.equal(first.id, concurrent.id); assert.equal(first.id, retry.id);
  assert.equal(harness.state().orders.length, 1); assert.equal(harness.state().lines.length, 1); assert.equal(harness.state().courses[0].status, "fired");
  await assert.rejects(createPOSOrder(null, { ...posArgs, items: [{ menuItemId: "menu", quantity: 2 }] }, harness.context), /different order contents/);
});
test("POS line failure rolls back order and course, leaves request retryable", async () => {
  const harness = posHarness(true);
  await assert.rejects(createPOSOrder(null, posArgs, harness.context), /line persistence failure/);
  assert.deepEqual(harness.state(), { orders: [], lines: [], courses: [], events: [] });
});
test("split preserves source production status and reparents course without duplicating work", async () => {
  const updates: any[] = [], createdTickets: any[] = [];
  const tx = {
    orderCourse: { findUnique: async () => ({ id: "course", orderId: "source", status: "fired", courseNumber: 2 }), create: async ({ data }: any) => ({ ...data, id: "new-course" }) },
    orderItem: { update: async (args: any) => updates.push(args) },
    kitchenTicket: { findMany: async () => [{ id: "ticket", orderId: "source", status: "served", items: [{ id: "line", workSignature: "stable", status: "fulfilled" }], orderItems: [{ id: "line" }] }], create: async ({ data }: any) => createdTickets.push(data), update: async (args: any) => updates.push(args) },
  };
  await moveServiceItems(tx, "source", "target", [{ id: "line", courseId: "course", originalOrderIdSnapshot: "origin" }]);
  assert.equal(updates[0].data.courseId, "new-course"); assert.equal(updates[0].data.originalOrderIdSnapshot, "origin");
  assert.equal(createdTickets[0].status, "served"); assert.equal(createdTickets[0].items[0].workSignature, "stable");
  assert.deepEqual(updates[1].data.items, []);
});
test("delivery dispatch and receipt are independent of kitchen and money", async () => {
  const delivery = { ...paid, orderType: "delivery", status: "ready" };
  assert.throws(() => assertServiceTransition(delivery, "served", [{ status: "ready" }]), /transition/);
  assert.doesNotThrow(() => assertServiceTransition(delivery, "dispatched", [{ status: "ready" }]));
  assert.throws(() => assertServiceTransition(delivery, "dispatched", [{ status: "in_progress" }]), /Kitchen/);
  assert.doesNotThrow(() => assertServiceTransition({ ...delivery, status: "dispatched" }, "served", [{ status: "served" }]));
  assert.doesNotThrow(() => assertServiceTransition({ ...delivery, status: "dispatched" }, "ready", [{ status: "served" }]));
  assert.throws(() => assertServiceTransition({ ...delivery, status: "served", payments: [] }, "completed", [{ status: "served" }]), /payment/);
  let changed: any;
  const context: any = { prisma: { $transaction: async (fn: any) => fn({
    restaurantOrder: { findUnique: async () => ({ status: "in_progress", orderType: "delivery", courses: [] }), update: async ({ data }: any) => (changed = data) },
    kitchenTicket: { findMany: async () => [{ status: "served" }] },
  }) } };
  await reconcileRestaurantOrderStatus("order", context);
  assert.equal(changed.status, "ready", "finished kitchen work must not imply customer delivery");
});

import { mergeKitchenProjectionItems } from "../features/keystone/utils/kitchenTicketSync";
test("merging checks retains prepared work from every source ticket and refire starts fresh", () => {
  const base: any = { name: "Meal", quantity: 1, station: "grill", status: "new" };
  const desired: any[] = [{ ...base, id: "target", workSignature: "target-work" }, { ...base, id: "source", workSignature: "source-work" }];
  const merged = mergeKitchenProjectionItems(desired, [
    { status: "in_progress", items: [{ ...desired[0], status: "in_progress" }] },
    { status: "ready", items: [{ ...desired[1], status: "fulfilled", fulfilledAt: "2026-09-05T12:00:00Z" }] },
  ]);
  assert.equal(merged[0].status, "in_progress"); assert.equal(merged[1].status, "fulfilled");
  assert.equal(merged[1].fulfilledAt, "2026-09-05T12:00:00Z");
  const refired = mergeKitchenProjectionItems([{ ...desired[1], workSignature: "deliberate-refire" }], [{ status: "ready", items: [merged[1]] }]);
  assert.equal(refired[0].status, "new");
});
function kitchenMutationHarness() {
  const ticket: any = { id: "ticket", orderId: "order", status: "ready", order: { status: "ready" }, station: { name: "grill" },
    items: [{ id: "done", status: "fulfilled", fulfilledAt: "2026-09-05T12:00:00Z" }, { id: "active", status: "new" }, { id: "void", status: "cancelled" }],
    orderItems: [{ id: "done", isVoided: false, fulfilledAt: new Date("2026-09-05T12:00:00Z"), kitchenStatus: "fulfilled" }, { id: "active", isVoided: false, fulfilledAt: null }, { id: "void", isVoided: true, fulfilledAt: null, kitchenStatus: "voided" }],
  };
  const tx: any = {
    kitchenTicket: { findUnique: async () => ticket, update: async ({ data }: any) => { for (const [key, value] of Object.entries(data)) if (value !== undefined) ticket[key] = value; } },
    orderItem: {
      updateMany: async ({ where, data }: any) => { for (const item of ticket.orderItems) if (where.id.in.includes(item.id) && item.isVoided === where.isVoided && (!Object.hasOwn(where, "fulfilledAt") || item.fulfilledAt === where.fulfilledAt)) {
        for (const [key, value] of Object.entries(data)) if (value !== undefined) item[key] = value;
      } },
      update: async ({ where, data }: any) => Object.assign(ticket.orderItems.find((item: any) => item.id === where.id), data),
    }, kitchenTicketEvent: { upsert: async () => ({}) }, restaurantOrder: { findUnique: async () => null },
  };
  const context: any = { session: { itemId: "cook", data: { isActive: true, role: { canManageKitchen: true } } }, prisma: { $transaction: async (fn: any) => fn(tx) } };
  return { ticket, context };
}
test("bulk kitchen progression cannot regress already fulfilled or revive voided lines", async () => {
  const h = kitchenMutationHarness();
  assert.equal((await updateKitchenTicketStatus(null, { ticketId: "ticket", status: "in_progress" }, h.context)).success, true);
  assert.equal(h.ticket.orderItems[0].kitchenStatus, "fulfilled"); assert.equal(h.ticket.orderItems[1].kitchenStatus, "in_progress");
  assert.equal(h.ticket.orderItems[2].kitchenStatus, "voided");
  h.ticket.status = "ready";
  assert.equal((await updateKitchenTicketStatus(null, { ticketId: "ticket", status: "served" }, h.context)).success, true);
  assert.equal(h.ticket.items[2].status, "cancelled"); assert.equal(h.ticket.orderItems[2].kitchenStatus, "voided");
});
test("cancelled items cannot be individually fulfilled or prevent valid remaining work being ready", async () => {
  const h = kitchenMutationHarness();
  assert.match((await fulfillKitchenTicketItem(null, { ticketId: "ticket", itemId: "void", fulfilled: true }, h.context)).error!, /Cancelled/);
  assert.equal((await fulfillKitchenTicketItem(null, { ticketId: "ticket", itemId: "active", fulfilled: true }, h.context)).success, true);
  assert.equal(h.ticket.status, "ready"); assert.equal(h.ticket.items[2].status, "cancelled");
});

import { assertKitchenProjectionCurrent } from "../features/keystone/utils/kitchenTicketSync";
test("a course hold or recall winning before kitchen sync prevents stale redispatch", () => {
  const line: any = { id: "line", quantity: 1, itemNameSnapshot: "Meal", kitchenStationSnapshot: "grill", firedAt: "2026-09-05T12:00:00.000Z", course: { status: "fired", onHold: false } };
  const expected: any = { status: "in_progress", orderItems: [line] };
  assert.throws(() => assertKitchenProjectionCurrent(expected, { ...expected, orderItems: [{ ...line, course: { status: "pending" } }] }), /changed/);
  assert.throws(() => assertKitchenProjectionCurrent(expected, { ...expected, onHold: true }), /changed/);
  assert.throws(() => assertKitchenProjectionCurrent(expected, { ...expected, orderItems: [{ ...line, isVoided: true }] }), /changed/);
  assert.doesNotThrow(() => assertKitchenProjectionCurrent(expected, { ...expected, status: "ready", orderItems: [{ ...line, firedAt: new Date(line.firedAt), kitchenStatus: "fulfilled" }] }));
});

test("KDS status reconciliation does not advance an itemful order when a fired item has no ticket", async () => {
  let update: any;
  const tx: any = {
    restaurantOrder: { findUnique: async () => ({ id: "order", status: "in_progress", orderType: "dine_in", onHold: false, courses: [], orderItems: [{ id: "covered", isVoided: false }, { id: "missing", isVoided: false }] }), update: async (args: any) => (update = args.data) },
    kitchenTicket: { findMany: async () => [{ status: "served", orderItems: [{ id: "covered" }], items: [{ id: "covered" }] }] },
  };
  await reconcileRestaurantOrderStatus("order", { prisma: { $transaction: async (fn: any) => fn(tx) } } as any);
  assert.equal(update, undefined);
});

test("committed close records kitchen failure for recovery and still runs independent cleanup", async () => {
  const events: any[] = [];
  let graphReads = 0, inventoryRuns = 0, tableRuns = 0;
  const order: any = { id: "order", status: "served", total: 100, payments: [{ amount: 100, status: "succeeded" }], courses: [], orderItems: [], tables: [] };
  const tx: any = {
    restaurantOrder: { findUnique: async () => order, update: async ({ data }: any) => Object.assign(order, data) },
    kitchenTicket: { findMany: async () => [{ status: "served" }] },
    auditEvent: { upsert: async ({ create }: any) => { events.push(create); return create; } },
  };
  const context: any = { session: { itemId: "staff", data: { isActive: true, role: { canManageOrders: true } } },
    prisma: { ...tx, $transaction: async (fn: any) => { if (order.status === "completed") inventoryRuns++; return fn(tx); } },
    sudo: () => ({ query: { RestaurantOrder: { findOne: async () => { graphReads++; if (graphReads === 2) throw new Error("injected kitchen outage"); return order; } }, Table: { findMany: async () => { tableRuns++; return []; } } } }),
  };
  const result = await transitionRestaurantOrder(null, { orderId: "order", status: "completed" }, context);
  assert.equal(result.status, "completed"); assert.ok(inventoryRuns > 0);
  assert.ok(events.some(event => event.eventType === "operations.recovery_required" && event.after.operation === "kitchen"));
  assert.ok(events.some(event => event.eventType === "operations.reconciled" && event.after.operation === "inventory"));
  assert.ok(events.some(event => event.after?.operation === "tables"));
});
