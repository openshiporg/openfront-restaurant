import type { Context } from ".keystone/types";
import { appendAuditEvent, appendAuditEventWithClient } from "./audit";
import { syncKitchenTicketsForOrder } from "./kitchenTicketSync";
import { depleteInventoryForCompletedOrder } from "./inventoryLedger";
import { reconcileClosedOrderTables } from "./tableOccupancy";

function cents(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

export async function finalizePaidOrderWithClient(
  prisma: any,
  orderId: string,
  actorId: string | null | undefined
) {
  const order = await prisma.restaurantOrder.findUnique({
    where: { id: orderId },
    include: { payments: { select: { amount: true, status: true, refundedAmount: true } } },
  });
  if (!order) throw new Error("Order not found");
  // Payment is a financial fact. Preparation, handoff and check closure are
  // explicitly advanced by restaurant service operations, never by a tender.
  const paid = order.payments
    .filter((payment: any) => ["succeeded", "partially_refunded", "refunded"].includes(payment.status))
    .reduce((sum: number, payment: any) => sum + Math.max(0, cents(payment.amount) - cents(payment.refundedAmount)), 0);
  if (paid < cents(order.total)) return false;
  if (order.status === "cancelled") throw new Error("A cancelled order cannot accept settlement");
  await appendAuditEventWithClient(prisma, actorId, {
    eventKey: `order-paid:${orderId}`,
    eventType: "order.paid",
    entityType: "RestaurantOrder",
    entityId: orderId,
    after: { serviceStatus: order.status, paid, total: order.total },
  });
  return true;
}

export async function reconcileCompletedOrderOperations(orderId: string, context: Context) {
  const order = await context.sudo().query.RestaurantOrder.findOne({
    where: { id: orderId },
    query: "id status tables { id }",
  });
  if (!order || !['completed', 'cancelled'].includes(order.status)) return;
  // Service has already committed. Keep cleanup independent and persist failed
  // work so a transient inventory problem never pretends payment/service failed.
  for (const [operation, run] of [
    ['kitchen', () => syncKitchenTicketsForOrder(orderId, context)],
    ['inventory', () => depleteInventoryForCompletedOrder(orderId, context)],
    ['tables', () => reconcileClosedOrderTables(orderId, context)],
  ] as const) {
    try {
      await run();
      await appendAuditEvent(context, { eventType: 'operations.reconciled', entityType: 'RestaurantOrder', entityId: orderId, after: { operation } });
    } catch (error) {
      await appendAuditEvent(context, { eventType: 'operations.recovery_required', entityType: 'RestaurantOrder', entityId: orderId, after: { operation, error: error instanceof Error ? error.message : 'Operation failed' } });
    }
  }
}

export async function finalizePaidOrder(orderId: string, context: Context) {
  const finalized = await (context.prisma as any).$transaction(
    (tx: any) => finalizePaidOrderWithClient(tx, orderId, context.session?.itemId),
    { isolationLevel: "Serializable" }
  );
  if (finalized) await reconcileCompletedOrderOperations(orderId, context);
  return finalized;
}
