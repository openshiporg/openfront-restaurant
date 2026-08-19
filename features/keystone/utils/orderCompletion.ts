import type { Context } from ".keystone/types";
import { appendAuditEventWithClient } from "./audit";
import { syncKitchenTicketsForOrder } from "./kitchenTicketSync";
import { depleteInventoryForCompletedOrder } from "./inventoryLedger";

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
    include: { payments: { select: { amount: true, status: true } } },
  });
  if (!order) throw new Error("Order not found");
  const paid = order.payments
    .filter((payment: any) => payment.status === "succeeded")
    .reduce((sum: number, payment: any) => sum + cents(payment.amount), 0);
  if (paid < cents(order.total)) return false;
  if (order.status === "cancelled") throw new Error("A cancelled order cannot be completed");
  if (order.status !== "completed") {
    await prisma.restaurantOrder.update({ where: { id: orderId }, data: { status: "completed" } });
    await appendAuditEventWithClient(prisma, actorId, {
      eventKey: `order-completed-after-payment:${orderId}`,
      eventType: "order.completed_after_payment",
      entityType: "RestaurantOrder",
      entityId: orderId,
      before: { status: order.status },
      after: { status: "completed", paid, total: order.total },
    });
  }
  return true;
}

export async function reconcileCompletedOrderOperations(orderId: string, context: Context) {
  const order = await context.sudo().query.RestaurantOrder.findOne({
    where: { id: orderId },
    query: "id status tables { id }",
  });
  if (!order || order.status !== "completed") return;
  await syncKitchenTicketsForOrder(orderId, context);
  await depleteInventoryForCompletedOrder(orderId, context);
  await Promise.all((order.tables || []).map((table: any) =>
    context.sudo().db.Table.updateOne({ where: { id: table.id }, data: { status: "cleaning" } })
  ));
}

export async function finalizePaidOrder(orderId: string, context: Context) {
  const finalized = await (context.prisma as any).$transaction(
    (tx: any) => finalizePaidOrderWithClient(tx, orderId, context.session?.itemId),
    { isolationLevel: "Serializable" }
  );
  if (finalized) await reconcileCompletedOrderOperations(orderId, context);
  return finalized;
}
