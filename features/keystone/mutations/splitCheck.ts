import { copyPhysicalParty, mergePhysicalParties } from "../utils/physicalParties";
import { allocateEqualCheckCharges, assertNoActiveCheckAllocation, getActiveCheckAllocation, type CheckTotals } from "../utils/checkAllocations";
import { freezeOrderPricingPolicy, getOrderPricingPolicy, recordedDeliveryCharge } from "../utils/orderPricingPolicy";
import crypto from "crypto";
import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { appendAuditEvent } from "../utils/audit";
import { getOrderItemsSubtotal } from "../utils/orderItemFinancials";
import { serviceTransaction } from "../utils/serviceOrderState";
import { syncKitchenTicketsForOrder } from "../utils/kitchenTicketSync";

interface SplitCheckResult {
  success: boolean;
  newOrderIds: string[];
  error: string | null;
}

function splitKey(orderId: string, itemIds: string[]) {
  return crypto.createHash("sha256").update(`split:${orderId}:${[...itemIds].sort().join(":")}`).digest("hex");
}

function buildSplitOrderNumber() {
  return `SPL-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

async function splitItemsWithClient(tx: any, orderId: string, itemIds: string[], key: string, actorId: string | undefined) {
      const existing = await tx.orderAdjustment.findUnique({ where: { idempotencyKey: key } });
      if (existing?.metadata?.newOrderId) {
        return { originalOrderId: orderId, newOrderId: existing.metadata.newOrderId, replay: true };
      }
      await assertNoActiveCheckAllocation(tx, orderId);
      const order = await tx.restaurantOrder.findUnique({
        where: { id: orderId },
        include: { tables: true, orderItems: true },
      });
      if (!order) throw new Error("Order not found");
      if (["completed", "cancelled", "dispatched"].includes(order.status || "")) throw new Error("Closed checks cannot be split");
      const reservedPayments = await tx.payment.count({
        where: { orderId: order.id, status: { in: ["processing", "authorized", "succeeded", "unknown", "partially_refunded"] } },
      });
      if (reservedPayments) throw new Error("A check with reserved or successful tenders cannot be split");
      const selected = order.orderItems.filter((item: any) => itemIds.includes(item.id));
      if (selected.length !== itemIds.length) throw new Error("One or more selected items do not belong to this check");
      if (selected.length === order.orderItems.length) throw new Error("At least one item must remain on the original check");

      const originalSubtotalBefore = getOrderItemsSubtotal(order.orderItems);
      const movedSubtotal = getOrderItemsSubtotal(selected);
      const remainingItems = order.orderItems.filter((item: any) => !itemIds.includes(item.id));
      const remainingSubtotal = getOrderItemsSubtotal(remainingItems);
      const ratio = originalSubtotalBefore > 0 ? movedSubtotal / originalSubtotalBefore : 0;
      const movedTip = Math.round(Number(order.tip || 0) * ratio);
      const movedDiscount = Math.round(Number(order.discount || 0) * ratio);
      const remainingTip = Number(order.tip || 0) - movedTip;
      const remainingDiscount = Number(order.discount || 0) - movedDiscount;
      const policy = await getOrderPricingPolicy(tx, order.id);
      const movedTax = Math.round(Number(order.tax || 0) * ratio);
      const remainingTax = Number(order.tax || 0) - movedTax;
      const deliveryCharge = recordedDeliveryCharge(order);
      const movedDeliveryCharge = Math.round(deliveryCharge * ratio);
      const movedTotal = movedSubtotal + movedTax + movedDeliveryCharge + movedTip - movedDiscount;
      const remainingTotal = remainingSubtotal + remainingTax + deliveryCharge - movedDeliveryCharge + remainingTip - remainingDiscount;
      if (movedTotal < 0 || remainingTotal < 0 || movedTotal + remainingTotal !== Number(order.total)) throw new Error("Check totals must reconcile before splitting");

      const newOrder = await tx.restaurantOrder.create({
        data: {
          orderNumber: buildSplitOrderNumber(),
          orderType: order.orderType,
          orderSource: order.orderSource,
          status: order.status,
          guestCount: 1,
          specialInstructions: order.specialInstructions || "",
          subtotal: movedSubtotal,
          tax: movedTax,
          tip: movedTip,
          discount: movedDiscount,
          total: movedTotal,
          currencyCode: order.currencyCode,
          customerId: order.customerId,
          serverId: order.serverId,
          createdById: actorId || order.createdById,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone,
          deliveryAddress: order.deliveryAddress,
          deliveryAddress2: order.deliveryAddress2,
          deliveryCity: order.deliveryCity,
          deliveryState: order.deliveryState,
          deliveryZip: order.deliveryZip,
          deliveryCountryCode: order.deliveryCountryCode,
          tables: order.tables.length ? { connect: order.tables.map((table: any) => ({ id: table.id })) } : undefined,
        },
      });
      await freezeOrderPricingPolicy(tx, newOrder.id, policy, actorId);
      await copyPhysicalParty(tx, order, newOrder, actorId);
      await moveServiceItems(tx, order.id, newOrder.id, selected);

      await tx.restaurantOrder.update({
        where: { id: order.id },
        data: {
          subtotal: remainingSubtotal,
          tax: remainingTax,
          tip: remainingTip,
          discount: remainingDiscount,
          total: remainingTotal,
        },
      });
      await tx.orderAdjustment.create({
        data: {
          idempotencyKey: key,
          type: "split",
          amount: movedTotal,
          reason: "Item split",
          metadata: { newOrderId: newOrder.id, itemIds, originalOrderId: order.id, movedDeliveryCharge, remainingDeliveryCharge: deliveryCharge - movedDeliveryCharge },
          orderId: order.id,
          actorId: actorId || null,
          approvedById: actorId || null,
        },
      });
      return { originalOrderId: order.id, newOrderId: newOrder.id, replay: false };
}

export async function splitCheckByItem(
  _root: unknown,
  args: { orderId: string; itemIds: string[] },
  context: Context
): Promise<SplitCheckResult> {
  if (!permissions.canManageOrders({ session: context.session })) {
    return { success: false, newOrderIds: [], error: "Not authorized to split check" };
  }
  try {
    const itemIds = Array.from(new Set(args.itemIds || []));
    if (!itemIds.length) throw new Error("Must select at least one item to split");
    const key = splitKey(args.orderId, itemIds);
    const prisma = context.prisma as any;
    const result = await serviceTransaction(prisma, async (tx: any) => {
      return splitItemsWithClient(tx, args.orderId, itemIds, key, context.session?.itemId);
    });

    if (!result.replay) {
      await appendAuditEvent(context, {
        eventType: "check.split_by_item",
        entityType: "RestaurantOrder",
        entityId: args.orderId,
        after: { newOrderId: result.newOrderId, itemIds },
        metadata: { idempotencyKey: key },
      }).catch((error) => console.error("Split audit event failed:", error));
    }
    await Promise.all([syncKitchenTicketsForOrder(result.originalOrderId, context), syncKitchenTicketsForOrder(result.newOrderId, context)]);
    return { success: true, newOrderIds: [result.newOrderId], error: null };
  } catch (error) {
    return { success: false, newOrderIds: [], error: error instanceof Error ? error.message : "Unknown error" };
  }
}

function financialTotals(order: any): CheckTotals {
  return { subtotal: Number(order.subtotal || 0), tax: Number(order.tax || 0), tip: Number(order.tip || 0), discount: Number(order.discount || 0), deliveryCharge: recordedDeliveryCharge(order), total: Number(order.total || 0) };
}
function monetaryFields(totals: CheckTotals) {
  const { deliveryCharge: _deliveryCharge, ...fields } = totals; return fields;
}
function copyCheckIdentity(order: any, actorId?: string) {
  return {
    orderType: order.orderType, orderSource: order.orderSource, status: order.status, guestCount: 1,
    currencyCode: order.currencyCode, customerId: order.customerId, serverId: order.serverId,
    createdById: actorId || order.createdById, customerName: order.customerName, customerEmail: order.customerEmail,
    customerPhone: order.customerPhone, deliveryAddress: order.deliveryAddress, deliveryAddress2: order.deliveryAddress2,
    deliveryCity: order.deliveryCity, deliveryState: order.deliveryState, deliveryZip: order.deliveryZip,
    deliveryCountryCode: order.deliveryCountryCode,
    tables: order.tables.length ? { connect: order.tables.map((table: any) => ({ id: table.id })) } : undefined,
  };
}
function requestKey(value: string) {
  if (!/^[\w-]{8,100}$/.test(value || "")) throw new Error("A stable split request key is required"); return value;
}
export async function splitCheckByGuest(_root: unknown, args: { orderId: string; guestCount: number; idempotencyKey: string }, context: Context): Promise<SplitCheckResult> {
  if (!permissions.canManageOrders({ session: context.session })) return { success: false, newOrderIds: [], error: "Not authorized to split check" };
  try {
    const groupId = `equal-check-group:${args.orderId}:${requestKey(args.idempotencyKey)}`;
    const ids = await serviceTransaction(context.prisma, async tx => {
      const replay = await tx.orderAdjustment.findUnique({ where: { idempotencyKey: groupId } });
      if (replay) {
        if (replay.metadata.guestCount !== args.guestCount) throw new Error("Split key was reused for a different guest count");
        if (await tx.orderAdjustment.findUnique({ where: { idempotencyKey: `equal-check-recombined:${groupId}` } })) throw new Error("These checks were recombined; start a new split request");
        return replay.metadata.memberOrderIds;
      }
      await assertNoActiveCheckAllocation(tx, args.orderId);
      const order = await tx.restaurantOrder.findUnique({ where: { id: args.orderId }, include: { tables: true, payments: true, orderItems: true, courses: true } });
      if (!order || order.status !== "served" || order.orderSource === "gift_card" || !order.orderItems.length) throw new Error("Independent equal checks require a served food order");
      const activeCourseIds = new Set(order.orderItems.filter((item: any) => !item.isVoided).map((item: any) => item.courseId));
      if (order.onHold || order.courses.some((course: any) => activeCourseIds.has(course.id) && (course.onHold || course.status === "pending")) || (await tx.kitchenTicket.findMany({ where: { orderId: order.id } })).some((ticket: any) => !["served", "cancelled"].includes(ticket.status))) throw new Error("Finish all service before allocating equal checks");
      if (order.payments.some((payment: any) => ["processing", "authorized", "succeeded", "unknown", "partially_refunded"].includes(payment.status))) throw new Error("Resolve all tenders before allocating equal checks");
      const originalTotals = financialTotals(order), allocations = allocateEqualCheckCharges(originalTotals, args.guestCount);
      const policy = await getOrderPricingPolicy(tx, order.id);
      const memberOrderIds = [order.id];
      for (let index = 1; index < allocations.length; index++) {
        const child = await tx.restaurantOrder.create({ data: { ...copyCheckIdentity(order, context.session?.itemId), orderNumber: buildSplitOrderNumber(), ...monetaryFields(allocations[index]), specialInstructions: `Independent check ${index + 1}/${allocations.length} for ${order.orderNumber}. Food production remains on the original check.` } });
        await freezeOrderPricingPolicy(tx, child.id, policy, context.session?.itemId);
        await copyPhysicalParty(tx, order, child, context.session?.itemId); memberOrderIds.push(child.id);
      }
      await tx.restaurantOrder.update({ where: { id: order.id }, data: monetaryFields(allocations[0]) });
      const sourceItems = order.orderItems.map((item: any) => ({ id: item.id, name: item.itemNameSnapshot, quantity: item.quantity, unitPrice: item.price, seatNumber: item.seatNumber, courseNumber: item.courseNumber, isVoided: Boolean(item.isVoided), adjustmentTotal: Number(item.adjustmentTotal || 0), modifiers: item.modifiersSnapshot }));
      await tx.orderAdjustment.create({ data: { idempotencyKey: groupId, type: "split", amount: originalTotals.total, reason: "Independent equal checks", orderId: order.id, actorId: context.session?.itemId, metadata: { kind: "equal_group", guestCount: args.guestCount, sourceOrderId: order.id, sourceOrderNumber: order.orderNumber, memberOrderIds, originalTotals, allocations, sourceItems } } });
      for (const id of memberOrderIds) await tx.orderAdjustment.create({ data: { idempotencyKey: `equal-check-member:${id}:${groupId}`, type: "split", amount: allocations[memberOrderIds.indexOf(id)].total, reason: "Independent check allocation", orderId: id, actorId: context.session?.itemId, metadata: { kind: "equal_member", groupId } } });
      return memberOrderIds;
    });
    return { success: true, newOrderIds: ids, error: null };
  } catch (error) { return { success: false, newOrderIds: [], error: error instanceof Error ? error.message : "Unknown error" }; }
}
export async function recombineEqualChecks(_root: unknown, args: { orderId: string }, context: Context): Promise<SplitCheckResult> {
  if (!permissions.canManageOrders({ session: context.session })) return { success: false, newOrderIds: [], error: "Not authorized to recombine checks" };
  try {
    const id = await serviceTransaction(context.prisma, async tx => {
      const allocation = await getActiveCheckAllocation(tx, args.orderId);
      if (!allocation) {
        const priorMember = await tx.orderAdjustment.findFirst({ where: { orderId: args.orderId, idempotencyKey: { startsWith: "equal-check-member:" } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
        const priorGroup = priorMember?.metadata?.groupId ? await tx.orderAdjustment.findUnique({ where: { idempotencyKey: priorMember.metadata.groupId } }) : null;
        return priorGroup?.metadata?.sourceOrderId || args.orderId;
      }
      const group = await tx.orderAdjustment.findUnique({ where: { idempotencyKey: allocation.groupId } });
      const orders = await tx.restaurantOrder.findMany({ where: { id: { in: allocation.memberOrderIds } }, include: { payments: true, orderItems: true } });
      if (orders.length !== allocation.memberOrderIds.length || orders.some((order: any) => order.status !== "served")) throw new Error("All allocated checks must remain served and open for payment before recombining");
      if (orders.some((order: any) => order.payments.some((payment: any) => ["processing", "authorized", "unknown"].includes(payment.status) || (["succeeded", "partially_refunded", "refunded"].includes(payment.status) && Number(payment.amount) > Number(payment.refundedAmount || 0))))) throw new Error("Refund captured value and resolve all tenders before recombining checks");
      for (const order of orders) {
        const recorded = group.metadata.allocations[allocation.memberOrderIds.indexOf(order.id)], current = financialTotals(order);
        if (["subtotal", "tax", "discount", "deliveryCharge"].some(field => current[field as keyof CheckTotals] !== recorded[field]) || current.total - recorded.total !== current.tip - recorded.tip) throw new Error("Allocated charges changed; review the financial ledger before recombining");
        if (order.id !== allocation.sourceOrderId && order.orderItems.length) throw new Error("An allocated child unexpectedly owns production items");
      }
      const tip = orders.reduce((sum: number, order: any) => sum + Number(order.tip || 0), 0), total = orders.reduce((sum: number, order: any) => sum + Number(order.total || 0), 0);
      await tx.restaurantOrder.update({ where: { id: allocation.sourceOrderId }, data: { ...monetaryFields(allocation.originalTotals), tip, total } });
      for (const child of orders.filter((order: any) => order.id !== allocation.sourceOrderId)) await tx.restaurantOrder.update({ where: { id: child.id }, data: { status: "cancelled", subtotal: 0, tax: 0, tip: 0, discount: 0, total: 0, tables: { set: [] } } });
      await tx.orderAdjustment.create({ data: { idempotencyKey: `equal-check-recombined:${allocation.groupId}`, type: "split", amount: total, reason: "Independent equal checks recombined", orderId: allocation.sourceOrderId, actorId: context.session?.itemId, metadata: { groupId: allocation.groupId, memberOrderIds: allocation.memberOrderIds, total, tip } } });
      return allocation.sourceOrderId;
    });
    return { success: true, newOrderIds: [id], error: null };
  } catch (error) { return { success: false, newOrderIds: [], error: error instanceof Error ? error.message : "Unknown error" }; }
}
export async function splitCheckBySeat(_root: unknown, args: { orderId: string; idempotencyKey: string }, context: Context): Promise<SplitCheckResult> {
  if (!permissions.canManageOrders({ session: context.session })) return { success: false, newOrderIds: [], error: "Not authorized to split check" };
  try {
    const key = `seat-check-group:${args.orderId}:${requestKey(args.idempotencyKey)}`;
    const ids = await serviceTransaction(context.prisma, async tx => {
      const replay = await tx.orderAdjustment.findUnique({ where: { idempotencyKey: key } }); if (replay) return replay.metadata.memberOrderIds;
      await assertNoActiveCheckAllocation(tx, args.orderId);
      const order = await tx.restaurantOrder.findUnique({ where: { id: args.orderId }, include: { orderItems: true } });
      if (!order || !order.orderItems.length) throw new Error("Check not found");
      const seats = new Map<number, string[]>();
      for (const item of order.orderItems) {
        if (!Number.isInteger(item.seatNumber) || item.seatNumber < 1 || item.seatNumber > 100) throw new Error("Assign every item to a valid seat before splitting");
        seats.set(item.seatNumber, [...(seats.get(item.seatNumber) || []), item.id]);
      }
      if (seats.size < 2 || seats.size > 20) throw new Error("Seat splitting requires two to twenty occupied seats");
      const memberOrderIds = [order.id];
      for (const [seat, itemIds] of [...seats.entries()].sort((a, b) => a[0] - b[0]).slice(1)) {
        const result = await splitItemsWithClient(tx, order.id, itemIds, `${key}:seat:${seat}`, context.session?.itemId); memberOrderIds.push(result.newOrderId);
      }
      await tx.orderAdjustment.create({ data: { idempotencyKey: key, type: "split", amount: Number(order.total || 0), reason: "Checks split by assigned seat", orderId: order.id, actorId: context.session?.itemId, metadata: { memberOrderIds, seats: [...seats.keys()].sort((a, b) => a - b) } } });
      return memberOrderIds;
    });
    await Promise.all(ids.map((id: string) => syncKitchenTicketsForOrder(id, context)));
    return { success: true, newOrderIds: ids, error: null };
  } catch (error) { return { success: false, newOrderIds: [], error: error instanceof Error ? error.message : "Unknown error" }; }
}

/** Move ownership without asking the kitchen to repeat already-dispatched production. */
export async function moveServiceItems(tx: any, sourceId: string, targetId: string, items: any[]) {
  const ids = items.map(item => item.id);
  const courseMap = new Map<string, string>();
  for (const item of items) {
    let targetCourseId: string | null = null;
    if (item.courseId) {
      if (!courseMap.has(item.courseId)) {
        const source = await tx.orderCourse.findUnique({ where: { id: item.courseId } });
        if (!source || source.orderId !== sourceId) throw new Error("Item course does not belong to the source check");
        const course = await tx.orderCourse.create({ data: {
          orderId: targetId, courseNumber: source.courseNumber, courseType: source.courseType, status: source.status,
          fireTime: source.fireTime, autoFireAt: source.autoFireAt, onHold: source.onHold, allItemsReady: source.allItemsReady,
        } });
        courseMap.set(item.courseId, course.id);
      }
      targetCourseId = courseMap.get(item.courseId)!;
    }
    await tx.orderItem.update({ where: { id: item.id }, data: { orderId: targetId, courseId: targetCourseId, originalOrderIdSnapshot: item.originalOrderIdSnapshot || sourceId } });
  }
  const tickets = await tx.kitchenTicket.findMany({ where: { orderId: sourceId }, include: { orderItems: { select: { id: true } } } });
  for (const ticket of tickets) {
    const work = Array.isArray(ticket.items) ? ticket.items : [];
    const moved = work.filter((item: any) => ids.includes(item.id));
    if (!moved.length) continue;
    const remaining = work.filter((item: any) => !ids.includes(item.id));
    await tx.kitchenTicket.create({ data: {
      orderId: targetId, stationId: ticket.stationId, status: ticket.status, items: moved,
      priority: ticket.priority, ticketType: ticket.ticketType, firedAt: ticket.firedAt,
      completedAt: ticket.completedAt, servedAt: ticket.servedAt, recalledAt: ticket.recalledAt,
      orderItems: { connect: moved.map((item: any) => ({ id: item.id })) },
    } });
    await tx.kitchenTicket.update({ where: { id: ticket.id }, data: {
      items: remaining, status: remaining.length ? ticket.status : "cancelled",
      orderItems: { set: remaining.map((item: any) => ({ id: item.id })) },
    } });
  }
}
export async function mergeChecks(_root: unknown, args: { orderId: string; sourceOrderId: string }, context: Context): Promise<SplitCheckResult> {
  if (!permissions.canManageOrders({ session: context.session })) return { success: false, newOrderIds: [], error: "Not authorized to merge checks" };
  try {
    if (args.orderId === args.sourceOrderId) throw new Error("Select two different checks");
    await serviceTransaction(context.prisma, async tx => {
      const key = `merge:${args.sourceOrderId}:${args.orderId}`;
      if (await tx.orderAdjustment.findUnique({ where: { idempotencyKey: key } })) return;
      await assertNoActiveCheckAllocation(tx, args.orderId);
      await assertNoActiveCheckAllocation(tx, args.sourceOrderId);
      const orders = await tx.restaurantOrder.findMany({ where: { id: { in: [args.orderId, args.sourceOrderId] } }, include: { orderItems: true, payments: true, tables: true } });
      const target = orders.find((order: any) => order.id === args.orderId), source = orders.find((order: any) => order.id === args.sourceOrderId);
      if (!target || !source || [target, source].some(order => ["completed", "cancelled"].includes(order.status))) throw new Error("Both checks must be active");
      if (target.currencyCode !== source.currencyCode || target.orderType !== source.orderType) throw new Error("Checks must share currency and service type");
      if ([target, source].some(order => order.payments.some((payment: any) => ["processing", "authorized", "succeeded", "unknown", "partially_refunded"].includes(payment.status)))) throw new Error("Resolve tenders before merging checks");
      if ([target, source].some(order => order.status === "dispatched")) throw new Error("Dispatched delivery checks cannot be merged");
      if (target.orderType === "delivery" && ["customerId", "customerEmail", "customerPhone", "deliveryAddress", "deliveryAddress2", "deliveryCity", "deliveryState", "deliveryZip", "deliveryCountryCode"].some(field => String(target[field] || "").trim().toLowerCase() !== String(source[field] || "").trim().toLowerCase())) throw new Error("Delivery checks must share recipient and destination");
      const targetPolicy = await getOrderPricingPolicy(tx, target.id), sourcePolicy = await getOrderPricingPolicy(tx, source.id);
      if (["taxRate", "currencyCode", "deliveryFee", "deliveryMinimum", "pickupDiscount", "serviceCharge", "taxBasis", "voluntaryTip"].some(field => targetPolicy[field] !== sourcePolicy[field])) throw new Error("Checks have different recorded pricing policies and cannot be merged");
      await moveServiceItems(tx, source.id, target.id, source.orderItems);
      const sums: any = {};
      for (const field of ["subtotal", "tax", "tip", "discount", "total"]) sums[field] = Number(target[field] || 0) + Number(source[field] || 0);
      const tableIds = [...new Set([...target.tables, ...source.tables].map((table: any) => table.id))];
      const physicalGuests = await mergePhysicalParties(tx, target, source, context.session?.itemId);
      const status = [target.status, source.status].includes("open") ? "open" : [target.status, source.status].includes("sent_to_kitchen") ? "sent_to_kitchen" : [target.status, source.status].includes("in_progress") ? "in_progress" : [target.status, source.status].includes("ready") ? "ready" : "served";
      await tx.restaurantOrder.update({ where: { id: target.id }, data: { ...sums, status, guestCount: Math.max(1, physicalGuests), tables: { set: tableIds.map(id => ({ id })) } } });
      await tx.restaurantOrder.update({ where: { id: source.id }, data: { status: "cancelled", subtotal: 0, tax: 0, tip: 0, discount: 0, total: 0, tables: { set: [] } } });
      await tx.orderAdjustment.create({ data: { idempotencyKey: key, type: "split", amount: Number(source.total || 0), reason: "Checks merged", orderId: target.id, actorId: context.session?.itemId, metadata: { sourceOrderId: source.id, targetOrderId: target.id, movedItemIds: source.orderItems.map((item: any) => item.id), sourceTotals: { subtotal: source.subtotal, tax: source.tax, tip: source.tip, discount: source.discount, total: source.total } } } });
    });
    await syncKitchenTicketsForOrder(args.orderId, context);
    return { success: true, newOrderIds: [args.orderId], error: null };
  } catch (error) { return { success: false, newOrderIds: [], error: error instanceof Error ? error.message : "Unknown error" }; }
}
