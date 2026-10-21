import { appendAuditEventWithClient } from './audit';
export async function freezeOrderPricingPolicy(tx: any, orderId: string, input: any, actorId?: string | null) {
  const taxRate = Number(input?.taxRate || 0);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new Error('Invalid order tax policy');
  const policy = { version: 1, taxRate, currencyCode: String(input?.currencyCode || 'USD'), deliveryFee: input?.deliveryFee ?? null, deliveryMinimum: input?.deliveryMinimum ?? null, pickupDiscount: input?.pickupDiscount ?? null, serviceCharge: 0, taxBasis: 'item-subtotal-before-discount', voluntaryTip: true, legacyInferred: Boolean(input?.legacyInferred) };
  const event = await appendAuditEventWithClient(tx, actorId, { eventKey: `pricing-policy:${orderId}`, eventType: 'order.pricing_policy', entityType: 'RestaurantOrder', entityId: orderId, after: policy });
  return event.after;
}
export async function getOrderPricingPolicy(tx: any, orderId: string, fallback?: any) {
  const existing = await tx.auditEvent.findUnique({ where: { eventKey: `pricing-policy:${orderId}` } });
  if (existing) return existing.after;
  const order = await tx.restaurantOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('Order not found');
  // Legacy checks retain their assessed effective rate, with explicit provenance.
  // No assertion that this reconstructs a historical jurisdiction's policy.
  return freezeOrderPricingPolicy(tx, orderId, { ...fallback, currencyCode: order.currencyCode, taxRate: order.subtotal > 0 ? Number(order.tax) * 100 / Number(order.subtotal) : fallback?.taxRate || 0, legacyInferred: true });
}
export function recordedDeliveryCharge(order: any) {
  return order.orderType === 'delivery' ? Math.max(0, Number(order.total) - Number(order.subtotal) - Number(order.tax) - Number(order.tip || 0) + Number(order.discount || 0)) : 0;
}
