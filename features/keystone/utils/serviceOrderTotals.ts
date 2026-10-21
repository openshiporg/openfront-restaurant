import { getOrderPricingPolicy, recordedDeliveryCharge } from "./orderPricingPolicy";
import { calculateRestaurantTotals } from "../../lib/restaurant-order-pricing";
import { getOrderItemsSubtotal } from "./orderItemFinancials";
export async function recalculateServiceOrder(tx: any, orderId: string, settings: any) {
  const order = await tx.restaurantOrder.findUnique({ where: { id: orderId }, include: { orderItems: true } });
  if (!order) throw new Error("Order not found");
  const policy = await getOrderPricingPolicy(tx, orderId, settings);
  const subtotal = getOrderItemsSubtotal(order.orderItems);
  const { tax } = calculateRestaurantTotals({ subtotal, orderType: order.orderType || "dine_in", taxRate: policy.taxRate, currencyCode: order.currencyCode });
  return tx.restaurantOrder.update({ where: { id: orderId }, data: {
    subtotal, tax, total: Math.max(0, subtotal + tax + recordedDeliveryCharge(order) + Number(order.tip || 0) - Number(order.discount || 0)),
  } });
}
