import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { appendAuditEventWithClient } from "../utils/audit";
import { appendKitchenTicketEventWithClient } from "../utils/kitchenTicketEvents";
import { syncKitchenTicketsForOrder } from "../utils/kitchenTicketSync";
import { reconcileCompletedOrderOperations } from "../utils/orderCompletion";
import { assertServiceTransition, serviceTransaction } from "../utils/serviceOrderState";

export default async function transitionRestaurantOrder(
  _root: unknown,
  { orderId, status, reason }: { orderId: string; status: string; reason?: string | null },
  context: Context
) {
  if (!permissions.canManageOrders({ session: context.session })) throw new Error("Not authorized to transition orders");
  const updated = await serviceTransaction(context.prisma, async tx => {
    const order = await tx.restaurantOrder.findUnique({ where: { id: orderId }, include: { payments: true, orderItems: { select: { id: true, isVoided: true } }, courses: { where: { orderItems: { some: { isVoided: false } } } } } });
    if (!order) throw new Error("Order not found");
    const tickets = await tx.kitchenTicket.findMany({ where: { orderId }, include: { orderItems: { select: { id: true } } } });
    assertServiceTransition(order, status, tickets);
    if (order.orderType === "delivery" && (["dispatched", "served"].includes(status) || order.status === "dispatched") && (!reason?.trim() || reason.trim().length < 3)) throw new Error("Record the courier handoff or delivery confirmation reference");
    if (order.status === status) return order;
    if (["dispatched", "served"].includes(status)) {
      const readyTickets = await tx.kitchenTicket.findMany({ where: { orderId, status: "ready" }, include: { orderItems: { select: { id: true } } } });
      for (const ticket of readyTickets) {
        const now = new Date();
        await tx.kitchenTicket.update({ where: { id: ticket.id }, data: { status: "served", servedAt: now, items: (ticket.items || []).map((item: any) => item.status === "cancelled" ? item : { ...item, status: "fulfilled", fulfilledAt: item.fulfilledAt || now.toISOString() }) } });
        await tx.orderItem.updateMany({ where: { id: { in: ticket.orderItems.map((item: any) => item.id) }, isVoided: false }, data: { kitchenStatus: "fulfilled", fulfilledAt: now } });
        await appendKitchenTicketEventWithClient(tx, context.session?.itemId, { eventType: "status", ticketId: ticket.id, orderId, payload: { from: "ready", to: "served", source: "operator_handoff", reason: reason || "" } });
      }
    }
    const result = await tx.restaurantOrder.update({ where: { id: orderId }, data: { status } });
    await appendAuditEventWithClient(tx, context.session?.itemId, {
      eventType: "order.status_transitioned", entityType: "RestaurantOrder", entityId: orderId,
      reason: reason || "", before: { status: order.status }, after: { status },
    });
    return result;
  });
  if (["completed", "cancelled"].includes(status)) await reconcileCompletedOrderOperations(orderId, context);
  else await syncKitchenTicketsForOrder(orderId, context);
  return updated;
}
