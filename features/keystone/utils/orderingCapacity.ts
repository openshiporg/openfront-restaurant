/** Runs inside the same serializable transaction that reserves a new checkout.
 * Existing uncertain quotes consume capacity until explicitly reconciled/cancelled. */
export async function assertOnlineOrderingCapacity(tx: any) {
  const settings = await tx.storeSettings.findUnique({ where: { id: 1 }, select: { hours: true } });
  const raw = settings?.hours?._ordering?.maxActiveOnlineOrders;
  if (raw == null || raw === 0) return;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid active online-order capacity setting');
  const active = await tx.restaurantOrder.count({ where: { orderSource: 'online', status: { in: ['open', 'sent_to_kitchen', 'in_progress', 'ready', 'dispatched'] } } });
  const reserved = await tx.paymentSession.count({ where: { isSelected: true, paymentCollection: { cart: { orderId: null } }, OR: ['initializing', 'provider_pending', 'ready', 'unknown', 'finalizing', 'cancelling'].map(state => ({ data: { path: ['state'], equals: state } })) } });
  if (active + reserved >= limit) throw new Error('The restaurant is at its online order limit. Please retry later or contact the restaurant');
}
