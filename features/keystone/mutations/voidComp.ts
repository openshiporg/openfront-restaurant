import crypto from "crypto";
import type { Context } from ".keystone/types";
import { calculateRestaurantTotals } from "../../lib/restaurant-order-pricing";
import { permissions } from "../access";
import { getStoreDeliverySettings } from "../utils/deliveryValidation";
import { appendAuditEventWithClient } from "../utils/audit";
import { getOrderItemsSubtotal } from "../utils/orderItemFinancials";
import { syncKitchenTicketsForOrder } from "../utils/kitchenTicketSync";
import { getOrCreateIdempotencyAttempt, updateIdempotencyAttempt } from "../utils/idempotency";
import { consumeManagerApproval } from "../utils/managerApproval";

interface AdjustmentArgs {
  orderItemId: string;
  reason: string;
  compAmount?: number | null;
  managerApproval?: boolean | null;
  managerApprovalId?: string | null;
  idempotencyKey?: string | null;
}

interface VoidCompResult {
  success: boolean;
  requiresManagerApproval: boolean;
  adjustedAmount: number | null;
  error: string | null;
}

function operationKey(type: string, targetId: string, reason: string, amount?: number | null, supplied?: string | null) {
  if (supplied?.trim()) return supplied.trim();
  return crypto.createHash("sha256").update(`${type}:${targetId}:${reason.trim()}:${amount ?? "full"}`).digest("hex");
}

function authorize(context: Context, approvalId: string | null | undefined) {
  if (!permissions.canManageOrders({ session: context.session })) throw new Error("Not authorized to request order corrections");
  if (!approvalId) throw new Error("Independent manager approval is required for this correction");
}

async function adjustOrderItem(
  type: "void" | "comp",
  args: AdjustmentArgs,
  context: Context
): Promise<VoidCompResult> {
  try {
    authorize(context, args.managerApprovalId);
    if (!args.reason?.trim()) throw new Error("Reason is required");
    const settings = await getStoreDeliverySettings(context);
    const key = operationKey(type, args.orderItemId, args.reason, args.compAmount, args.idempotencyKey);
    const prisma = context.prisma as any;
    const priorAdjustment = await prisma.orderAdjustment.findUnique({ where: { idempotencyKey: key } });
    if (priorAdjustment && (
      priorAdjustment.orderItemId !== args.orderItemId ||
      priorAdjustment.type !== type ||
      priorAdjustment.reason !== args.reason.trim()
    )) {
      throw new Error("Idempotency key was already used with a different order-item correction");
    }
    const { attempt } = await getOrCreateIdempotencyAttempt(prisma, {
      key: `order-adjustment:${key}`,
      requestPath: type === "void" ? "voidOrderItem" : "compOrderItem",
      requestParams: {
        orderItemId: args.orderItemId,
        reason: args.reason.trim(),
        compAmount: args.compAmount ?? null,
        managerApprovalId: args.managerApprovalId,
      },
    });
    const result = await prisma.$transaction(async (tx: any) => {
      const existing = await tx.orderAdjustment.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        if (
          existing.orderItemId !== args.orderItemId ||
          existing.type !== type ||
          existing.reason !== args.reason.trim()
        ) {
          throw new Error("Idempotency key was already used with a different order-item correction");
        }
        return { adjustment: existing, orderId: existing.orderId, replay: true };
      }
      const item = await tx.orderItem.findUnique({ where: { id: args.orderItemId } });
      if (!item?.orderId) throw new Error("Order item not found");
      const order = await tx.restaurantOrder.findUnique({ where: { id: item.orderId } });
      if (!order) throw new Error("Order not found");
      if (["completed", "cancelled"].includes(order.status || "")) {
        throw new Error("Closed checks require a refund/correction receipt instead of an item edit");
      }
      const originalTotal = Math.max(0, Number(item.price || 0) * Number(item.quantity || 0));
      const alreadyAdjusted = Math.max(0, Number(item.adjustmentTotal || 0));
      const available = Math.max(0, originalTotal - alreadyAdjusted);
      const amount = type === "void"
        ? available
        : args.compAmount == null
          ? available
          : Math.max(0, Math.min(Math.round(args.compAmount), available));
      if (amount <= 0) throw new Error("No remaining item value can be adjusted");

      const adjustment = await tx.orderAdjustment.create({
        data: {
          idempotencyKey: key,
          type,
          amount,
          reason: args.reason.trim(),
          metadata: { originalTotal, previousAdjustmentTotal: alreadyAdjusted, managerApprovalId: args.managerApprovalId },
          orderId: order.id,
          orderItemId: item.id,
          actorId: context.session?.itemId || null,
          approvedById: null,
        },
      });
      const approval = await consumeManagerApproval(tx, {
        approvalId: args.managerApprovalId,
        actorId: context.session?.itemId,
        actionType: type === "void" ? "void_item" : "comp_item",
        targetId: args.orderItemId,
        reason: args.reason,
        amount: args.compAmount ?? null,
        entityType: "OrderAdjustment",
        entityId: adjustment.id,
      });
      await tx.orderItem.update({
        where: { id: item.id },
        data: type === "void"
          ? {
              isVoided: true,
              voidedAt: new Date(),
              voidReason: args.reason.trim(),
              voidedById: context.session?.itemId || null,
              approvedById: approval.approvedById,
            }
          : {
              adjustmentTotal: alreadyAdjusted + amount,
              approvedById: approval.approvedById,
            },
      });
      const approvedAdjustment = await tx.orderAdjustment.update({
        where: { id: adjustment.id },
        data: { approvedById: approval.approvedById },
      });
      const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
      const subtotal = getOrderItemsSubtotal(items);
      const { tax } = calculateRestaurantTotals({
        subtotal,
        orderType: order.orderType,
        taxRate: settings?.taxRate,
        currencyCode: settings?.currencyCode || order.currencyCode || "USD",
      });
      const total = Math.max(0, subtotal + tax + Number(order.tip || 0) - Number(order.discount || 0));
      await tx.restaurantOrder.update({ where: { id: order.id }, data: { subtotal, tax, total } });
      await appendAuditEventWithClient(tx, context.session?.itemId, {
        eventKey: `order-adjustment:${adjustment.id}`,
        eventType: `order_item.${type}`,
        entityType: "OrderItem",
        entityId: args.orderItemId,
        reason: args.reason,
        after: { adjustedAmount: amount },
        approverId: approval.approvedById,
        metadata: { adjustmentId: adjustment.id, idempotencyKey: key, managerApprovalId: args.managerApprovalId },
      });
      return { adjustment: approvedAdjustment, orderId: order.id, replay: false };
    }, { isolationLevel: "Serializable" });

    if (!result.replay) await syncKitchenTicketsForOrder(result.orderId, context);
    await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
      adjustmentId: result.adjustment.id,
      orderId: result.orderId,
      adjustedAmount: result.adjustment.amount,
    }, 200);
    return { success: true, requiresManagerApproval: false, adjustedAmount: result.adjustment.amount, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      requiresManagerApproval: message.toLowerCase().includes("manager approval"),
      adjustedAmount: null,
      error: message,
    };
  }
}

export function voidOrderItem(_root: unknown, args: AdjustmentArgs, context: Context) {
  return adjustOrderItem("void", args, context);
}

export function compOrderItem(_root: unknown, args: AdjustmentArgs, context: Context) {
  return adjustOrderItem("comp", args, context);
}

export async function voidOrder(
  _root: unknown,
  args: { orderId: string; reason: string; managerApproval?: boolean | null; managerApprovalId?: string | null; idempotencyKey?: string | null },
  context: Context
): Promise<VoidCompResult> {
  try {
    authorize(context, args.managerApprovalId);
    if (!args.reason?.trim()) throw new Error("Reason is required");
    const key = operationKey("void-order", args.orderId, args.reason, null, args.idempotencyKey);
    const prisma = context.prisma as any;
    const priorAdjustment = await prisma.orderAdjustment.findUnique({ where: { idempotencyKey: key } });
    if (priorAdjustment && (
      priorAdjustment.orderId !== args.orderId ||
      priorAdjustment.orderItemId ||
      priorAdjustment.reason !== args.reason.trim() ||
      !priorAdjustment.metadata?.wholeOrder
    )) {
      throw new Error("Idempotency key was already used with a different order correction");
    }
    const { attempt } = await getOrCreateIdempotencyAttempt(prisma, {
      key: `order-adjustment:${key}`,
      requestPath: "voidOrder",
      requestParams: { orderId: args.orderId, reason: args.reason.trim(), managerApprovalId: args.managerApprovalId },
    });
    const result = await prisma.$transaction(async (tx: any) => {
      const existing = await tx.orderAdjustment.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        if (
          existing.orderId !== args.orderId ||
          existing.orderItemId ||
          existing.reason !== args.reason.trim() ||
          !existing.metadata?.wholeOrder
        ) {
          throw new Error("Idempotency key was already used with a different order correction");
        }
        return { adjustment: existing, replay: true };
      }
      const order = await tx.restaurantOrder.findUnique({ where: { id: args.orderId } });
      if (!order) throw new Error("Order not found");
      const successfulPayments = await tx.payment.count({ where: { orderId: order.id, status: "succeeded" } });
      if (successfulPayments > 0) throw new Error("Paid orders must be refunded before cancellation");
      const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
      const amount = getOrderItemsSubtotal(items);
      const adjustment = await tx.orderAdjustment.create({
        data: {
          idempotencyKey: key,
          type: "void",
          amount,
          reason: args.reason.trim(),
          metadata: {
            wholeOrder: true,
            originalSubtotal: order.subtotal,
            originalTax: order.tax,
            originalTotal: order.total,
            managerApprovalId: args.managerApprovalId,
          },
          orderId: order.id,
          actorId: context.session?.itemId || null,
          approvedById: null,
        },
      });
      const approval = await consumeManagerApproval(tx, {
        approvalId: args.managerApprovalId,
        actorId: context.session?.itemId,
        actionType: "void_order",
        targetId: args.orderId,
        reason: args.reason,
        amount: null,
        entityType: "OrderAdjustment",
        entityId: adjustment.id,
      });
      for (const item of items.filter((candidate: any) => !candidate.isVoided)) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            isVoided: true,
            voidedAt: new Date(),
            voidReason: args.reason.trim(),
            voidedById: context.session?.itemId || null,
            approvedById: approval.approvedById,
          },
        });
      }
      const approvedAdjustment = await tx.orderAdjustment.update({
        where: { id: adjustment.id },
        data: { approvedById: approval.approvedById },
      });
      await tx.restaurantOrder.update({ where: { id: order.id }, data: { status: "cancelled" } });
      await appendAuditEventWithClient(tx, context.session?.itemId, {
        eventKey: `order-adjustment:${adjustment.id}`,
        eventType: "order.voided",
        entityType: "RestaurantOrder",
        entityId: args.orderId,
        reason: args.reason,
        after: { status: "cancelled", adjustedAmount: amount },
        approverId: approval.approvedById,
        metadata: { adjustmentId: adjustment.id, idempotencyKey: key, managerApprovalId: args.managerApprovalId },
      });
      return { adjustment: approvedAdjustment, replay: false };
    }, { isolationLevel: "Serializable" });

    if (!result.replay) await syncKitchenTicketsForOrder(args.orderId, context);
    await updateIdempotencyAttempt(prisma, attempt.id, "completed", {
      adjustmentId: result.adjustment.id,
      orderId: args.orderId,
      adjustedAmount: result.adjustment.amount,
    }, 200);
    return { success: true, requiresManagerApproval: false, adjustedAmount: result.adjustment.amount, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, requiresManagerApproval: message.toLowerCase().includes("manager approval"), adjustedAmount: null, error: message };
  }
}
