import type { Context } from ".keystone/types";
import { permissions } from "../access";
import { appendAuditEvent } from "../utils/audit";
import { syncKitchenTicketsForOrder } from "../utils/kitchenTicketSync";

const TRANSITIONS: Record<string, string[]> = {
  open: ["sent_to_kitchen", "cancelled"],
  sent_to_kitchen: ["in_progress", "cancelled"],
  in_progress: ["ready", "cancelled"],
  ready: ["served", "cancelled"],
  served: ["completed"],
  completed: [],
  cancelled: [],
};

export default async function transitionRestaurantOrder(
  _root: unknown,
  { orderId, status, reason }: { orderId: string; status: string; reason?: string | null },
  context: Context
) {
  if (!permissions.canManageOrders({ session: context.session })) throw new Error("Not authorized to transition orders");
  const order = await context.sudo().query.RestaurantOrder.findOne({
    where: { id: orderId },
    query: "id status",
  });
  if (!order) throw new Error("Order not found");
  if (!(TRANSITIONS[order.status || ""] || []).includes(status)) {
    throw new Error(`Order cannot transition from ${order.status} to ${status}`);
  }
  if (status === "cancelled") {
    throw new Error("Use the approved void/cancellation workflow to cancel an order");
  }
  const updated = await context.sudo().query.RestaurantOrder.updateOne({
    where: { id: orderId },
    data: { status },
    query: "id status",
  });
  await appendAuditEvent(context, {
    eventType: "order.status_transitioned",
    entityType: "RestaurantOrder",
    entityId: orderId,
    reason: reason || "",
    before: { status: order.status },
    after: { status },
  }).catch((error) => console.error("Order transition audit event failed:", error));
  await syncKitchenTicketsForOrder(orderId, context);
  return updated;
}
