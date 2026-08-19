import crypto from "crypto";
import type { Context } from ".keystone/types";
import { calculateRestaurantTotals } from "../../lib/restaurant-order-pricing";
import { permissions } from "../access";
import { getStoreDeliverySettings } from "../utils/deliveryValidation";
import { appendAuditEvent } from "../utils/audit";
import { getOrderItemsSubtotal } from "../utils/orderItemFinancials";
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
    const settings = await getStoreDeliverySettings(context);
    const key = splitKey(args.orderId, itemIds);
    const prisma = context.prisma as any;
    const result = await prisma.$transaction(async (tx: any) => {
      const existing = await tx.orderAdjustment.findUnique({ where: { idempotencyKey: key } });
      if (existing?.metadata?.newOrderId) {
        return { originalOrderId: args.orderId, newOrderId: existing.metadata.newOrderId, replay: true };
      }
      const order = await tx.restaurantOrder.findUnique({
        where: { id: args.orderId },
        include: { tables: true, orderItems: true },
      });
      if (!order) throw new Error("Order not found");
      if (["completed", "cancelled"].includes(order.status || "")) throw new Error("Closed checks cannot be split");
      const reservedPayments = await tx.payment.count({
        where: { orderId: order.id, status: { in: ["processing", "authorized", "succeeded", "unknown"] } },
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
      const movedPricing = calculateRestaurantTotals({
        subtotal: movedSubtotal,
        orderType: order.orderType,
        taxRate: settings?.taxRate,
        currencyCode: settings?.currencyCode || order.currencyCode || "USD",
      });
      const remainingPricing = calculateRestaurantTotals({
        subtotal: remainingSubtotal,
        orderType: order.orderType,
        taxRate: settings?.taxRate,
        currencyCode: settings?.currencyCode || order.currencyCode || "USD",
      });
      const movedTotal = Math.max(0, movedSubtotal + movedPricing.tax + movedTip - movedDiscount);
      const remainingTotal = Math.max(0, remainingSubtotal + remainingPricing.tax + remainingTip - remainingDiscount);

      const newOrder = await tx.restaurantOrder.create({
        data: {
          orderNumber: buildSplitOrderNumber(),
          orderType: order.orderType,
          orderSource: order.orderSource,
          status: order.status,
          guestCount: 1,
          specialInstructions: order.specialInstructions || "",
          subtotal: movedSubtotal,
          tax: movedPricing.tax,
          tip: movedTip,
          discount: movedDiscount,
          total: movedTotal,
          currencyCode: order.currencyCode,
          customerId: order.customerId,
          serverId: order.serverId,
          createdById: context.session?.itemId || order.createdById,
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
      await tx.orderItem.updateMany({
        where: { id: { in: itemIds }, orderId: order.id },
        data: { orderId: newOrder.id, originalOrderIdSnapshot: order.id },
      });
      await tx.restaurantOrder.update({
        where: { id: order.id },
        data: {
          subtotal: remainingSubtotal,
          tax: remainingPricing.tax,
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
          metadata: { newOrderId: newOrder.id, itemIds, originalOrderId: order.id },
          orderId: order.id,
          actorId: context.session?.itemId || null,
          approvedById: context.session?.itemId || null,
        },
      });
      return { originalOrderId: order.id, newOrderId: newOrder.id, replay: false };
    }, { isolationLevel: "Serializable" });

    if (!result.replay) {
      await appendAuditEvent(context, {
        eventType: "check.split_by_item",
        entityType: "RestaurantOrder",
        entityId: args.orderId,
        after: { newOrderId: result.newOrderId, itemIds },
        metadata: { idempotencyKey: key },
      }).catch((error) => console.error("Split audit event failed:", error));
      await Promise.all([
        syncKitchenTicketsForOrder(result.originalOrderId, context),
        syncKitchenTicketsForOrder(result.newOrderId, context),
      ]);
    }
    return { success: true, newOrderIds: [result.newOrderId], error: null };
  } catch (error) {
    return { success: false, newOrderIds: [], error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function splitCheckByGuest(
  _root: unknown,
  _args: { orderId: string; guestCount: number },
  context: Context
): Promise<SplitCheckResult> {
  if (!permissions.canManageOrders({ session: context.session })) {
    return { success: false, newOrderIds: [], error: "Not authorized to split check" };
  }
  return {
    success: false,
    newOrderIds: [],
    error: "Equal guest splits are disabled until financial check-allocation records and tender UI are migrated. Split by item instead.",
  };
}
